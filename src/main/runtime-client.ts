import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { app } from "electron";
import type {
  AgentEvent,
  McpServerConfig,
  ProviderConfig,
  RuntimeAgentRequest,
  RuntimeAgentResponse,
  RuntimeDiscoveryResult,
  RuntimeHealth,
  RuntimeModelOption,
} from "../shared/types.js";

const RUNTIME_PORT = 47822;

export class RuntimeClient {
  private child: ChildProcessWithoutNullStreams | null = null;
  private readonly baseUrl = `http://127.0.0.1:${RUNTIME_PORT}`;

  private getRuntimeEntry() {
    const candidates = [
      path.join(app.getAppPath(), "dist-electron", "runtime", "server.js"),
      path.join(process.cwd(), "dist-electron", "runtime", "server.js"),
      path.join(path.dirname(process.execPath), "resources", "app.asar.unpacked", "dist-electron", "runtime", "server.js"),
    ];

    const match = candidates.find((candidate) => fs.existsSync(candidate));
    if (!match) {
      throw new Error("Could not find the Bun runtime entrypoint.");
    }

    return match;
  }

  async start() {
    if (this.child && !this.child.killed) {
      return;
    }

    const entry = this.getRuntimeEntry();
    this.child = spawn("bun", [entry, "--port", String(RUNTIME_PORT)], {
      cwd: app.getAppPath(),
      env: process.env,
      windowsHide: true,
    });

    this.child.stdout.on("data", (chunk) => {
      process.stdout.write(chunk.toString("utf8"));
    });

    this.child.stderr.on("data", (chunk) => {
      process.stderr.write(chunk.toString("utf8"));
    });

    await this.waitForHealth();
  }

  async stop() {
    if (!this.child || this.child.killed) {
      return;
    }

    this.child.kill();
    this.child = null;
  }

  async health() {
    const response = await fetch(`${this.baseUrl}/health`);
    if (!response.ok) {
      throw new Error("Runtime health check failed.");
    }

    return (await response.json()) as RuntimeHealth;
  }

  private async waitForHealth() {
    const startedAt = Date.now();
    while (Date.now() - startedAt < 10_000) {
      try {
        await this.health();
        return;
      } catch {
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
    }

    throw new Error("Runtime failed to start within 10 seconds.");
  }

  async confirmAction(confirmationId: string, approved: boolean) {
    const response = await fetch(`${this.baseUrl}/agent/confirm`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirmationId, approved }),
    });
    if (!response.ok) {
      throw new Error("Failed to send confirmation to runtime.");
    }
  }

  async runAgent(
    request: RuntimeAgentRequest,
    onEvent?: (event: AgentEvent) => void,
    requestConfirmation?: (confirmationId: string, toolName: string, args: Record<string, unknown>) => Promise<boolean>
  ) {
    const response = await fetch(`${this.baseUrl}/agent/run`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      const error = (await response.json()) as { error?: string };
      throw new Error(error.error || "Agent runtime request failed.");
    }

    if (!onEvent || !response.body) {
      const result = (await response.json()) as RuntimeAgentResponse;
      return result;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let finalResponse: RuntimeAgentResponse | null = null;

    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop()!;

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        const parsed = JSON.parse(trimmed) as Record<string, unknown>;

        if (parsed.__stream_done__) {
          finalResponse = parsed.response as RuntimeAgentResponse;
        } else if (parsed.type === "confirmation-required" && requestConfirmation) {
          const evt = parsed as unknown as Extract<AgentEvent, { type: "confirmation-required" }>;
          const approved = await requestConfirmation(evt.confirmationId, evt.toolName, evt.args);
          await this.confirmAction(evt.confirmationId, approved);
        } else {
          onEvent(parsed as unknown as AgentEvent);
        }
      }
    }

    if (!finalResponse) {
      throw new Error("Agent stream ended without a final response.");
    }

    return finalResponse;
  }

  async discoverMcpTools(server: McpServerConfig) {
    const response = await fetch(`${this.baseUrl}/mcp/discover`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ server }),
    });

    if (!response.ok) {
      const error = (await response.json()) as { error?: string };
      throw new Error(error.error || "MCP discovery failed.");
    }

    return (await response.json()) as RuntimeDiscoveryResult;
  }

  async fetchModels(provider: ProviderConfig) {
    const response = await fetch(`${this.baseUrl}/provider/models`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider }),
    });

    if (!response.ok) {
      return [] satisfies RuntimeModelOption[];
    }

    return (await response.json()) as RuntimeModelOption[];
  }

  async checkMcpHealth(server: McpServerConfig) {
    const response = await fetch(`${this.baseUrl}/mcp/health`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ server }),
    });

    if (!response.ok) {
      const error = (await response.json()) as { error?: string };
      return { ok: false as const, message: error.error || "Health check failed." };
    }

    return (await response.json()) as { ok: boolean; message?: string };
  }
}
