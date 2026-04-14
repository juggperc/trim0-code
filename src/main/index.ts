import { randomUUID } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { app, BrowserWindow, dialog, ipcMain, Notification } from "electron";
import { AGENT_SYSTEM_PROMPT, TRIM0_PRESET } from "@shared/brand.js";
import type {
  AgentEvent,
  AutomationHistoryEntry,
  BootstrapPayload,
  ChatMessage,
  McpAuthMode,
  McpHealthResult,
  ProviderHealthResult,
  SaveAutomationInput,
  SaveMcpServerInput,
  SaveProviderInput,
} from "@shared/types.js";
import { AppDatabase } from "./db.js";
import { RuntimeClient } from "./runtime-client.js";
import { AutomationScheduler } from "./scheduler.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const isDev = !app.isPackaged;

let mainWindow: BrowserWindow | null = null;
let database: AppDatabase;
let runtime: RuntimeClient;
let scheduler: AutomationScheduler;

const MCP_TOOL_CACHE_TTL_MS = 6 * 60 * 60 * 1000;

const nowIso = () => new Date().toISOString();

const ensureSession = () => {
  const snapshot = database.getSnapshot();
  if (snapshot.sessions.length === 0) {
    database.createChat();
  }
};

const verifyProviderHealth = async (): Promise<ProviderHealthResult | undefined> => {
  const snapshot = database.getSnapshot();
  const provider =
    snapshot.providers.find((item) => item.enabled) ?? snapshot.providers[0];
  if (!provider?.apiKey) {
    return { ok: false, message: "No API key configured." };
  }

  try {
    const models = await runtime.fetchModels(provider);
    if (models.length === 0) {
      return { ok: false, message: "OpenRouter returned no models. Check your key and base URL." };
    }
    return { ok: true, modelCount: models.length };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Provider check failed.",
    };
  }
};

const refreshStaleMcpServers = async () => {
  const stale = database.listMcpServersWithStaleToolCache(MCP_TOOL_CACHE_TTL_MS);
  for (const server of stale) {
    try {
      const result = await runtime.discoverMcpTools(server);
      database.saveMcpServer({
        ...server,
        toolCache: result.tools,
        toolCacheUpdatedAt: nowIso(),
      });
    } catch {
      // Discovery can fail when the server is offline; leave cache as-is.
    }
  }
};

const getBootstrapPayload = async (): Promise<BootstrapPayload> => {
  ensureSession();
  await refreshStaleMcpServers();

  const snapshot = database.getSnapshot();
  const activeSessionId =
    snapshot.activeSessionId || snapshot.sessions[0]?.id || database.createChat().session.id;
  const activeChat = activeSessionId ? database.getPrefetchedChat(activeSessionId) : undefined;

  const providerHealth = await verifyProviderHealth();

  const mcpHealth: McpHealthResult[] = [];
  for (const server of snapshot.mcpServers.filter((item) => item.enabled)) {
    try {
      const result = await runtime.checkMcpHealth(server);
      mcpHealth.push({
        serverId: server.id,
        ok: result.ok,
        message: result.message,
      });
    } catch (error) {
      mcpHealth.push({
        serverId: server.id,
        ok: false,
        message: error instanceof Error ? error.message : "Health check failed.",
      });
    }
  }

  return {
    snapshot: database.getSnapshot(),
    activeChat,
    providerHealth,
    mcpHealth,
  };
};

const pendingMainConfirmations = new Map<string, (approved: boolean) => void>();

const getWorkspacePathForSession = (workspaceId: string | null) => {
  if (!workspaceId) {
    return null;
  }

  return database.getSnapshot().workspaces.find((workspace) => workspace.id === workspaceId)?.path ?? null;
};

