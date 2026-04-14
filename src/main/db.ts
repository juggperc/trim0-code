import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import {
  DEFAULT_PROVIDER,
  OPENROUTER_DEFAULT_MODEL,
  TRIM0_PRESET,
} from "../shared/brand.js";
import type {
  AgentEvent,
  AppSnapshot,
  AutomationDefinition,
  AutomationHistoryEntry,
  ChatMessage,
  ChatSession,
  DiffSnapshot,
  McpServerConfig,
  PrefetchedChat,
  ProviderConfig,
  SaveAutomationInput,
  SaveMcpServerInput,
  SaveProviderInput,
  WorkspaceRecord,
} from "../shared/types.js";

type SqliteRow = Record<string, unknown>;

const json = (value: unknown) => JSON.stringify(value ?? null);
const parseJson = <T>(value: unknown, fallback: T): T => {
  if (typeof value !== "string" || value.trim() === "") {
    return fallback;
  }

  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
};

const nowIso = () => new Date().toISOString();

export class AppDatabase {
  private readonly db: Database.Database;

  constructor(dbPath: string) {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    this.db = new Database(dbPath);
    this.db.pragma("journal_mode = WAL");
    this.initialize();
  }

  private initialize() {
    this.db.exec(`
      create table if not exists meta (
        key text primary key,
        value text not null
      );

      create table if not exists provider_configs (
        id text primary key,
        kind text not null,
        label text not null,
        api_key text not null,
        base_url text not null,
        default_model text not null,
        headers_json text not null,
        enabled integer not null
      );

      create table if not exists mcp_servers (
        id text primary key,
        kind text not null,
        label text not null,
        command text,
        url text,
        args_json text not null,
        env_json text not null,
        auth_mode text not null,
        enabled integer not null,
        tool_cache_json text not null,
        tool_cache_updated_at text,
        built_in_slug text,
        license_key text
      );

      create table if not exists workspaces (
        id text primary key,
        path text not null unique,
        name text not null,
        last_opened_at text not null
      );

      create table if not exists chat_sessions (
        id text primary key,
        workspace_id text,
        title text not null,
        provider_id text not null,
        model text not null,
        enabled_mcp_server_ids_json text not null,
        created_at text not null,
        updated_at text not null
      );

      create table if not exists chat_messages (
        id text primary key,
        session_id text not null,
        role text not null,
        content text not null,
        created_at text not null,
        metadata_json text
      );

      create table if not exists diff_snapshots (
        id text primary key,
        session_id text not null,
        workspace_id text,
        file_path text not null,
        before_text text not null,
        after_text text not null,
        patch text not null,
        created_at text not null,
        run_id text not null
      );

      create table if not exists automations (
        id text primary key,
        name text not null,
        prompt text not null,
        workspace_id text,
        provider_id text not null,
        model text not null,
        schedule text not null,
        enabled_mcp_server_ids_json text not null,
        status text not null,
        last_run_at text,
        next_run_at text,
        history_json text not null
      );

      create table if not exists agent_runs (
        id text primary key,
        session_id text not null,
        status text not null,
        prompt text not null,
        started_at text not null,
        ended_at text,
        summary text,
        event_log_json text not null
      );
    `);

    this.migrate();
    this.seedDefaults();
  }

  private migrate() {
    const columns = this.db.prepare("pragma table_info(mcp_servers)").all() as Array<{ name: string }>;
    if (!columns.some((column) => column.name === "tool_cache_updated_at")) {
      this.db.exec("alter table mcp_servers add column tool_cache_updated_at text");
      this.db.exec(
        "update mcp_servers set tool_cache_updated_at = datetime('now') where tool_cache_updated_at is null",
      );
    }

    const ftsExists = this.db
      .prepare("select name from sqlite_master where type='table' and name='chat_messages_fts'")
      .get() as { name?: string } | undefined;
    if (!ftsExists) {
      this.ensureChatMessagesFts();
    }
  }

