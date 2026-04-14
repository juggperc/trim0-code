import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { spawn } from "node:child_process";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { createPatch } from "diff";
import {
  AGENT_SYSTEM_PROMPT,
  OPENROUTER_DEFAULT_BASE_URL,
} from "../shared/brand.js";
import type {
  AgentEvent,
  DiffSnapshot,
  McpServerConfig,
  ProviderConfig,
  RuntimeAgentRequest,
  RuntimeAgentResponse,
  RuntimeDiscoveryResult,
  RuntimeModelOption,
} from "../shared/types.js";

const args = process.argv.slice(2);
const portFlag = args.findIndex((value) => value === "--port");
const port = portFlag >= 0 ? Number(args[portFlag + 1]) : 47822;

const jsonResponse = (res: http.ServerResponse, status: number, body: unknown) => {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
};

const notFound = (res: http.ServerResponse) => {
  jsonResponse(res, 404, { error: "Not found" });
};

const readJson = async <T>(req: http.IncomingMessage): Promise<T> => {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.from(chunk));
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  return JSON.parse(raw) as T;
};

const nowIso = () => new Date().toISOString();

const withinWorkspace = (workspacePath: string, targetPath: string) => {
  const absoluteTarget = path.resolve(workspacePath, targetPath);
  const relative = path.relative(workspacePath, absoluteTarget);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`Path escapes the active workspace: ${targetPath}`);
  }
  return absoluteTarget;
};

const walkWorkspace = async (root: string, base = root, files: string[] = []) => {
  const entries = await fs.readdir(root, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === "node_modules" || entry.name === ".git" || entry.name === "dist" || entry.name === "dist-electron") {
      continue;
    }

    const nextPath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      await walkWorkspace(nextPath, base, files);
    } else {
      files.push(path.relative(base, nextPath).replaceAll("\\", "/"));
    }
  }
  return files;
};

const searchWorkspace = async (workspacePath: string, pattern: string) => {
  const files = await walkWorkspace(workspacePath);
  const lowerPattern = pattern.toLowerCase();
  const hits: string[] = [];

  for (const relativeFile of files.slice(0, 500)) {
    try {
      const absoluteFile = withinWorkspace(workspacePath, relativeFile);
      const content = await fs.readFile(absoluteFile, "utf8");
      const lines = content.split(/\r?\n/);
      lines.forEach((line, index) => {
        if (line.toLowerCase().includes(lowerPattern) && hits.length < 100) {
          hits.push(`${relativeFile}:${index + 1}: ${line.trim()}`);
        }
      });
    } catch {
      continue;
    }
  }

  return hits;
};

const runShell = async (command: string, cwd: string) =>
  new Promise<{ code: number | null; stdout: string; stderr: string }>((resolve) => {
    const child = spawn(command, {
      cwd,
      shell: true,
      windowsHide: true,
      env: process.env,
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString("utf8");
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString("utf8");
    });

    const timer = setTimeout(() => {
      child.kill();
      resolve({
        code: 124,
        stdout: stdout.slice(0, 12000),
        stderr: `${stderr}\nCommand timed out after 10s.`.trim(),
      });
    }, 10_000);

    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({
        code,
        stdout: stdout.slice(0, 12000),
        stderr: stderr.slice(0, 8000),
      });
    });
  });

const buildAuthHeaders = (server: McpServerConfig) => {
  if (!server.licenseKey) {
    return {};
  }

  if (server.authMode === "x-trim0-license-key") {
    return { "X-Trim0-License-Key": server.licenseKey };
  }

  if (server.authMode === "bearer") {
    return { Authorization: `Bearer ${server.licenseKey}` };
  }

  return {};
};

const withMcpClient = async <T>(
  server: McpServerConfig,
  handler: (client: Client, transport: StdioClientTransport | StreamableHTTPClientTransport) => Promise<T>,
) => {
  if (server.kind === "stdio") {
    if (!server.command) {
      throw new Error(`MCP server ${server.label} is missing a command.`);
    }

    const transport = new StdioClientTransport({
      command: server.command,
      args: server.args,
      env: server.env,
      cwd: process.cwd(),
      stderr: "pipe",
    });

    const client = new Client({ name: "trim0.code", version: "0.1.0" });
    await client.connect(transport);
    try {
      return await handler(client, transport);
    } finally {
      await transport.close();
    }
  }

  if (!server.url) {
    throw new Error(`MCP server ${server.label} is missing a URL.`);
  }

  const transport = new StreamableHTTPClientTransport(new URL(server.url), {
    requestInit: {
      headers: buildAuthHeaders(server),
    },
  });
  const client = new Client({ name: "trim0.code", version: "0.1.0" });
  await client.connect(transport);

  try {
    return await handler(client, transport);
  } finally {
    await transport.close();
  }
};

