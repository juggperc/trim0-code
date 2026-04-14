export type ProviderKind = "openrouter";
export type MessageRole = "system" | "user" | "assistant" | "tool";
export type McpServerKind = "builtin" | "stdio" | "http";
export type McpAuthMode = "none" | "x-trim0-license-key" | "bearer";
export type AutomationStatus = "active" | "paused";
export type AgentRunStatus = "idle" | "running" | "completed" | "failed";
export type AppView = "chat" | "plugins" | "automations" | "settings";

export interface ProviderConfig {
  id: string;
  kind: ProviderKind;
  label: string;
  apiKey: string;
  baseUrl: string;
  defaultModel: string;
  headers: Record<string, string>;
  enabled: boolean;
}

export interface McpToolInfo {
  name: string;
  description: string;
  inputSchema?: Record<string, unknown>;
}

export interface McpServerConfig {
  id: string;
  kind: McpServerKind;
  label: string;
  command?: string;
  url?: string;
  args: string[];
  env: Record<string, string>;
  authMode: McpAuthMode;
  enabled: boolean;
  toolCache: McpToolInfo[];
  builtInSlug?: string;
  licenseKey?: string;
}

export interface WorkspaceRecord {
  id: string;
  path: string;
  name: string;
  lastOpenedAt: string;
}

export interface ChatSession {
  id: string;
  workspaceId: string | null;
  title: string;
  providerId: string;
  model: string;
  enabledMcpServerIds: string[];
  createdAt: string;
  updatedAt: string;
}

export interface ChatMessage {
  id: string;
  sessionId: string;
  role: MessageRole;
  content: string;
  createdAt: string;
  metadata?: Record<string, unknown>;
}

export interface DiffSnapshot {
  id: string;
  sessionId: string;
  workspaceId: string | null;
  filePath: string;
  beforeText: string;
  afterText: string;
  patch: string;
  createdAt: string;
  runId: string;
}

export interface AgentRun {
  id: string;
  sessionId: string;
  status: AgentRunStatus;
  prompt: string;
  startedAt: string;
  endedAt?: string;
  summary?: string;
  eventLog: AgentEvent[];
}

export interface AutomationHistoryEntry {
  id: string;
  startedAt: string;
  endedAt?: string;
  status: "success" | "failed" | "running";
  summary: string;
}

export interface AutomationDefinition {
  id: string;
  name: string;
  prompt: string;
  workspaceId: string | null;
  providerId: string;
  model: string;
  schedule: string;
  enabledMcpServerIds: string[];
  status: AutomationStatus;
  lastRunAt?: string;
  nextRunAt?: string;
  history: AutomationHistoryEntry[];
}

export interface PrefetchedChat {
  session: ChatSession;
  messages: ChatMessage[];
  diffs: DiffSnapshot[];
}

export interface AppSnapshot {
  providers: ProviderConfig[];
  mcpServers: McpServerConfig[];
  workspaces: WorkspaceRecord[];
  sessions: ChatSession[];
  automations: AutomationDefinition[];
  activeSessionId: string | null;
  activeWorkspaceId: string | null;
}

export interface BootstrapPayload {
  snapshot: AppSnapshot;
  activeChat?: PrefetchedChat;
}

export interface SendMessageInput {
  sessionId: string;
  content: string;
}

export interface SaveAutomationInput {
  id?: string;
  name: string;
  prompt: string;
  workspaceId: string | null;
  providerId: string;
  model: string;
  schedule: string;
  enabledMcpServerIds: string[];
  status: AutomationStatus;
}

export interface SaveMcpServerInput {
  id?: string;
  kind: McpServerKind;
  label: string;
  command?: string;
  url?: string;
  args: string[];
  env: Record<string, string>;
  authMode: McpAuthMode;
  enabled: boolean;
  toolCache?: McpToolInfo[];
  licenseKey?: string;
}

export interface SaveProviderInput {
  id?: string;
  label: string;
  apiKey: string;
  baseUrl: string;
  defaultModel: string;
  headers: Record<string, string>;
  enabled: boolean;
}

export type AgentEvent =
  | {
      runId: string;
      type: "status";
      message: string;
      timestamp: string;
    }
  | {
      runId: string;
      type: "tool-start";
      toolName: string;
      args: Record<string, unknown>;
      timestamp: string;
    }
  | {
      runId: string;
      type: "tool-result";
      toolName: string;
      result: string;
      timestamp: string;
    }
  | {
      runId: string;
      type: "confirmation-required";
      toolName: string;
      args: Record<string, unknown>;
      timestamp: string;
      confirmationId: string;
    }
  | {
      runId: string;
      type: "assistant-chunk";
      content: string;
      timestamp: string;
    }
  | {
      runId: string;
      type: "assistant-final";
      message: ChatMessage;
      diffs: DiffSnapshot[];
      timestamp: string;
    }
  | {
      runId: string;
      type: "error";
      message: string;
      timestamp: string;
    };

export interface RuntimeAgentRequest {
  runId: string;
  sessionId: string;
  workspacePath: string | null;
  model: string;
  messages: ChatMessage[];
  provider: ProviderConfig;
  mcpServers: McpServerConfig[];
  systemPrompt: string;
}

export interface RuntimeAgentResponse {
  runId: string;
  content: string;
  titleSuggestion?: string;
  events: AgentEvent[];
  diffs: DiffSnapshot[];
}

export interface RuntimeHealth {
  ok: boolean;
  pid?: number;
  bunVersion?: string;
}

export interface RuntimeDiscoveryResult {
  tools: McpToolInfo[];
}

export interface RuntimeModelOption {
  id: string;
  name: string;
}

export interface Trim0DesktopApi {
  bootstrap: () => Promise<BootstrapPayload>;
  openFolder: () => Promise<BootstrapPayload>;
  createChat: () => Promise<PrefetchedChat>;
  deleteChat: (sessionId: string) => Promise<BootstrapPayload>;
  prefetchChat: (sessionId: string) => Promise<PrefetchedChat>;
  sendMessage: (input: SendMessageInput) => Promise<{ runId: string }>;
  saveProvider: (input: SaveProviderInput) => Promise<ProviderConfig>;
  saveTrim0License: (licenseKey: string, authMode: McpAuthMode) => Promise<McpServerConfig>;
  saveMcpServer: (input: SaveMcpServerInput) => Promise<McpServerConfig>;
  discoverMcpTools: (serverId: string) => Promise<RuntimeDiscoveryResult>;
  saveAutomation: (input: SaveAutomationInput) => Promise<AutomationDefinition>;
  deleteAutomation: (id: string) => Promise<void>;
  runAutomation: (id: string) => Promise<void>;
  fetchModels: () => Promise<RuntimeModelOption[]>;
  onAgentEvent: (listener: (event: AgentEvent) => void) => () => void;
  confirmAction: (confirmationId: string, approved: boolean) => Promise<void>;
}

declare global {
  interface Window {
    trim0: Trim0DesktopApi;
  }
}
