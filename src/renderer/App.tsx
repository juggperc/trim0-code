import {
  startTransition,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { AnimatePresence } from "framer-motion";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import {
  ChevronRight,
  FolderOpen,
  LoaderCircle,
  MessagesSquare,
  PlugZap,
  Settings2,
  Sparkles,
  TimerReset,
  X,
} from "lucide-react";
import { toast } from "sonner";
import type {
  AgentEvent,
  AppSnapshot,
  AppView,
  AutomationDefinition,
  ChatMessage,
  ChatHistorySearchHit,
  McpHealthResult,
  McpServerConfig,
  PrefetchedChat,
  RuntimeModelOption,
} from "@shared/types";
import { Trim0Logo } from "@renderer/components/trim0-logo";
import { Badge } from "@renderer/components/ui/badge";
import { Button } from "@renderer/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@renderer/components/ui/dialog";
import { Input } from "@renderer/components/ui/input";
import { ScrollArea } from "@renderer/components/ui/scroll-area";
import { Separator } from "@renderer/components/ui/separator";
import { cn } from "@renderer/lib/cn";
import { ChatView } from "./views/chat-view";
import { PluginsView, type CustomMcpFormState, INITIAL_CUSTOM_MCP_FORM } from "./views/plugins-view";
import { AutomationsView, type AutomationFormState, INITIAL_AUTOMATION_FORM } from "./views/automations-view";
import { SettingsView, type ProviderFormState, INITIAL_PROVIDER_FORM } from "./views/settings-view";


const VIEWS: Array<{ id: AppView; label: string; icon: typeof MessagesSquare }> = [
  { id: "chat", label: "Chat", icon: MessagesSquare },
  { id: "plugins", label: "Plugins", icon: PlugZap },
  { id: "automations", label: "Automations", icon: TimerReset },
  { id: "settings", label: "Settings", icon: Settings2 },
];

const parseEnvString = (value: string) =>
  Object.fromEntries(
    value
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const [key, ...rest] = line.split("=");
        return [key.trim(), rest.join("=").trim()];
      }),
  );

const parseArgsString = (value: string) =>
  value
    .split(/\s+/)
    .map((item) => item.trim())
    .filter(Boolean);

const viewTitle = (view: AppView) => {
  switch (view) {
    case "plugins":
      return "Plugins";
    case "automations":
      return "Automations";
    case "settings":
      return "Settings";
    default:
      return "Workspace chat";
  }
};

const renderAgentEventBody = (event: AgentEvent) => {
  if (event.type === "assistant-final") {
    return event.message.content;
  }

  if ("message" in event) {
    return event.message;
  }

  if ("toolName" in event) {
    return `${event.toolName}\n${
      "result" in event ? event.result : JSON.stringify(event.args, null, 2)
    }`;
  }

  if ("content" in event) {
    return event.content;
  }

  return "";
};