const discoverMcpTools = async (server: McpServerConfig): Promise<RuntimeDiscoveryResult> => {
  const tools = await withMcpClient(server, async (client) => {
    const result = await client.listTools();
    return result.tools.map((tool) => ({
      name: tool.name,
      description: tool.description ?? "",
      inputSchema: tool.inputSchema as Record<string, unknown> | undefined,
    }));
  });

  return { tools };
};

const callMcpTool = async (
  server: McpServerConfig,
  toolName: string,
  args: Record<string, unknown>,
) => {
    const result = await withMcpClient(server, async (client) => {
      const response = await client.callTool({
        name: toolName,
        arguments: args,
      });
      const content = response.content as Array<{ type?: string; text?: string } | Record<string, unknown>>;
      return content
        .map((item: { type?: string; text?: string } | Record<string, unknown>) =>
          "text" in item && typeof item.text === "string" ? item.text : JSON.stringify(item),
        )
        .join("\n\n");
  });

  return result;
};

const buildEvent = <T extends AgentEvent["type"]>(
  runId: string,
  type: T,
  payload: Omit<Extract<AgentEvent, { type: T }>, "runId" | "type" | "timestamp">,
): Extract<AgentEvent, { type: T }> => ({
  ...payload,
  runId,
  type,
  timestamp: nowIso(),
}) as Extract<AgentEvent, { type: T }>;

type ToolExecutionResult = {
  text: string;
  diffs: DiffSnapshot[];
};