  /**
   * FTS5 tokenizer support varies by SQLite build (e.g. some Windows Electron builds
   * omit unicode61). Try the richest tokenizer first, then fall back so startup never throws.
   */
  private ensureChatMessagesFts() {
    const tokenizers = ["porter unicode61", "porter", "unicode61", ""];
    let lastError: unknown;

    for (const tokenize of tokenizers) {
      const tokenizeClause = tokenize ? `,\n          tokenize = '${tokenize}'` : "";
      try {
        this.db.exec("begin");
        this.db.exec(`
          create virtual table chat_messages_fts using fts5(
            session_id unindexed,
            message_id unindexed,
            content${tokenizeClause}
          );

          insert into chat_messages_fts(session_id, message_id, content)
          select session_id, id, content from chat_messages
          where role in ('user', 'assistant');

          create trigger chat_messages_ai_fts after insert on chat_messages
          when new.role in ('user', 'assistant')
          begin
            insert into chat_messages_fts(session_id, message_id, content)
            values (new.session_id, new.id, new.content);
          end;

          create trigger chat_messages_ad_fts after delete on chat_messages
          begin
            delete from chat_messages_fts where message_id = old.id;
          end;

          create trigger chat_messages_au_fts after update of content, session_id, role on chat_messages
          begin
            delete from chat_messages_fts where message_id = old.id;
            insert into chat_messages_fts(session_id, message_id, content)
            select new.session_id, new.id, new.content
            where new.role in ('user', 'assistant');
          end;
        `);
        this.db.exec("commit");
        return;
      } catch (error) {
        lastError = error;
        try {
          this.db.exec("rollback");
        } catch {
          // ignore rollback errors
        }
        try {
          this.db.exec("drop table if exists chat_messages_fts");
        } catch {
          // ignore
        }
      }
    }

    console.warn(
      "[trim0.code] FTS5 chat index unavailable; session search will be disabled until SQLite supports it.",
      lastError,
    );
  }

  private seedDefaults() {
    const providerCount = this.db
      .prepare("select count(*) as count from provider_configs")
      .get() as { count: number };
    const mcpCount = this.db
      .prepare("select count(*) as count from mcp_servers")
      .get() as { count: number };

    if (providerCount.count === 0) {
      this.saveProvider(DEFAULT_PROVIDER);
    }

    if (mcpCount.count === 0) {
      this.saveMcpServer(TRIM0_PRESET);
    }

    if (!this.getMeta("activeSessionId")) {
      this.setMeta("activeSessionId", "");
    }
    if (!this.getMeta("activeWorkspaceId")) {
      this.setMeta("activeWorkspaceId", "");
    }
  }

  close() {
    this.db.close();
  }

  private setMeta(key: string, value: string) {
    this.db
      .prepare(
        "insert into meta (key, value) values (@key, @value) on conflict(key) do update set value = excluded.value",
      )
      .run({ key, value });
  }

  private getMeta(key: string) {
    const row = this.db
      .prepare("select value from meta where key = ?")
      .get(key) as { value?: string } | undefined;
    return row?.value ?? "";
  }

  private mapProvider(row: SqliteRow): ProviderConfig {
    return {
      id: String(row.id),
      kind: "openrouter",
      label: String(row.label),
      apiKey: String(row.api_key),
      baseUrl: String(row.base_url),
      defaultModel: String(row.default_model),
      headers: parseJson<Record<string, string>>(row.headers_json, {}),
      enabled: Boolean(row.enabled),
    };
  }

