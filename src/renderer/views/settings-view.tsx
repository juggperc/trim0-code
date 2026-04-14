import { motion } from "framer-motion";
import { Bolt, RefreshCcw, Save, Search, ShieldCheck } from "lucide-react";
import type { McpServerConfig, RuntimeModelOption } from "@shared/types";
import type { ProviderFormState } from "@renderer/view-form-constants";
import { BrandDither } from "@renderer/components/brand-dither";
import { Badge } from "@renderer/components/ui/badge";
import { Button } from "@renderer/components/ui/button";
import { Input } from "@renderer/components/ui/input";

export type { ProviderFormState } from "@renderer/view-form-constants";

export interface SettingsViewProps {
  models: RuntimeModelOption[];
  setModels: React.Dispatch<React.SetStateAction<RuntimeModelOption[]>>;
  providerForm: ProviderFormState;
  setProviderForm: React.Dispatch<React.SetStateAction<ProviderFormState>>;
  trim0License: string;
  setTrim0License: React.Dispatch<React.SetStateAction<string>>;
  trim0AuthMode: McpServerConfig["authMode"];
  setTrim0AuthMode: React.Dispatch<React.SetStateAction<McpServerConfig["authMode"]>>;
  trim0Server: McpServerConfig | null;
  handleSaveProvider: () => Promise<void>;
  handleSaveTrim0: () => Promise<void>;
  handleValidateTrim0: () => Promise<void>;
  saving: boolean;
}

export function SettingsView({
  models,
  setModels,
  providerForm,
  setProviderForm,
  trim0License,
  setTrim0License,
  trim0AuthMode,
  setTrim0AuthMode,
  trim0Server,
  handleSaveProvider,
  handleSaveTrim0,
  handleValidateTrim0,
  saving,
}: SettingsViewProps) {
  return (
    <motion.div
      key="settings"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -12 }}
      transition={{ duration: 0.18 }}
      className="grid h-full gap-6 overflow-auto p-5 xl:grid-cols-[minmax(0,1fr)_360px]"
    >
      <section className="space-y-6">
        <article className="border border-black bg-white p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <Badge variant="accent">Provider</Badge>
              <h3 className="mt-3 text-2xl font-black uppercase tracking-[0.14em]">
                OpenRouter
              </h3>
              <p className="mt-2 max-w-2xl text-sm text-zinc-600">
                Keep the provider layer generic, but wire OpenRouter first for chat completion
                and tool-driven runs.
              </p>
            </div>
            <Button variant="outline" onClick={() => void window.trim0.fetchModels().then(setModels)}>
              <RefreshCcw className="size-4" />
              Refresh models
            </Button>
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-2">
            <Input
              value={providerForm.label}
              onChange={(event) =>
                setProviderForm((current) => ({ ...current, label: event.target.value }))
              }
              placeholder="Provider label"
            />
            <Input
              value={providerForm.baseUrl}
              onChange={(event) =>
                setProviderForm((current) => ({ ...current, baseUrl: event.target.value }))
              }
              placeholder="API base URL"
            />
            <Input
              value={providerForm.apiKey}
              onChange={(event) =>
                setProviderForm((current) => ({ ...current, apiKey: event.target.value }))
              }
              placeholder="OpenRouter API key"
            />
            <div className="grid gap-2">
              <Input
                value={providerForm.defaultModel}
                onChange={(event) =>
                  setProviderForm((current) => ({
                    ...current,
                    defaultModel: event.target.value,
                  }))
                }
                placeholder="Default model"
                list="openrouter-models"
              />
              <datalist id="openrouter-models">
                {models.map((model) => (
                  <option key={model.id} value={model.id}>
                    {model.name}
                  </option>
                ))}
              </datalist>
            </div>
          </div>

          <div className="mt-5 flex justify-end">
            <Button onClick={() => void handleSaveProvider()} disabled={saving}>
              <Save className="size-4" />
              Save provider
            </Button>
          </div>
        </article>

        <article className="border border-black bg-white p-5">
          <Badge variant="accent">trim0 MCP</Badge>
          <h3 className="mt-3 text-2xl font-black uppercase tracking-[0.14em]">
            Native integration
          </h3>
          <p className="mt-2 max-w-2xl text-sm text-zinc-600">
            The first-party trim0 server is preconfigured. Paste your Polar key to enable docs,
            skills, changelog digests, design token scans, and fixture generation inside chat.
          </p>

          <div className="mt-5 grid gap-3 md:grid-cols-[minmax(0,1fr)_240px]">
            <Input
              value={trim0License}
              onChange={(event) => setTrim0License(event.target.value)}
              placeholder="Polar license key"
            />
            <select
              value={trim0AuthMode}
              className="h-11 border border-black bg-white px-3 text-sm"
              onChange={(event) =>
                setTrim0AuthMode(event.target.value as McpServerConfig["authMode"])
              }
            >
              <option value="x-trim0-license-key">X-Trim0-License-Key</option>
              <option value="bearer">Authorization: Bearer</option>
            </select>
          </div>

          <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0 text-sm text-zinc-500">
              Endpoint:{" "}
              <span className="font-black text-black break-all">{trim0Server?.url}</span>
              {trim0Server?.lastHealthAt ? (
                <span className="mt-1 block text-xs">
                  Last check: {new Date(trim0Server.lastHealthAt).toLocaleString()} —{" "}
                  <span className={trim0Server.lastHealthOk ? "text-emerald-700" : "text-red-600"}>
                    {trim0Server.lastHealthOk ? "OK" : "Failed"}
                  </span>
                  {trim0Server.lastHealthMessage ? ` — ${trim0Server.lastHealthMessage}` : null}
                </span>
              ) : null}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => void handleValidateTrim0()} disabled={saving}>
                <ShieldCheck className="size-4" />
                Test connection
              </Button>
              <Button onClick={() => void handleSaveTrim0()} disabled={saving}>
                <Save className="size-4" />
                Save trim0 auth
              </Button>
            </div>
          </div>
        </article>
      </section>

      <aside className="space-y-4">
        <article className="checker-fade border border-black bg-white p-5">
          <div className="flex items-center gap-3">
            <div className="grid size-11 place-items-center border border-black bg-white">
              <Search className="size-5" />
            </div>
            <div>
              <div className="text-[11px] font-black uppercase tracking-[0.18em] text-zinc-500">
                Model shortlist
              </div>
              <div className="text-sm text-zinc-600">
                Recent OpenRouter models available to this setup.
              </div>
            </div>
          </div>
          <div className="mt-4 space-y-2">
            {models.slice(0, 8).map((model) => (
              <div
                key={model.id}
                className="flex items-center justify-between border border-zinc-300 bg-white px-3 py-2 text-sm"
              >
                <span className="font-black uppercase tracking-[0.14em]">{model.id}</span>
                <Bolt className="size-4 text-zinc-400" />
              </div>
            ))}
          </div>
        </article>

        <BrandDither className="h-64" />
      </aside>
    </motion.div>
  );
}