const toolDefinitions = [
  {
    type: "function",
    function: {
      name: "list_files",
      description: "List files in the active workspace.",
      parameters: {
        type: "object",
        properties: {
          pattern: {
            type: "string",
            description: "Optional substring filter for file paths.",
          },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "read_file",
      description: "Read a file from the active workspace.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string" },
        },
        required: ["path"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search_files",
      description: "Search for a text pattern across the active workspace.",
      parameters: {
        type: "object",
        properties: {
          pattern: { type: "string" },
        },
        required: ["pattern"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "write_file",
      description: "Write a full file in the active workspace.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string" },
          content: { type: "string" },
        },
        required: ["path", "content"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "edit_file",
      description: "Replace a substring inside an active workspace file.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string" },
          find: { type: "string" },
          replace: { type: "string" },
        },
        required: ["path", "find", "replace"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "run_command",
      description: "Run a shell command in the active workspace.",
      parameters: {
        type: "object",
        properties: {
          command: { type: "string" },
        },
        required: ["command"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "call_mcp_tool",
      description: "Call an enabled MCP tool from one of the configured servers.",
      parameters: {
        type: "object",
        properties: {
          serverId: { type: "string" },
          toolName: { type: "string" },
          arguments: {
            type: "object",
            additionalProperties: true,
          },
        },
        required: ["serverId", "toolName"],
      },
    },
  },
];

const executeTool = async (
  request: RuntimeAgentRequest,
  runId: string,
  toolName: string,
  args: Record<string, unknown>,
  requestConfirmation?: (confirmationId: string, toolName: string, args: Record<string, unknown>) => Promise<boolean>
): Promise<ToolExecutionResult> => {
  const workspacePath = request.workspacePath;
  const sessionId = request.sessionId;
  const workspaceId =
    request.messages[request.messages.length - 1]?.metadata?.workspaceId as string | null | undefined;

  if (toolName !== "call_mcp_tool" && !workspacePath) {
    throw new Error("Open a folder before using workspace tools.");
  }

  if (toolName === "list_files") {
    const files = await walkWorkspace(workspacePath!);
    const pattern = typeof args.pattern === "string" ? args.pattern.toLowerCase() : "";
    const filtered = pattern
      ? files.filter((file) => file.toLowerCase().includes(pattern))
      : files;
    return {
      text: filtered.slice(0, 300).join("\n"),
      diffs: [],
    };
  }

  if (toolName === "read_file") {
    const absolutePath = withinWorkspace(workspacePath!, String(args.path));
    const contents = await fs.readFile(absolutePath, "utf8");
    return {
      text: contents.slice(0, 24000),
      diffs: [],
    };
  }

  if (toolName === "search_files") {
    const hits = await searchWorkspace(workspacePath!, String(args.pattern));
    return {
      text: hits.join("\n").slice(0, 16000),
      diffs: [],
    };
  }

  if (toolName === "write_file") {
    const relativePath = String(args.path);
    const absolutePath = withinWorkspace(workspacePath!, relativePath);
    const nextContents = String(args.content);
    let beforeText = "";
    try {
      beforeText = await fs.readFile(absolutePath, "utf8");
    } catch {
      beforeText = "";
    }

    await fs.mkdir(path.dirname(absolutePath), { recursive: true });
    await fs.writeFile(absolutePath, nextContents, "utf8");

    const diff: DiffSnapshot = {
      id: randomUUID(),
      sessionId,
      workspaceId: workspaceId ?? null,
      filePath: relativePath,
      beforeText,
      afterText: nextContents,
      patch: createPatch(relativePath, beforeText, nextContents),
      createdAt: nowIso(),
      runId,
    };

    return {
      text: `Wrote ${relativePath}`,
      diffs: [diff],
    };
  }

  if (toolName === "edit_file") {
    const relativePath = String(args.path);
    const absolutePath = withinWorkspace(workspacePath!, relativePath);
    const find = String(args.find);
    const replace = String(args.replace);
    const beforeText = await fs.readFile(absolutePath, "utf8");
    if (!beforeText.includes(find)) {
      throw new Error(`Could not find target text in ${relativePath}`);
    }

    const afterText = beforeText.replaceAll(find, replace);
    await fs.writeFile(absolutePath, afterText, "utf8");
    const diff: DiffSnapshot = {
      id: randomUUID(),
      sessionId,
      workspaceId: workspaceId ?? null,
      filePath: relativePath,
      beforeText,
      afterText,
      patch: createPatch(relativePath, beforeText, afterText),
      createdAt: nowIso(),
      runId,
    };

    return {
      text: `Updated ${relativePath}`,
      diffs: [diff],
    };
  }

  if (toolName === "run_command") {
    if (requestConfirmation) {
      const confirmationId = randomUUID();
      const approved = await requestConfirmation(confirmationId, toolName, args);
      if (!approved) {
        return {
          text: "User denied permission to execute this command.",
          diffs: [],
        };
      }
    }
    const result = await runShell(String(args.command), workspacePath!);
    return {
      text: [`exit_code=${result.code}`, result.stdout, result.stderr].filter(Boolean).join("\n"),
      diffs: [],
    };
  }

  if (toolName === "call_mcp_tool") {
    const serverId = String(args.serverId);
    const server = request.mcpServers.find((item) => item.id === serverId);
    if (!server) {
      throw new Error(`MCP server ${serverId} is not enabled.`);
    }

    const result = await callMcpTool(
      server,
      String(args.toolName),
      (args.arguments as Record<string, unknown> | undefined) ?? {},
    );
    return {
      text: result.slice(0, 24000),
      diffs: [],
    };
  }

  throw new Error(`Unknown tool: ${toolName}`);
};

const toOpenRouterMessages = (request: RuntimeAgentRequest) => [
  {
    role: "system",
    content: `${AGENT_SYSTEM_PROMPT}\n\n${request.systemPrompt || ""}`.trim(),
  },
  ...request.messages.map((message) => ({
    role: message.role,
    content: message.content,
  })),
];

const chunkAssistantText = (text: string) => {
  const chunks: string[] = [];
  let index = 0;
  while (index < text.length) {
    chunks.push(text.slice(index, index + 140));
    index += 140;
  }
  return chunks;
};

const callOpenRouter = async (
  provider: ProviderConfig,
  body: Record<string, unknown>,
) => {
  if (!provider.apiKey) {
    throw new Error("Add an OpenRouter API key in Settings before chatting.");
  }

  const response = await fetch(`${provider.baseUrl || OPENROUTER_DEFAULT_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${provider.apiKey}`,
      "Content-Type": "application/json",
      ...provider.headers,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`OpenRouter request failed with ${response.status}.`);
  }

  return (await response.json()) as {
    choices?: Array<{
      message?: {
        content?: string;
        tool_calls?: Array<{
          id: string;
          type: "function";
          function: { name: string; arguments: string };
        }>;
      };
    }>;
  };
};

const runAgent = async (
  request: RuntimeAgentRequest,
  onEvent?: (event: AgentEvent) => void,
  requestConfirmation?: (confirmationId: string, toolName: string, args: Record<string, unknown>) => Promise<boolean>
): Promise<RuntimeAgentResponse> => {
  const events: AgentEvent[] = [];
  const diffs: DiffSnapshot[] = [];
  const openRouterMessages: Array<Record<string, unknown>> = toOpenRouterMessages(request);

  const emit = (event: AgentEvent) => {
    events.push(event);
    onEvent?.(event);
  };

  emit(
    buildEvent(request.runId, "status", {
      message: request.workspacePath
        ? `Attached to ${request.workspacePath}`
        : "No folder open. The agent can still answer, but workspace tools are disabled.",
    }),
  );

  for (let step = 0; step < 6; step += 1) {
    emit(
      buildEvent(request.runId, "status", {
        message: step === 0 ? "Contacting OpenRouter…" : "Continuing tool-driven reasoning…",
      }),
    );

    const response = await callOpenRouter(request.provider, {
      model: request.model || request.provider.defaultModel,
      messages: openRouterMessages,
      tools: toolDefinitions,
      tool_choice: "auto",
    });

    const message = response.choices?.[0]?.message;
    if (!message) {
      throw new Error("OpenRouter returned an empty response.");
    }

    if (message.tool_calls?.length) {
      openRouterMessages.push({
        role: "assistant",
        content: message.content ?? "",
        tool_calls: message.tool_calls,
      });

      for (const toolCall of message.tool_calls) {
        const args = toolCall.function.arguments
          ? (JSON.parse(toolCall.function.arguments) as Record<string, unknown>)
          : {};

        emit(
          buildEvent(request.runId, "tool-start", {
            toolName: toolCall.function.name,
            args,
          }),
        );

        const result = await executeTool(request, request.runId, toolCall.function.name, args, requestConfirmation);
        diffs.push(...result.diffs);

        emit(
          buildEvent(request.runId, "tool-result", {
            toolName: toolCall.function.name,
            result: result.text.slice(0, 4000),
          }),
        );

        openRouterMessages.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: result.text,
        });
      }

      continue;
    }

    const content = (message.content || "No response generated.").trim();
    for (const chunk of chunkAssistantText(content)) {
      emit(
        buildEvent(request.runId, "assistant-chunk", {
          content: chunk,
        }),
      );
    }

    return {
      runId: request.runId,
      content,
      titleSuggestion:
        request.messages.find((item) => item.role === "user")?.content.slice(0, 42) ?? "New chat",
      events,
      diffs,
    };
  }

  throw new Error("The agent hit its maximum tool loop depth.");
};