  private mapMcpServer(row: SqliteRow): McpServerConfig {
    return {
      id: String(row.id),
      kind: row.kind as McpServerConfig["kind"],
      label: String(row.label),
      command: row.command ? String(row.command) : undefined,
      url: row.url ? String(row.url) : undefined,
      args: parseJson<string[]>(row.args_json, []),
      env: parseJson<Record<string, string>>(row.env_json, {}),
      authMode: row.auth_mode as McpServerConfig["authMode"],
      enabled: Boolean(row.enabled),
      toolCache: parseJson(row.tool_cache_json, []),
      toolCacheUpdatedAt: row.tool_cache_updated_at ? String(row.tool_cache_updated_at) : undefined,
      builtInSlug: row.built_in_slug ? String(row.built_in_slug) : undefined,
      licenseKey: row.license_key ? String(row.license_key) : "",
    };
  }

  private mapWorkspace(row: SqliteRow): WorkspaceRecord {
    return {
      id: String(row.id),
      path: String(row.path),
      name: String(row.name),
      lastOpenedAt: String(row.last_opened_at),
    };
  }

  private mapSession(row: SqliteRow): ChatSession {
    return {
      id: String(row.id),
      workspaceId: row.workspace_id ? String(row.workspace_id) : null,
      title: String(row.title),
      providerId: String(row.provider_id),
      model: String(row.model),
      enabledMcpServerIds: parseJson(row.enabled_mcp_server_ids_json, []),
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
    };
  }

  private mapMessage(row: SqliteRow): ChatMessage {
    return {
      id: String(row.id),
      sessionId: String(row.session_id),
      role: row.role as ChatMessage["role"],
      content: String(row.content),
      createdAt: String(row.created_at),
      metadata: parseJson<Record<string, unknown> | undefined>(row.metadata_json, undefined),
    };
  }

  private mapDiff(row: SqliteRow): DiffSnapshot {
    return {
      id: String(row.id),
      sessionId: String(row.session_id),
      workspaceId: row.workspace_id ? String(row.workspace_id) : null,
      filePath: String(row.file_path),
      beforeText: String(row.before_text),
      afterText: String(row.after_text),
      patch: String(row.patch),
      createdAt: String(row.created_at),
      runId: String(row.run_id),
    };
  }

  private mapAutomation(row: SqliteRow): AutomationDefinition {
    return {
      id: String(row.id),
      name: String(row.name),
      prompt: String(row.prompt),
      workspaceId: row.workspace_id ? String(row.workspace_id) : null,
      providerId: String(row.provider_id),
      model: String(row.model),
      schedule: String(row.schedule),
      enabledMcpServerIds: parseJson(row.enabled_mcp_server_ids_json, []),
      status: row.status as AutomationDefinition["status"],
      lastRunAt: row.last_run_at ? String(row.last_run_at) : undefined,
      nextRunAt: row.next_run_at ? String(row.next_run_at) : undefined,
      history: parseJson<AutomationHistoryEntry[]>(row.history_json, []),
    };
  }

  listProviders() {
    return this.db
      .prepare("select * from provider_configs order by enabled desc, label asc")
      .all()
      .map((row) => this.mapProvider(row as SqliteRow));
  }

  listMcpServers() {
    return this.db
      .prepare("select * from mcp_servers order by built_in_slug desc, label asc")
      .all()
      .map((row) => this.mapMcpServer(row as SqliteRow));
  }

  listWorkspaces() {
    return this.db
      .prepare("select * from workspaces order by last_opened_at desc")
      .all()
      .map((row) => this.mapWorkspace(row as SqliteRow));
  }

  listSessions() {
    return this.db
      .prepare("select * from chat_sessions order by updated_at desc")
      .all()
      .map((row) => this.mapSession(row as SqliteRow));
  }

  listAutomations() {
    return this.db
      .prepare("select * from automations order by status asc, name asc")
      .all()
      .map((row) => this.mapAutomation(row as SqliteRow));
  }

  getSnapshot(): AppSnapshot {
    return {
      providers: this.listProviders(),
      mcpServers: this.listMcpServers(),
      workspaces: this.listWorkspaces(),
      sessions: this.listSessions(),
      automations: this.listAutomations(),
      activeSessionId: this.getMeta("activeSessionId") || null,
      activeWorkspaceId: this.getMeta("activeWorkspaceId") || null,
    };
  }