const runSessionPrompt = async (
  sessionId: string,
  content: string,
  runId: string,
  emitEvents = true,
) => {
  const prefetched = database.getPrefetchedChat(sessionId);
  const snapshot = database.getSnapshot();
  const session = prefetched.session;
  const provider =
    snapshot.providers.find((item) => item.id === session.providerId) ?? snapshot.providers[0];

  if (!provider) {
    throw new Error("No provider is configured.");
  }

  database.createAgentRun({ id: runId, sessionId, prompt: content, startedAt: nowIso() });

  const userMessage: ChatMessage = {
    id: randomUUID(),
    sessionId,
    role: "user",
    content,
    createdAt: nowIso(),
    metadata: {
      workspaceId: session.workspaceId,
    },
  };
  database.saveMessage(userMessage);

  const runtimeResponse = await runtime.runAgent(
    {
      runId,
      sessionId,
      workspacePath: getWorkspacePathForSession(session.workspaceId),
      model: session.model,
      messages: [...prefetched.messages, userMessage],
      provider,
      mcpServers: snapshot.mcpServers.filter(
        (server) => session.enabledMcpServerIds.includes(server.id) && server.enabled,
      ),
      systemPrompt: AGENT_SYSTEM_PROMPT,
    },
    emitEvents
      ? (event: AgentEvent) => {
          mainWindow?.webContents.send("agent:event", event);
        }
      : undefined,
    emitEvents
      ? async (confirmationId, toolName, args) => {
          mainWindow?.webContents.send("agent:event", {
            runId,
            type: "confirmation-required",
            toolName,
            args,
            timestamp: nowIso(),
            confirmationId,
          } satisfies AgentEvent);
          return new Promise<boolean>((resolve) => {
            pendingMainConfirmations.set(confirmationId, resolve);
          });
        }
      : undefined
  );

  const assistantMessage: ChatMessage = {
    id: randomUUID(),
    sessionId,
    role: "assistant",
    content: runtimeResponse.content,
    createdAt: nowIso(),
    metadata: {
      runId,
      workspaceId: session.workspaceId,
    },
  };

  database.saveMessage(assistantMessage);
  if (runtimeResponse.diffs.length > 0) {
    database.saveDiffs(runtimeResponse.diffs);
  }

  let sessionTitleAfterRun: string | undefined;
  if (session.title === "New chat") {
    const nextTitle = runtimeResponse.titleSuggestion || content.slice(0, 42);
    database.updateSessionTitle(sessionId, nextTitle);
    sessionTitleAfterRun = nextTitle;
  }

  const finalEvent: AgentEvent = {
    runId,
    type: "assistant-final",
    message: assistantMessage,
    diffs: runtimeResponse.diffs,
    ...(sessionTitleAfterRun !== undefined ? { sessionTitle: sessionTitleAfterRun } : {}),
    timestamp: nowIso(),
  };
  if (emitEvents) {
    mainWindow?.webContents.send("agent:event", finalEvent);
  }

  database.completeAgentRun(runId, assistantMessage.content, runtimeResponse.events);

  return {
    runId,
    assistantMessage,
    diffs: runtimeResponse.diffs,
  };
};

const runAutomation = async (automationId: string, nextRunAt?: string) => {
  const automation = database.listAutomations().find((item) => item.id === automationId);
  if (!automation) {
    return;
  }

  const historyEntry: AutomationHistoryEntry = {
    id: randomUUID(),
    startedAt: nowIso(),
    status: "running",
    summary: "Starting automation run…",
  };

  try {
    const session = database.createChatRecord(
      automation.workspaceId,
      `Auto: ${automation.name}`,
      automation.providerId,
      automation.model,
      automation.enabledMcpServerIds,
    );
    const result = await runSessionPrompt(session.id, automation.prompt, randomUUID(), false);
    historyEntry.status = "success";
    historyEntry.endedAt = nowIso();
    historyEntry.summary = result.assistantMessage.content.slice(0, 140);
    database.markAutomationRun(automationId, historyEntry, nextRunAt ?? scheduler.nextRunAt(automation.schedule));
  } catch (error) {
    historyEntry.status = "failed";
    historyEntry.endedAt = nowIso();
    historyEntry.summary =
      error instanceof Error ? error.message : "Automation failed unexpectedly.";
    database.markAutomationRun(automationId, historyEntry, nextRunAt ?? scheduler.nextRunAt(automation.schedule));
    if (Notification.isSupported()) {
      new Notification({
        title: "Automation failed",
        body: `${automation.name}: ${historyEntry.summary}`,
      }).show();
    }
  }
};

const createWindow = async () => {
  mainWindow = new BrowserWindow({
    width: 1600,
    height: 980,
    minWidth: 1180,
    minHeight: 760,
    title: "trim0.code",
    backgroundColor: "#ffffff",
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "..", "preload", "index.js"),
      contextIsolation: true,
      nodeIntegration: false,
      devTools: true,
    },
  });

  if (isDev) {
    await mainWindow.loadURL("http://127.0.0.1:5173");
  } else {
    await mainWindow.loadFile(path.join(app.getAppPath(), "dist", "index.html"));
  }
};