export default function App() {
  const [snapshot, setSnapshot] = useState<AppSnapshot | null>(null);
  const [activeChat, setActiveChat] = useState<PrefetchedChat | null>(null);
  const [view, setView] = useState<AppView>("chat");
  const [draft, setDraft] = useState("");
  const [streamingAssistant, setStreamingAssistant] = useState("");
  const [runStatus, setRunStatus] = useState("Ready.");
  const [agentLog, setAgentLog] = useState<AgentEvent[]>([]);
  const [models, setModels] = useState<RuntimeModelOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [prefetchingId, setPrefetchingId] = useState<string | null>(null);
  const [providerForm, setProviderForm] = useState<ProviderFormState>(INITIAL_PROVIDER_FORM);
  const [trim0License, setTrim0License] = useState("");
  const [trim0AuthMode, setTrim0AuthMode] = useState<McpServerConfig["authMode"]>("x-trim0-license-key");
  const [customMcpForm, setCustomMcpForm] = useState<CustomMcpFormState>(INITIAL_CUSTOM_MCP_FORM);
  const [automationForm, setAutomationForm] = useState<AutomationFormState>(INITIAL_AUTOMATION_FORM);
  const [selectedAutomationId, setSelectedAutomationId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [sessionSearchQuery, setSessionSearchQuery] = useState("");
  const [sessionSearchHits, setSessionSearchHits] = useState<ChatHistorySearchHit[]>([]);
  const [sessionSearchLoading, setSessionSearchLoading] = useState(false);
  const [mcpHealth, setMcpHealth] = useState<McpHealthResult[] | undefined>(undefined);
  const [pendingConfirmation, setPendingConfirmation] = useState<{
    id: string;
    toolName: string;
    command: string;
  } | null>(null);

  const currentRunIdRef = useRef<string | null>(null);
  const prefetchCacheRef = useRef(new Map<string, PrefetchedChat>());

  const deferredSessions = useDeferredValue(snapshot?.sessions ?? []);
  const activeProvider = useMemo(
    () => snapshot?.providers.find((provider) => provider.enabled) ?? snapshot?.providers[0] ?? null,
    [snapshot],
  );
  const trim0Server = useMemo(
    () => snapshot?.mcpServers.find((server) => server.builtInSlug === "trim0") ?? null,
    [snapshot],
  );

  const refresh = async (preferredSessionId?: string) => {
    const payload = await window.trim0.bootstrap();
    setSnapshot(payload.snapshot);
    setMcpHealth(payload.mcpHealth);

    let nextChat = payload.activeChat ?? null;
    if (preferredSessionId) {
      nextChat =
        preferredSessionId === payload.activeChat?.session.id
          ? payload.activeChat ?? null
          : await window.trim0.prefetchChat(preferredSessionId);
    }
    setActiveChat(nextChat);
    if (nextChat) {
      prefetchCacheRef.current.set(nextChat.session.id, nextChat);
    }
  };

  useEffect(() => {
    void (async () => {
      try {
        setLoading(true);
        const [payload, runtimeModels] = await Promise.all([
          window.trim0.bootstrap(),
          window.trim0.fetchModels(),
        ]);
        setSnapshot(payload.snapshot);
        setMcpHealth(payload.mcpHealth);
        setActiveChat(payload.activeChat ?? null);
        setModels(runtimeModels);
        if (payload.providerHealth) {
          if (payload.providerHealth.ok) {
            toast.success("OpenRouter connected", {
              description: `${payload.providerHealth.modelCount ?? 0} models available.`,
            });
          } else {
            toast.error("OpenRouter check failed", {
              description: payload.providerHealth.message ?? "Verify your API key in Settings.",
            });
          }
        }
        if (payload.mcpHealth?.length) {
          const failed = payload.mcpHealth.filter((item) => !item.ok);
          if (failed.length > 0) {
            toast.warning("MCP server issue", {
              description: `${failed.length} enabled server(s) did not respond. See Plugins to refresh.`,
            });
          }
        }
        if (payload.activeChat) {
          prefetchCacheRef.current.set(payload.activeChat.session.id, payload.activeChat);
        }
      } catch (error) {
        toast.error("Bootstrap failed", {
          description: error instanceof Error ? error.message : "Unknown error.",
        });
      } finally {
        setLoading(false);
      }
    })();

    const unsubscribe = window.trim0.onAgentEvent((event) => {
      setAgentLog((current) => [event, ...current].slice(0, 40));
      if (event.type === "status" && event.runId === currentRunIdRef.current) {
        setRunStatus(event.message);
      }
      if (event.type === "assistant-chunk" && event.runId === currentRunIdRef.current) {
        setStreamingAssistant((current) => current + event.content);
      }
      if (event.type === "confirmation-required") {
        setPendingConfirmation({
          id: event.confirmationId,
          toolName: event.toolName,
          command: String(event.args.command || ""),
        });
      }
      if (event.type === "assistant-final") {
        setStreamingAssistant("");
        currentRunIdRef.current = null;
        setRunStatus("Ready.");
        setActiveChat((current) => {
          if (!current || current.session.id !== event.message.sessionId) {
            return current;
          }

          const nextSession =
            event.sessionTitle !== undefined
              ? { ...current.session, title: event.sessionTitle, updatedAt: event.message.createdAt }
              : current.session;

          const next = {
            ...current,
            session: nextSession,
            messages: [...current.messages, event.message],
            diffs: [...event.diffs, ...current.diffs],
          };
          prefetchCacheRef.current.set(next.session.id, next);
          return next;
        });
        setSnapshot((current) => {
          if (!current || event.sessionTitle === undefined) {
            return current;
          }
          return {
            ...current,
            sessions: current.sessions.map((session) =>
              session.id === event.message.sessionId ? { ...session, title: event.sessionTitle! } : session,
            ),
          };
        });
        void refresh(event.message.sessionId);
      }
      if (event.type === "error" && event.runId === currentRunIdRef.current) {
        currentRunIdRef.current = null;
        setStreamingAssistant("");
        setRunStatus("Run failed.");
        toast.error("Agent run failed", {
          description: event.message,
        });
      }
    });

    return unsubscribe;
  }, []);

  useEffect(() => {
    if (!activeProvider) return;
    setProviderForm({
      label: activeProvider.label,
      apiKey: activeProvider.apiKey,
      baseUrl: activeProvider.baseUrl,
      defaultModel: activeChat?.session.model || activeProvider.defaultModel,
    });
  }, [activeProvider, activeChat?.session.model]);

  useEffect(() => {
    if (!trim0Server) return;
    setTrim0License(trim0Server.licenseKey ?? "");
    setTrim0AuthMode(trim0Server.authMode);
  }, [trim0Server]);

  useEffect(() => {
    const query = sessionSearchQuery.trim();
    if (!query) {
      setSessionSearchHits([]);
      setSessionSearchLoading(false);
      return;
    }

    setSessionSearchLoading(true);
    const handle = window.setTimeout(() => {
      void (async () => {
        try {
          const hits = await window.trim0.searchChatHistory(query);
          setSessionSearchHits(hits);
        } catch {
          setSessionSearchHits([]);
        } finally {
          setSessionSearchLoading(false);
        }
      })();
    }, 220);

    return () => {
      window.clearTimeout(handle);
    };
  }, [sessionSearchQuery]);

  const handleOpenFolder = async () => {
    const payload = await window.trim0.openFolder();
    setSnapshot(payload.snapshot);
    setActiveChat(payload.activeChat ?? activeChat);
    setView("chat");
  };

  const handleCreateChat = async () => {
    const chat = await window.trim0.createChat();
    setActiveChat(chat);
    setSnapshot((current) =>
      current
        ? {
            ...current,
            sessions: [chat.session, ...current.sessions],
            activeSessionId: chat.session.id,
          }
        : current,
    );
    prefetchCacheRef.current.set(chat.session.id, chat);
    setView("chat");
  };

  const prefetchChat = async (sessionId: string) => {
    if (prefetchCacheRef.current.has(sessionId)) return;
    setPrefetchingId(sessionId);
    try {
      const payload = await window.trim0.prefetchChat(sessionId);
      prefetchCacheRef.current.set(sessionId, payload);
    } finally {
      setPrefetchingId(null);
    }
  };

  const handleSetSessionWorkspace = async (workspaceId: string | null) => {
    if (!activeChat) return;
    try {
      const payload = await window.trim0.setSessionWorkspace(activeChat.session.id, workspaceId);
      setActiveChat(payload);
      prefetchCacheRef.current.set(payload.session.id, payload);
      await refresh(payload.session.id);
      toast.success("Workspace updated for this chat");
    } catch (error) {
      toast.error("Could not update workspace", {
        description: error instanceof Error ? error.message : "Unknown error.",
      });
    }
  };

  const switchChat = async (sessionId: string) => {
    const cached = prefetchCacheRef.current.get(sessionId);
    const payload = cached ?? (await window.trim0.prefetchChat(sessionId));
    prefetchCacheRef.current.set(sessionId, payload);
    startTransition(() => {
      setActiveChat(payload);
      setStreamingAssistant("");
      setView("chat");
    });
  };

  const handleSend = async () => {
    if (!draft.trim() || !activeChat) return;
    const outgoing = draft.trim();
    setDraft("");
    setStreamingAssistant("");

    const optimisticMessage: ChatMessage = {
      id: `draft-${Date.now()}`,
      sessionId: activeChat.session.id,
      role: "user",
      content: outgoing,
      createdAt: new Date().toISOString(),
    };

    setActiveChat((current) =>
      current
        ? {
            ...current,
            messages: [...current.messages, optimisticMessage],
          }
        : current,
    );

    const { runId } = await window.trim0.sendMessage({
      sessionId: activeChat.session.id,
      content: outgoing,
    });
    currentRunIdRef.current = runId;
    setRunStatus("Running…");
  };

  const handleSaveProvider = async () => {
    setSaving(true);
    try {
      await window.trim0.saveProvider({
        id: activeProvider?.id,
        label: providerForm.label,
        apiKey: providerForm.apiKey,
        baseUrl: providerForm.baseUrl,
        defaultModel: providerForm.defaultModel,
        headers: {},
        enabled: true,
      });
      setModels(await window.trim0.fetchModels());
      await refresh(activeChat?.session.id);
      toast.success("Provider updated", {
        description: "OpenRouter settings were saved locally.",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleSaveTrim0 = async () => {
    setSaving(true);
    try {
      await window.trim0.saveTrim0License(trim0License, trim0AuthMode);
      await refresh(activeChat?.session.id);
      toast.success("trim0 updated", {
        description: "Native MCP authentication is configured.",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleSaveCustomMcp = async () => {
    setSaving(true);
    try {
      await window.trim0.saveMcpServer({
        id: customMcpForm.id,
        kind: customMcpForm.kind,
        label: customMcpForm.label,
        command: customMcpForm.command || undefined,
        url: customMcpForm.url || undefined,
        args: parseArgsString(customMcpForm.args),
        env: parseEnvString(customMcpForm.env),
        authMode: customMcpForm.authMode,
        enabled: customMcpForm.enabled,
        licenseKey: customMcpForm.licenseKey,
        toolCache: [],
      });
      setCustomMcpForm(INITIAL_CUSTOM_MCP_FORM);
      await refresh(activeChat?.session.id);
      toast.success("MCP server saved", {
        description: "The server is ready for discovery and agent use.",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDiscoverTools = async (serverId: string) => {
    setSaving(true);
    try {
      await window.trim0.discoverMcpTools(serverId);
      await refresh(activeChat?.session.id);
      toast.success("Tool catalog refreshed", {
        description: "The MCP server tool cache is up to date.",
      });
    } catch (error) {
      toast.error("Tool discovery failed", {
        description: error instanceof Error ? error.message : "Unknown discovery error.",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleSaveAutomation = async () => {
    if (!activeProvider) return;
    setSaving(true);
    try {
      await window.trim0.saveAutomation({
        id: automationForm.id,
        name: automationForm.name,
        prompt: automationForm.prompt,
        workspaceId: activeChat?.session.workspaceId ?? snapshot?.activeWorkspaceId ?? null,
        providerId: activeProvider.id,
        model: providerForm.defaultModel,
        schedule: automationForm.schedule,
        enabledMcpServerIds:
          activeChat?.session.enabledMcpServerIds ??
          snapshot?.mcpServers.filter((server) => server.enabled).map((server) => server.id) ??
          [],
        status: automationForm.status,
      });
      setAutomationForm(INITIAL_AUTOMATION_FORM);
      setSelectedAutomationId(null);
      await refresh(activeChat?.session.id);
      toast.success("Automation saved", {
        description: "The local scheduler was updated.",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleEditAutomation = (automation: AutomationDefinition) => {
    setSelectedAutomationId(automation.id);
    setAutomationForm({
      id: automation.id,
      name: automation.name,
      prompt: automation.prompt,
      schedule: automation.schedule,
      status: automation.status,
    });
  };

  const handleDeleteAutomation = async (automationId: string) => {
    await window.trim0.deleteAutomation(automationId);
    await refresh(activeChat?.session.id);
  };

  const handleRunAutomation = async (automationId: string) => {
    await window.trim0.runAutomation(automationId);
    toast.success("Automation started", {
      description: "The run is executing locally.",
    });
  };

  const handleDeleteChat = async (sessionId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const payload = await window.trim0.deleteChat(sessionId);
      setSnapshot(payload.snapshot);

      if (activeChat?.session.id === sessionId) {
        const nextChat = payload.activeChat ?? null;
        setActiveChat(nextChat);
        if (nextChat) {
          prefetchCacheRef.current.set(nextChat.session.id, nextChat);
        }
      }
      toast.success("Chat deleted");
    } catch (error) {
      toast.error("Failed to delete chat", {
        description: error instanceof Error ? error.message : "Unknown error.",
      });
    }
  };

  return (
    <div className="grid-canvas h-full overflow-hidden text-black">
      <Dialog
        open={!!pendingConfirmation}
        onOpenChange={(open) => {
          if (!open && pendingConfirmation) {
            void window.trim0.confirmAction(pendingConfirmation.id, false);
            setPendingConfirmation(null);
          }
        }}
      >
        {pendingConfirmation ? (
          <DialogContent>
            <DialogTitle>Confirm Destructive Action</DialogTitle>
            <DialogDescription className="mt-2">
              The agent wants to execute a potentially destructive command via <strong>{pendingConfirmation.toolName}</strong>.
            </DialogDescription>
            <div className="my-4 overflow-x-auto whitespace-pre-wrap bg-zinc-950 p-4 font-mono text-sm text-zinc-50">
              {pendingConfirmation.command}
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <Button
                variant="outline"
                onClick={() => {
                  void window.trim0.confirmAction(pendingConfirmation.id, false);
                  setPendingConfirmation(null);
                }}
              >
                Deny
              </Button>
              <Button
                onClick={() => {
                  void window.trim0.confirmAction(pendingConfirmation.id, true);
                  setPendingConfirmation(null);
                }}
              >
                Approve
              </Button>
            </div>
          </DialogContent>
        ) : null}
      </Dialog>
      {loading || !snapshot ? (
        <div className="grid h-full place-items-center">
          <div className="flex items-center gap-3 border border-black bg-white px-5 py-4 panel-shadow">
            <LoaderCircle className="size-4 animate-spin" />
            <span className="text-sm font-black uppercase tracking-[0.18em]">Booting trim0.code</span>
          </div>
        </div>
      ) : (
        <PanelGroup direction="horizontal">
          <Panel defaultSize={19} minSize={17} maxSize={24} className="border-r border-black bg-white/95">
            <aside className="flex h-full flex-col">
              <div className="border-b border-black p-5">
                <Trim0Logo />
                <p className="mt-3 max-w-[18rem] text-sm text-zinc-600">
                  Super-fast local coding with built-in trim0 MCP, OpenRouter, and live diffs.
                </p>
              </div>

              <div className="space-y-4 p-5">
                <Button className="w-full justify-start" onClick={handleCreateChat}>
                  <Sparkles className="size-4" />
                  New chat
                </Button>
                <Button className="w-full justify-start" variant="outline" onClick={handleOpenFolder}>
                  <FolderOpen className="size-4" />
                  Open folder
                </Button>
              </div>

              <div className="px-5 pb-4">
                <div className="mb-2 text-[11px] font-black uppercase tracking-[0.18em] text-zinc-500">
                  Active workspace
                </div>
                <div className="border border-black bg-zinc-50 px-3 py-3 text-sm">
                  {snapshot.workspaces.find((workspace) => workspace.id === snapshot.activeWorkspaceId)?.path ??
                    "No folder open"}
                </div>
                {activeChat ? (
                  <div className="mt-3 space-y-2">
                    <div className="text-[11px] font-black uppercase tracking-[0.18em] text-zinc-500">
                      This chat uses
                    </div>
                    <label className="sr-only" htmlFor="session-workspace">
                      Workspace for this chat
                    </label>
                    <select
                      id="session-workspace"
                      className="w-full border border-black bg-white px-3 py-2 text-sm font-medium text-black"
                      value={activeChat.session.workspaceId ?? ""}
                      onChange={(event) => {
                        const value = event.target.value;
                        void handleSetSessionWorkspace(value === "" ? null : value);
                      }}
                    >
                      <option value="">No workspace</option>
                      {snapshot.workspaces.map((workspace) => (
                        <option key={workspace.id} value={workspace.id}>
                          {workspace.name}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : null}
              </div>

              <div className="px-5 pb-4">
                <div className="mb-2 text-[11px] font-black uppercase tracking-[0.18em] text-zinc-500">
                  Views
                </div>
                <div className="grid gap-2">
                  {VIEWS.map((item) => {
                    const Icon = item.icon;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        className={cn(
                          "flex min-h-[44px] items-center justify-between border px-3 py-2 text-left text-sm font-black uppercase tracking-[0.18em] transition-colors",
                          view === item.id
                            ? "border-black bg-black text-white"
                            : "border-zinc-300 bg-white text-zinc-700 hover:border-black hover:text-black",
                        )}
                        onClick={() => setView(item.id)}
                      >
                        <span className="flex items-center gap-2">
                          <Icon className="size-4" />
                          {item.label}
                        </span>
                        <ChevronRight className="size-4" />
                      </button>
                    );
                  })}
                </div>
              </div>

              <Separator />

              <div className="flex min-h-0 flex-1 flex-col px-5 py-4">
                <div className="mb-3 flex items-center justify-between text-[11px] font-black uppercase tracking-[0.18em] text-zinc-500">
                  <span>Recent chats</span>
                  <Badge>{deferredSessions.length}</Badge>
                </div>
                <div className="mb-3 space-y-2">
                  <label className="sr-only" htmlFor="session-search">
                    Search chat history
                  </label>
                  <Input
                    id="session-search"
                    value={sessionSearchQuery}
                    onChange={(event) => setSessionSearchQuery(event.target.value)}
                    placeholder="Search messages…"
                    className="h-10 border-black text-sm"
                  />
                  {sessionSearchQuery.trim() ? (
                    <div className="max-h-36 space-y-1 overflow-y-auto border border-zinc-300 bg-zinc-50 p-2 text-xs">
                      {sessionSearchLoading ? (
                        <div className="flex items-center gap-2 text-zinc-500">
                          <LoaderCircle className="size-3 animate-spin" />
                          Searching…
                        </div>
                      ) : sessionSearchHits.length === 0 ? (
                        <div className="text-zinc-500">No matches.</div>
                      ) : (
                        sessionSearchHits.map((hit) => (
                          <button
                            key={hit.sessionId}
                            type="button"
                            className="w-full border border-transparent px-2 py-1.5 text-left hover:border-black hover:bg-white"
                            onClick={() => {
                              void switchChat(hit.sessionId);
                              setSessionSearchQuery("");
                              setSessionSearchHits([]);
                            }}
                          >
                            <div className="font-black uppercase tracking-[0.12em]">{hit.title}</div>
                            <div className="mt-0.5 line-clamp-2 text-zinc-600">{hit.snippet}</div>
                          </button>
                        ))
                      )}
                    </div>
                  ) : null}
                </div>
                <ScrollArea className="min-h-0 flex-1 pr-2">
                  <div className="space-y-2">
                    {deferredSessions.map((session) => (
                      <button
                        key={session.id}
                        type="button"
                        className={cn(
                          "grid w-full gap-2 border px-3 py-3 text-left transition-colors group",
                          activeChat?.session.id === session.id
                            ? "border-black bg-black text-white"
                            : "border-zinc-300 bg-white text-zinc-700 hover:border-black hover:text-black",
                        )}
                        onMouseEnter={() => void prefetchChat(session.id)}
                        onFocus={() => void prefetchChat(session.id)}
                        onClick={() => void switchChat(session.id)}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate text-sm font-black uppercase tracking-[0.14em]">
                            {session.title}
                          </span>
                          <div className="flex items-center gap-2">
                            {prefetchingId === session.id ? (
                              <span className="flex items-center gap-1 text-[10px] font-black uppercase tracking-[0.14em] text-zinc-500">
                                <LoaderCircle className="size-3 animate-spin" />
                                Prefetch
                              </span>
                            ) : null}
                            <div
                              role="button"
                              tabIndex={0}
                              className="opacity-0 transition-opacity hover:text-red-500 focus:opacity-100 group-hover:opacity-100"
                              onClick={(e) => void handleDeleteChat(session.id, e)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter" || e.key === " ") {
                                  e.stopPropagation();
                                  void handleDeleteChat(session.id, e as unknown as React.MouseEvent);
                                }
                              }}
                              title="Delete chat"
                            >
                              <X className="size-4" />
                            </div>
                          </div>
                        </div>
                        <div className="text-xs text-current/70">
                          {snapshot.workspaces.find((workspace) => workspace.id === session.workspaceId)?.name ??
                            "No workspace"}
                        </div>
                      </button>
                    ))}
                  </div>
                </ScrollArea>
              </div>
            </aside>
          </Panel>

          <PanelResizeHandle className="w-2 bg-[linear-gradient(90deg,#fff_0%,#fff_30%,#111_30%,#111_70%,#fff_70%,#fff_100%)]" />

          <Panel defaultSize={53} minSize={38}>
            <div className="flex h-full flex-col">
              <header className="flex min-h-[72px] items-center justify-between border-b border-black bg-white px-5">
                <div>
                  <div className="text-[11px] font-black uppercase tracking-[0.18em] text-zinc-500">
                    {viewTitle(view)}
                  </div>
                  <div className="mt-1 text-lg font-black uppercase tracking-[0.14em]">
                    {activeChat?.session.title ?? "No active chat"}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Badge variant="outline">{runStatus}</Badge>
                  {trim0Server?.licenseKey ? (
                    <Badge variant="accent">trim0 connected</Badge>
                  ) : (
                    <Badge variant="outline">trim0 pending</Badge>
                  )}
                </div>
              </header>

              <div className="min-h-0 flex-1 bg-white">
                <AnimatePresence mode="wait">
                                    {view === "chat" ? (
                    <ChatView
                      activeChat={activeChat}
                      streamingAssistant={streamingAssistant}
                      draft={draft}
                      setDraft={setDraft}
                      handleSend={handleSend}
                      handleOpenFolder={handleOpenFolder}
                      handleCreateChat={handleCreateChat}
                    />
                  ) : null}
                  {view === "plugins" ? (
                    <PluginsView
                      snapshot={snapshot}
                      mcpHealth={mcpHealth}
                      customMcpForm={customMcpForm}
                      setCustomMcpForm={setCustomMcpForm}
                      handleDiscoverTools={handleDiscoverTools}
                      handleSaveCustomMcp={handleSaveCustomMcp}
                      saving={saving}
                    />
                  ) : null}
                  {view === "automations" ? (
                    <AutomationsView
                      snapshot={snapshot}
                      automationForm={automationForm}
                      setAutomationForm={setAutomationForm}
                      selectedAutomationId={selectedAutomationId}
                      handleSaveAutomation={handleSaveAutomation}
                      handleEditAutomation={handleEditAutomation}
                      handleDeleteAutomation={handleDeleteAutomation}
                      handleRunAutomation={handleRunAutomation}
                      saving={saving}
                    />
                  ) : null}
                  {view === "settings" ? (
                    <SettingsView
                      models={models}
                      setModels={setModels}
                      providerForm={providerForm}
                      setProviderForm={setProviderForm}
                      trim0License={trim0License}
                      setTrim0License={setTrim0License}
                      trim0AuthMode={trim0AuthMode}
                      setTrim0AuthMode={setTrim0AuthMode}
                      trim0Server={trim0Server}
                      handleSaveProvider={handleSaveProvider}
                      handleSaveTrim0={handleSaveTrim0}
                      saving={saving}
                    />
                  ) : null}
                </AnimatePresence>
              </div>
            </div>
          </Panel>

          <PanelResizeHandle className="w-2 bg-[linear-gradient(90deg,#fff_0%,#fff_30%,#111_30%,#111_70%,#fff_70%,#fff_100%)]" />

          <Panel defaultSize={28} minSize={20}>
            <aside className="flex h-full flex-col border-l border-black bg-white">
              <div className="border-b border-black p-5">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-[11px] font-black uppercase tracking-[0.18em] text-zinc-500">
                      Live diff
                    </div>
                    <div className="mt-1 text-lg font-black uppercase tracking-[0.14em]">
                      Files changed
                    </div>
                  </div>
                  <Badge>{activeChat?.diffs.length ?? 0}</Badge>
                </div>
              </div>
              <ScrollArea className="min-h-0 flex-1 p-5">
                <div className="space-y-4">
                  {activeChat?.diffs.length ? (
                    activeChat.diffs.map((diff) => (
                      <article key={diff.id} className="border border-black bg-zinc-50">
                        <div className="border-b border-black px-4 py-3">
                          <div className="text-[11px] font-black uppercase tracking-[0.18em] text-zinc-500">
                            {diff.filePath}
                          </div>
                        </div>
                        <pre className="overflow-auto p-4 text-[11px] leading-5 text-zinc-700">
                          {diff.patch}
                        </pre>
                      </article>
                    ))
                  ) : (
                    <div className="grid min-h-[220px] place-items-center border border-dashed border-zinc-300 text-center">
                      <div className="max-w-xs space-y-3 p-6">
                        <div className="mx-auto grid size-10 place-items-center border border-black bg-zinc-50">
                          <Sparkles className="size-4" />
                        </div>
                        <div className="text-lg font-black uppercase tracking-[0.14em]">
                          No diffs yet
                        </div>
                        <p className="text-sm text-zinc-600">
                          File writes and edits from the agent show up here immediately.
                        </p>
                      </div>
                    </div>
                  )}

                  <Separator className="my-6" />

                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="text-[11px] font-black uppercase tracking-[0.18em] text-zinc-500">
                        Agent log
                      </div>
                      <Badge variant="outline">{agentLog.length}</Badge>
                    </div>
                    {agentLog.map((event) => (
                      <div
                        key={`${event.runId}-${event.timestamp}-${event.type}`}
                        className="border border-zinc-300 bg-white p-3 text-sm"
                      >
                        <div className="mb-2 text-[11px] font-black uppercase tracking-[0.18em] text-zinc-500">
                          {event.type}
                        </div>
                        <div className="message-prose text-sm text-zinc-700">{renderAgentEventBody(event)}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </ScrollArea>
            </aside>
          </Panel>
        </PanelGroup>
      )}

    </div>
  );
}
