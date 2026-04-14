import { useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { FolderOpen, LoaderCircle, Sparkles, TerminalSquare, WandSparkles } from "lucide-react";
import { APP_NAME } from "@shared/brand";
import type { PrefetchedChat, ChatMessage } from "@shared/types";
import { BrandDither } from "@renderer/components/brand-dither";
import { Badge } from "@renderer/components/ui/badge";
import { Button } from "@renderer/components/ui/button";
import { ScrollArea } from "@renderer/components/ui/scroll-area";
import { Textarea } from "@renderer/components/ui/textarea";
import { cn } from "@renderer/lib/cn";

export interface ChatViewProps {
  activeChat: PrefetchedChat | null;
  streamingAssistant: string;
  draft: string;
  setDraft: (value: string) => void;
  handleSend: () => void;
  handleOpenFolder: () => void;
  handleCreateChat: () => void;
}

const messageTone = (role: ChatMessage["role"]) => {
  switch (role) {
    case "user":
      return "border-black bg-black text-white";
    case "assistant":
      return "border-black bg-white text-black";
    default:
      return "border-zinc-300 bg-zinc-50 text-zinc-700";
  }
};

export function ChatView({
  activeChat,
  streamingAssistant,
  draft,
  setDraft,
  handleSend,
  handleOpenFolder,
  handleCreateChat,
}: ChatViewProps) {
  const scrollerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    scrollerRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [activeChat?.messages.length, streamingAssistant]);

  const emptyChatState = (
    <div className="grid h-full place-items-center p-8">
      <div className="grid max-w-xl gap-5 border border-black bg-white p-6 panel-shadow">
        <BrandDither className="h-44 w-full" />
        <div className="space-y-3">
          <Badge variant="accent">trim0 shell</Badge>
          <h2 className="text-3xl font-black uppercase tracking-[0.14em] text-black">
            Open a workspace and start shipping.
          </h2>
          <p className="text-sm text-zinc-600">
            {APP_NAME} is wired for local files, shell commands, diff inspection, MCP tools, and
            scheduled automation runs.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Button onClick={handleOpenFolder}>
            <FolderOpen className="size-4" />
            Open folder
          </Button>
          <Button variant="outline" onClick={handleCreateChat}>
            <Sparkles className="size-4" />
            New chat
          </Button>
        </div>
      </div>
    </div>
  );

  return (
    <motion.div
      key="chat"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -12 }}
      transition={{ duration: 0.18 }}
      className="flex h-full flex-col"
    >
      {!activeChat ? (
        emptyChatState
      ) : (
        <>
          <ScrollArea className="min-h-0 flex-1 p-5">
            <div className="space-y-4">
              {activeChat.messages.map((message) => (
                <article
                  key={message.id}
                  className={cn("border p-4", messageTone(message.role))}
                >
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <span className="text-[11px] font-black uppercase tracking-[0.18em]">
                      {message.role}
                    </span>
                    <span className="text-[11px] uppercase tracking-[0.16em] opacity-70">
                      {new Date(message.createdAt).toLocaleTimeString()}
                    </span>
                  </div>
                  <div className="message-prose text-sm leading-6">{message.content}</div>
                </article>
              ))}

              {streamingAssistant ? (
                <article className="border border-black bg-white p-4">
                  <div className="mb-2 flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.18em] text-zinc-500">
                    <LoaderCircle className="size-3 animate-spin" />
                    Assistant
                  </div>
                  <div className="message-prose text-sm leading-6">{streamingAssistant}</div>
                </article>
              ) : null}

              <div ref={scrollerRef} />
            </div>
          </ScrollArea>

          <div className="border-t border-black bg-zinc-50 p-5">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.18em] text-zinc-500">
                <TerminalSquare className="size-4" />
                Workspace tools, MCP, and shell access are enabled for this chat.
              </div>
              <Badge>{activeChat.session.model}</Badge>
            </div>
            <Textarea
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="Ask trim0.code to inspect, edit, diff, wire an MCP server, or run code in the active workspace."
              onKeyDown={(event) => {
                if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
                  event.preventDefault();
                  void handleSend();
                }
              }}
            />
            <div className="mt-3 flex items-center justify-between gap-3">
              <div className="text-xs text-zinc-500">
                <span className="font-black text-black">Cmd/Ctrl + Enter</span> to send
              </div>
              <Button onClick={() => void handleSend()}>
                <WandSparkles className="size-4" />
                Send
              </Button>
            </div>
          </div>
        </>
      )}
    </motion.div>
  );
}