const registerIpc = () => {
  ipcMain.handle("bootstrap", async () => getBootstrapPayload());

  ipcMain.handle("workspace:open", async () => {
    const result = await dialog.showOpenDialog(mainWindow!, {
      properties: ["openDirectory"],
      title: "Open Folder",
    });

    if (!result.canceled && result.filePaths[0]) {
      database.openWorkspace(result.filePaths[0]);
    }

    return getBootstrapPayload();
  });

  ipcMain.handle("chat:search", async (_event, query: string) => database.searchChatHistory(query));

  ipcMain.handle(
    "chat:set-workspace",
    async (_event, sessionId: string, workspaceId: string | null) =>
      database.setSessionWorkspace(sessionId, workspaceId),
  );

  ipcMain.handle("chat:create", async () => {
    const chat = database.createChat();
    return chat;
  });

  ipcMain.handle("chat:delete", async (_event, sessionId: string) => {
    database.deleteSession(sessionId);
    return getBootstrapPayload();
  });

  ipcMain.handle("chat:prefetch", async (_event, sessionId: string) => {
    return database.getPrefetchedChat(sessionId);
  });

  ipcMain.handle("agent:send", async (_event, input: { sessionId: string; content: string }) => {
    const runId = randomUUID();
    mainWindow?.webContents.send("agent:event", {
      runId,
      type: "status",
      message: "Queued agent run…",
      timestamp: nowIso(),
    } satisfies AgentEvent);

    void (async () => {
      try {
        await runSessionPrompt(input.sessionId, input.content, runId, true);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Agent run failed.";
        database.failAgentRun(runId, errorMessage, []);
        mainWindow?.webContents.send("agent:event", {
          runId,
          type: "error",
          message: errorMessage,
          timestamp: nowIso(),
        } satisfies AgentEvent);
      }
    })();

    return { runId };
  });

  ipcMain.handle("agent:confirm", async (_event, confirmationId: string, approved: boolean) => {
    const resolver = pendingMainConfirmations.get(confirmationId);
    if (resolver) {
      resolver(approved);
      pendingMainConfirmations.delete(confirmationId);
    }
  });

  ipcMain.handle("provider:save", async (_event, input: SaveProviderInput) => {
    const provider = database.saveProvider(input);
    return provider;
  });

  ipcMain.handle("provider:models", async () => {
    const provider =
      database.getSnapshot().providers.find((item) => item.enabled) ?? database.getSnapshot().providers[0];
    return provider ? runtime.fetchModels(provider) : [];
  });

  ipcMain.handle("trim0:license", async (_event, licenseKey: string, authMode: McpAuthMode) => {
    const current = database
      .getSnapshot()
      .mcpServers.find((item) => item.id === TRIM0_PRESET.id) ?? TRIM0_PRESET;
    return database.saveMcpServer({
      ...current,
      licenseKey,
      authMode,
      enabled: true,
    });
  });

  ipcMain.handle("mcp:save", async (_event, input: SaveMcpServerInput) => {
    return database.saveMcpServer(input);
  });

  ipcMain.handle("mcp:discover", async (_event, serverId: string) => {
    const server = database.getSnapshot().mcpServers.find((item) => item.id === serverId);
    if (!server) {
      throw new Error(`MCP server not found: ${serverId}`);
    }

    const result = await runtime.discoverMcpTools(server);
    database.saveMcpServer({
      ...server,
      toolCache: result.tools,
      toolCacheUpdatedAt: nowIso(),
    });
    return result;
  });

  ipcMain.handle("automation:save", async (_event, input: SaveAutomationInput) => {
    const nextRunAt = input.status === "active" ? scheduler.nextRunAt(input.schedule) : undefined;
    const automation = database.saveAutomation({
      ...input,
    });
    database.setAutomationNextRun(automation.id, nextRunAt);
    scheduler.sync(database.listAutomations());
    return database.listAutomations().find((item) => item.id === automation.id)!;
  });

  ipcMain.handle("automation:delete", async (_event, automationId: string) => {
    database.deleteAutomation(automationId);
    scheduler.sync(database.listAutomations());
  });

  ipcMain.handle("automation:run", async (_event, automationId: string) => {
    await runAutomation(automationId);
    scheduler.sync(database.listAutomations());
  });
};

app.whenReady().then(async () => {
  database = new AppDatabase(path.join(app.getPath("userData"), "trim0-code.db"));
  runtime = new RuntimeClient();
  scheduler = new AutomationScheduler(runAutomation);

  await runtime.start();
  scheduler.sync(database.listAutomations());
  registerIpc();

  setInterval(() => {
    void refreshStaleMcpServers();
  }, 15 * 60 * 1000);

  await createWindow();

  app.on("activate", async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      await createWindow();
    }
  });
});

app.on("window-all-closed", async () => {
  if (process.platform !== "darwin") {
    scheduler.stopAll();
    await runtime.stop();
    database.close();
    app.quit();
  }
});
