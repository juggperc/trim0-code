import { motion } from "framer-motion";
import { RefreshCcw, Save } from "lucide-react";
import type { AppSnapshot, McpServerConfig } from "@shared/types";
import type { CustomMcpFormState } from "@renderer/view-form-constants";
import { Badge } from "@renderer/components/ui/badge";
import { Button } from "@renderer/components/ui/button";
import { Input } from "@renderer/components/ui/input";
import { Separator } from "@renderer/components/ui/separator";
import { Switch } from "@renderer/components/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "@renderer/components/ui/tabs";
import { Textarea } from "@renderer/components/ui/textarea";

export type { CustomMcpFormState } from "@renderer/view-form-constants";

export interface PluginsViewProps {
  snapshot: AppSnapshot;
  customMcpForm: CustomMcpFormState;
  setCustomMcpForm: React.Dispatch<React.SetStateAction<CustomMcpFormState>>;
  handleDiscoverTools: (serverId: string) => Promise<void>;
  handleSaveCustomMcp: () => Promise<void>;
  saving: boolean;
}

export function PluginsView({
  snapshot,
  customMcpForm,
  setCustomMcpForm,
  handleDiscoverTools,
  handleSaveCustomMcp,
  saving,
}: PluginsViewProps) {
  return (
    <motion.div
      key="plugins"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -12 }}
      transition={{ duration: 0.18 }}
      className="grid h-full gap-6 overflow-auto p-5 xl:grid-cols-[minmax(0,1fr)_360px]"
    >
      <section className="space-y-4">
        {snapshot.mcpServers.map((server) => (
          <article key={server.id} className="border border-black bg-white p-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Badge variant={server.enabled ? "default" : "outline"}>
                    {server.kind}
                  </Badge>
                  {server.builtInSlug ? <Badge variant="accent">first-party</Badge> : null}
                </div>
                <h3 className="text-xl font-black uppercase tracking-[0.14em]">
                  {server.label}
                </h3>
                <p className="text-sm text-zinc-600">
                  {server.url || server.command || "Local MCP configuration"}
                </p>
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => void handleDiscoverTools(server.id)}
                >
                  <RefreshCcw className="size-4" />
                  Discover
                </Button>
              </div>
            </div>

            <Separator className="my-4" />

            <div className="grid gap-3 md:grid-cols-2">
              {server.toolCache.length > 0 ? (
                server.toolCache.map((tool) => (
                  <div key={tool.name} className="border border-zinc-300 bg-zinc-50 p-3">
                    <div className="text-sm font-black uppercase tracking-[0.14em]">
                      {tool.name}
                    </div>
                    <p className="mt-2 text-sm text-zinc-600">{tool.description}</p>
                  </div>
                ))
              ) : (
                <div className="border border-dashed border-zinc-300 p-4 text-sm text-zinc-500">
                  No tool cache yet. Run discovery to validate the server and pull its catalog.
                </div>
              )}
            </div>
          </article>
        ))}
      </section>

      <section className="space-y-4 border border-black bg-white p-5">
        <div>
          <Badge variant="accent">Custom MCP</Badge>
          <h3 className="mt-3 text-2xl font-black uppercase tracking-[0.14em]">
            Add server
          </h3>
          <p className="mt-2 text-sm text-zinc-600">
            Register a stdio or HTTP MCP server for direct agent use.
          </p>
        </div>

        <Tabs
          value={customMcpForm.kind}
          onValueChange={(value) =>
            setCustomMcpForm((current) => ({
              ...current,
              kind: value as "http" | "stdio",
            }))
          }
        >
          <TabsList>
            <TabsTrigger value="http">HTTP</TabsTrigger>
            <TabsTrigger value="stdio">stdio</TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="grid gap-3">
          <Input
            value={customMcpForm.label}
            onChange={(event) =>
              setCustomMcpForm((current) => ({ ...current, label: event.target.value }))
            }
            placeholder="Server label"
          />
          {customMcpForm.kind === "http" ? (
            <Input
              value={customMcpForm.url}
              onChange={(event) =>
                setCustomMcpForm((current) => ({ ...current, url: event.target.value }))
              }
              placeholder="https://server.example.com/mcp"
            />
          ) : (
            <Input
              value={customMcpForm.command}
              onChange={(event) =>
                setCustomMcpForm((current) => ({ ...current, command: event.target.value }))
              }
              placeholder="bunx my-mcp-server"
            />
          )}
          <Input
            value={customMcpForm.args}
            onChange={(event) =>
              setCustomMcpForm((current) => ({ ...current, args: event.target.value }))
            }
            placeholder="Optional args"
          />
          <Textarea
            value={customMcpForm.env}
            onChange={(event) =>
              setCustomMcpForm((current) => ({ ...current, env: event.target.value }))
            }
            className="min-h-[110px]"
            placeholder={"KEY=value\nSECOND=value"}
          />
          <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto] sm:items-center">
            <select
              value={customMcpForm.authMode}
              className="h-11 border border-black bg-white px-3 text-sm"
              onChange={(event) =>
                setCustomMcpForm((current) => ({
                  ...current,
                  authMode: event.target.value as McpServerConfig["authMode"],
                }))
              }
            >
              <option value="none">No auth</option>
              <option value="x-trim0-license-key">X-Trim0-License-Key</option>
              <option value="bearer">Authorization: Bearer</option>
            </select>
            <div className="flex items-center gap-3 border border-black px-3 py-2">
              <Switch
                checked={customMcpForm.enabled}
                onCheckedChange={(checked) =>
                  setCustomMcpForm((current) => ({ ...current, enabled: checked }))
                }
              />
              <span className="text-xs font-black uppercase tracking-[0.16em]">Enabled</span>
            </div>
            <Badge variant="outline">{customMcpForm.kind}</Badge>
          </div>
          <Input
            value={customMcpForm.licenseKey}
            onChange={(event) =>
              setCustomMcpForm((current) => ({
                ...current,
                licenseKey: event.target.value,
              }))
            }
            placeholder="Optional auth token"
          />
        </div>

        <Button className="w-full" onClick={() => void handleSaveCustomMcp()} disabled={saving}>
          <Save className="size-4" />
          Save server
        </Button>
      </section>
    </motion.div>
  );
}