const fetchModels = async (provider: ProviderConfig): Promise<RuntimeModelOption[]> => {
  const response = await fetch(`${provider.baseUrl || OPENROUTER_DEFAULT_BASE_URL}/models`, {
    headers: provider.apiKey
      ? {
          Authorization: `Bearer ${provider.apiKey}`,
        }
      : undefined,
  });

  if (!response.ok) {
    return [];
  }

  const payload = (await response.json()) as {
    data?: Array<{ id: string; name?: string }>;
  };

  return (payload.data ?? []).slice(0, 100).map((model) => ({
    id: model.id,
    name: model.name ?? model.id,
  }));
};

const pendingConfirmations = new Map<string, (approved: boolean) => void>();

const server = http.createServer(async (req, res) => {
  if (!req.url) {
    return notFound(res);
  }

  const url = new URL(req.url, `http://127.0.0.1:${port}`);

  try {
    if (req.method === "GET" && url.pathname === "/health") {
      return jsonResponse(res, 200, {
        ok: true,
        pid: process.pid,
        nodeVersion: process.versions.node,
      });
    }

    if (req.method === "POST" && url.pathname === "/provider/models") {
      const payload = await readJson<{ provider: ProviderConfig }>(req);
      const models = await fetchModels(payload.provider);
      return jsonResponse(res, 200, models);
    }

    if (req.method === "POST" && url.pathname === "/mcp/discover") {
      const payload = await readJson<{ server: McpServerConfig }>(req);
      const result = await discoverMcpTools(payload.server);
      return jsonResponse(res, 200, result);
    }

    if (req.method === "POST" && url.pathname === "/agent/confirm") {
      const payload = await readJson<{ confirmationId: string; approved: boolean }>(req);
      const resolver = pendingConfirmations.get(payload.confirmationId);
      if (resolver) {
        resolver(payload.approved);
        pendingConfirmations.delete(payload.confirmationId);
        return jsonResponse(res, 200, { ok: true });
      }
      return jsonResponse(res, 404, { error: "Confirmation not found" });
    }

    if (req.method === "POST" && url.pathname === "/agent/run") {
      const payload = await readJson<RuntimeAgentRequest>(req);
      res.writeHead(200, {
        "Content-Type": "application/x-ndjson",
        "Transfer-Encoding": "chunked",
      });

      const result = await runAgent(
        payload,
        (event) => {
          res.write(JSON.stringify(event) + "\n");
        },
        async (confirmationId, toolName, args) => {
          res.write(
            JSON.stringify(
              buildEvent(payload.runId, "confirmation-required", {
                toolName,
                args,
                confirmationId,
              })
            ) + "\n"
          );
          return new Promise<boolean>((resolve) => {
            pendingConfirmations.set(confirmationId, resolve);
          });
        }
      );

      res.write(JSON.stringify({ __stream_done__: true, response: result }) + "\n");
      res.end();
      return;
    }

    return notFound(res);
  } catch (error) {
    return jsonResponse(res, 500, {
      error: error instanceof Error ? error.message : "Unknown runtime error.",
    });
  }
});

server.listen(port, "127.0.0.1", () => {
  process.stdout.write(`[trim0.code runtime] listening on ${port}\n`);
});