  searchChatHistory(query: string) {
    const raw = query.trim();
    if (!raw) {
      return [];
    }

    const tokens = raw.split(/\s+/).filter(Boolean).slice(0, 8);
    if (tokens.length === 0) {
      return [];
    }

    const ftsQuery = tokens
      .map((token) => {
        const escaped = token.replace(/"/g, '""');
        return `"${escaped}"*`;
      })
      .join(" AND ");

    try {
      const rows = this.db
        .prepare(
          `select
             f.session_id as session_id,
             cs.title as title,
             snippet(chat_messages_fts, 2, '', '', '…', 24) as snippet,
             rank
           from chat_messages_fts f
           join chat_sessions cs on cs.id = f.session_id
           where chat_messages_fts match @matchQuery
           order by rank
           limit 80`,
        )
        .all({ matchQuery: ftsQuery }) as Array<{
          session_id: string;
          title: string;
          snippet: string;
          rank: number;
        }>;

      const seen = new Set<string>();
      const hits: Array<{ sessionId: string; title: string; snippet: string }> = [];

      for (const row of rows) {
        if (seen.has(row.session_id)) {
          continue;
        }
        seen.add(row.session_id);
        hits.push({
          sessionId: row.session_id,
          title: row.title,
          snippet: row.snippet.trim(),
        });
        if (hits.length >= 20) {
          break;
        }
      }

      return hits;
    } catch {
      return [];
    }
  }

  setSessionWorkspace(sessionId: string, workspaceId: string | null) {
    const timestamp = nowIso();
    this.db
      .prepare("update chat_sessions set workspace_id = ?, updated_at = ? where id = ?")
      .run(workspaceId, timestamp, sessionId);
    return this.getPrefetchedChat(sessionId);
  }

  listMcpServersWithStaleToolCache(ttlMs: number) {
    const cutoff = Date.now() - ttlMs;
    return this.listMcpServers().filter((server) => {
      if (!server.enabled) {
        return false;
      }
      if (!server.toolCacheUpdatedAt) {
        return true;
      }
      const updated = new Date(server.toolCacheUpdatedAt).getTime();
      return Number.isFinite(updated) && updated < cutoff;
    });
  }

  getPrefetchedChat(sessionId: string): PrefetchedChat {
    const sessionRow = this.db
      .prepare("select * from chat_sessions where id = ?")
      .get(sessionId) as SqliteRow | undefined;

    if (!sessionRow) {
      throw new Error(`Chat session not found: ${sessionId}`);
    }

    const session = this.mapSession(sessionRow);
    const messages = this.db
      .prepare("select * from chat_messages where session_id = ? order by created_at asc")
      .all(sessionId)
      .map((row) => this.mapMessage(row as SqliteRow));
    const diffs = this.db
      .prepare("select * from diff_snapshots where session_id = ? order by created_at desc")
      .all(sessionId)
      .map((row) => this.mapDiff(row as SqliteRow));

    this.setMeta("activeSessionId", sessionId);
    this.setMeta("activeWorkspaceId", session.workspaceId ?? "");

    return { session, messages, diffs };
  }

  openWorkspace(workspacePath: string) {
    const existing = this.db
      .prepare("select * from workspaces where path = ?")
      .get(workspacePath) as SqliteRow | undefined;
    const timestamp = nowIso();

    if (existing) {
      this.db
        .prepare("update workspaces set last_opened_at = ? where id = ?")
        .run(timestamp, existing.id);
      this.setMeta("activeWorkspaceId", String(existing.id));
      return this.mapWorkspace({
        ...existing,
        last_opened_at: timestamp,
      });
    }

    const record: WorkspaceRecord = {
      id: randomUUID(),
      path: workspacePath,
      name: path.basename(workspacePath),
      lastOpenedAt: timestamp,
    };

    this.db
      .prepare(
        "insert into workspaces (id, path, name, last_opened_at) values (@id, @path, @name, @lastOpenedAt)",
      )
      .run(record);
    this.setMeta("activeWorkspaceId", record.id);
    return record;
  }

  createChat() {
    const providers = this.listProviders();
    const activeProvider = providers.find((provider) => provider.enabled) ?? DEFAULT_PROVIDER;
    const activeWorkspaceId = this.getMeta("activeWorkspaceId") || null;
    const enabledMcpServerIds = this.listMcpServers()
      .filter((server) => server.enabled)
      .map((server) => server.id);
    const session = this.createChatRecord(
      activeWorkspaceId,
      "New chat",
      activeProvider.id,
      activeProvider.defaultModel || OPENROUTER_DEFAULT_MODEL,
      enabledMcpServerIds,
    );

    this.setMeta("activeSessionId", session.id);
    return { session, messages: [], diffs: [] } satisfies PrefetchedChat;
  }

  createChatRecord(
    workspaceId: string | null,
    title: string,
    providerId: string,
    model: string,
    enabledMcpServerIds: string[],
  ) {
    const timestamp = nowIso();
    const session: ChatSession = {
      id: randomUUID(),
      workspaceId,
      title,
      providerId,
      model,
      enabledMcpServerIds,
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    this.db
      .prepare(
        `insert into chat_sessions
         (id, workspace_id, title, provider_id, model, enabled_mcp_server_ids_json, created_at, updated_at)
         values (@id, @workspaceId, @title, @providerId, @model, @enabledMcpServerIdsJson, @createdAt, @updatedAt)`,
      )
      .run({
        ...session,
        enabledMcpServerIdsJson: json(session.enabledMcpServerIds),
      });

    return session;
  }

  deleteSession(sessionId: string) {
    const transaction = this.db.transaction(() => {
      this.db.prepare("delete from diff_snapshots where session_id = ?").run(sessionId);
      this.db.prepare("delete from chat_messages where session_id = ?").run(sessionId);
      this.db.prepare("delete from agent_runs where session_id = ?").run(sessionId);
      this.db.prepare("delete from chat_sessions where id = ?").run(sessionId);
    });

    transaction();

    if (this.getMeta("activeSessionId") === sessionId) {
      this.setMeta("activeSessionId", "");
    }
  }

  saveMessage(message: ChatMessage) {
    this.db
      .prepare(
        `insert into chat_messages (id, session_id, role, content, created_at, metadata_json)
         values (@id, @sessionId, @role, @content, @createdAt, @metadataJson)`,
      )
      .run({
        ...message,
        metadataJson: json(message.metadata),
      });

    this.db
      .prepare("update chat_sessions set updated_at = ? where id = ?")
      .run(message.createdAt, message.sessionId);
  }

  saveDiffs(diffs: DiffSnapshot[]) {
    const insert = this.db.prepare(
      `insert into diff_snapshots
       (id, session_id, workspace_id, file_path, before_text, after_text, patch, created_at, run_id)
       values (@id, @sessionId, @workspaceId, @filePath, @beforeText, @afterText, @patch, @createdAt, @runId)`,
    );
    const transaction = this.db.transaction((items: DiffSnapshot[]) => {
      for (const diff of items) {
        insert.run(diff);
      }
    });

    transaction(diffs);
  }

  updateSessionTitle(sessionId: string, title: string) {
    this.db
      .prepare("update chat_sessions set title = ?, updated_at = ? where id = ?")
      .run(title, nowIso(), sessionId);
  }

  saveProvider(input: SaveProviderInput | ProviderConfig) {
    const record: ProviderConfig = {
      id: input.id ?? DEFAULT_PROVIDER.id,
      kind: "openrouter",
      label: input.label,
      apiKey: input.apiKey,
      baseUrl: input.baseUrl,
      defaultModel: input.defaultModel,
      headers: input.headers,
      enabled: input.enabled,
    };

    this.db
      .prepare(
        `insert into provider_configs (id, kind, label, api_key, base_url, default_model, headers_json, enabled)
         values (@id, @kind, @label, @apiKey, @baseUrl, @defaultModel, @headersJson, @enabled)
         on conflict(id) do update set
           kind = excluded.kind,
           label = excluded.label,
           api_key = excluded.api_key,
           base_url = excluded.base_url,
           default_model = excluded.default_model,
           headers_json = excluded.headers_json,
           enabled = excluded.enabled`,
      )
      .run({
        ...record,
        headersJson: json(record.headers),
        enabled: record.enabled ? 1 : 0,
      });

    return record;
  }

  saveMcpServer(input: SaveMcpServerInput | McpServerConfig) {
    const existingRow = input.id
      ? (this.db.prepare("select * from mcp_servers where id = ?").get(input.id) as SqliteRow | undefined)
      : undefined;
    const existing = existingRow ? this.mapMcpServer(existingRow) : undefined;

    const toolCache = input.toolCache ?? existing?.toolCache ?? [];
    const toolCacheUpdatedAt =
      input.toolCacheUpdatedAt ??
      (input.toolCache !== undefined ? nowIso() : existing?.toolCacheUpdatedAt);

    const record: McpServerConfig = {
      id: input.id ?? randomUUID(),
      kind: input.kind,
      label: input.label,
      command: input.command,
      url: input.url,
      args: input.args ?? [],
      env: input.env ?? {},
      authMode: input.authMode,
      enabled: input.enabled,
      toolCache,
      toolCacheUpdatedAt,
      builtInSlug: (input as McpServerConfig).builtInSlug ?? existing?.builtInSlug,
      licenseKey: input.licenseKey ?? "",
    };

    this.db
      .prepare(
        `insert into mcp_servers
         (id, kind, label, command, url, args_json, env_json, auth_mode, enabled, tool_cache_json, tool_cache_updated_at, built_in_slug, license_key)
         values (@id, @kind, @label, @command, @url, @argsJson, @envJson, @authMode, @enabled, @toolCacheJson, @toolCacheUpdatedAt, @builtInSlug, @licenseKey)
         on conflict(id) do update set
           kind = excluded.kind,
           label = excluded.label,
           command = excluded.command,
           url = excluded.url,
           args_json = excluded.args_json,
           env_json = excluded.env_json,
           auth_mode = excluded.auth_mode,
           enabled = excluded.enabled,
           tool_cache_json = excluded.tool_cache_json,
           tool_cache_updated_at = excluded.tool_cache_updated_at,
           built_in_slug = excluded.built_in_slug,
           license_key = excluded.license_key`,
      )
      .run({
        ...record,
        argsJson: json(record.args),
        envJson: json(record.env),
        toolCacheJson: json(record.toolCache),
        toolCacheUpdatedAt: record.toolCacheUpdatedAt ?? null,
        builtInSlug: record.builtInSlug ?? null,
        enabled: record.enabled ? 1 : 0,
      });

    return record;
  }

  saveAutomation(input: SaveAutomationInput) {
    const current = input.id
      ? (this.db
          .prepare("select * from automations where id = ?")
          .get(input.id) as SqliteRow | undefined)
      : undefined;
    const existing = current ? this.mapAutomation(current) : undefined;
    const record: AutomationDefinition = {
      id: input.id ?? randomUUID(),
      name: input.name,
      prompt: input.prompt,
      workspaceId: input.workspaceId,
      providerId: input.providerId,
      model: input.model,
      schedule: input.schedule,
      enabledMcpServerIds: input.enabledMcpServerIds,
      status: input.status,
      lastRunAt: existing?.lastRunAt,
      nextRunAt: existing?.nextRunAt,
      history: existing?.history ?? [],
    };

    this.db
      .prepare(
        `insert into automations
         (id, name, prompt, workspace_id, provider_id, model, schedule, enabled_mcp_server_ids_json, status, last_run_at, next_run_at, history_json)
         values (@id, @name, @prompt, @workspaceId, @providerId, @model, @schedule, @enabledMcpServerIdsJson, @status, @lastRunAt, @nextRunAt, @historyJson)
         on conflict(id) do update set
           name = excluded.name,
           prompt = excluded.prompt,
           workspace_id = excluded.workspace_id,
           provider_id = excluded.provider_id,
           model = excluded.model,
           schedule = excluded.schedule,
           enabled_mcp_server_ids_json = excluded.enabled_mcp_server_ids_json,
           status = excluded.status,
           last_run_at = excluded.last_run_at,
           next_run_at = excluded.next_run_at,
           history_json = excluded.history_json`,
      )
      .run({
        ...record,
        enabledMcpServerIdsJson: json(record.enabledMcpServerIds),
        historyJson: json(record.history),
        lastRunAt: record.lastRunAt ?? null,
        nextRunAt: record.nextRunAt ?? null,
      });

    return record;
  }

  deleteAutomation(id: string) {
    this.db.prepare("delete from automations where id = ?").run(id);
  }

  createAgentRun(run: { id: string; sessionId: string; prompt: string; startedAt: string }) {
    this.db
      .prepare(
        `insert into agent_runs (id, session_id, status, prompt, started_at, ended_at, summary, event_log_json)
         values (@id, @sessionId, 'running', @prompt, @startedAt, null, null, '[]')`,
      )
      .run(run);
  }

  completeAgentRun(id: string, summary: string, eventLog: AgentEvent[]) {
    this.db
      .prepare(
        `update agent_runs set status = 'completed', ended_at = ?, summary = ?, event_log_json = ? where id = ?`,
      )
      .run(new Date().toISOString(), summary.slice(0, 500), json(eventLog), id);
  }

  failAgentRun(id: string, summary: string, eventLog: AgentEvent[]) {
    this.db
      .prepare(
        `update agent_runs set status = 'failed', ended_at = ?, summary = ?, event_log_json = ? where id = ?`,
      )
      .run(new Date().toISOString(), summary.slice(0, 500), json(eventLog), id);
  }

  listAgentRuns(sessionId?: string) {
    const query = sessionId
      ? "select * from agent_runs where session_id = ? order by started_at desc"
      : "select * from agent_runs order by started_at desc";
    const params = sessionId ? [sessionId] : [];
    return this.db
      .prepare(query)
      .all(...params)
      .map((row) => {
        const r = row as SqliteRow;
        return {
          id: String(r.id),
          sessionId: String(r.session_id),
          status: String(r.status) as "idle" | "running" | "completed" | "failed",
          prompt: String(r.prompt),
          startedAt: String(r.started_at),
          endedAt: r.ended_at ? String(r.ended_at) : undefined,
          summary: r.summary ? String(r.summary) : undefined,
          eventLog: parseJson<AgentEvent[]>(r.event_log_json, []),
        };
      });
  }

  setAutomationNextRun(id: string, nextRunAt?: string) {
    this.db
      .prepare("update automations set next_run_at = ? where id = ?")
      .run(nextRunAt ?? null, id);
  }

  markAutomationRun(id: string, historyEntry: AutomationHistoryEntry, nextRunAt?: string) {
    const current = this.db
      .prepare("select * from automations where id = ?")
      .get(id) as SqliteRow | undefined;
    if (!current) {
      throw new Error(`Automation not found: ${id}`);
    }

    const automation = this.mapAutomation(current);
    const history = [historyEntry, ...automation.history].slice(0, 20);
    this.db
      .prepare(
        "update automations set last_run_at = ?, next_run_at = ?, history_json = ? where id = ?",
      )
      .run(
        historyEntry.startedAt,
        nextRunAt ?? null,
        json(history),
        id,
      );
  }
}
