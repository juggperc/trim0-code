import { motion } from "framer-motion";
import { Save, TimerReset } from "lucide-react";
import type { AppSnapshot, AutomationDefinition } from "@shared/types";
import { Badge } from "@renderer/components/ui/badge";
import { Button } from "@renderer/components/ui/button";
import { Input } from "@renderer/components/ui/input";
import { Separator } from "@renderer/components/ui/separator";
import { Switch } from "@renderer/components/ui/switch";
import { Textarea } from "@renderer/components/ui/textarea";

export type AutomationFormState = {
  id?: string;
  name: string;
  prompt: string;
  schedule: string;
  status: AutomationDefinition["status"];
};

export const INITIAL_AUTOMATION_FORM: AutomationFormState = {
  name: "Workspace review",
  prompt:
    "Review the current workspace, look for obvious TODOs or failures, and summarize what needs attention next.",
  schedule: "0 * * * *",
  status: "active",
};

export const formatSchedule = (value: string) => {
  if (value === "0 * * * *") return "Hourly";
  if (value === "0 9 * * 1-5") return "Weekdays at 09:00";
  return value;
};

export interface AutomationsViewProps {
  snapshot: AppSnapshot;
  automationForm: AutomationFormState;
  setAutomationForm: React.Dispatch<React.SetStateAction<AutomationFormState>>;
  selectedAutomationId: string | null;
  handleSaveAutomation: () => Promise<void>;
  handleEditAutomation: (automation: AutomationDefinition) => void;
  handleDeleteAutomation: (automationId: string) => Promise<void>;
  handleRunAutomation: (automationId: string) => Promise<void>;
  saving: boolean;
}

export function AutomationsView({
  snapshot,
  automationForm,
  setAutomationForm,
  selectedAutomationId,
  handleSaveAutomation,
  handleEditAutomation,
  handleDeleteAutomation,
  handleRunAutomation,
  saving,
}: AutomationsViewProps) {
  return (
    <motion.div
      key="automations"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -12 }}
      transition={{ duration: 0.18 }}
      className="grid h-full gap-6 overflow-auto p-5 xl:grid-cols-[360px_minmax(0,1fr)]"
    >
      <section className="space-y-4 border border-black bg-white p-5">
        <div>
          <Badge variant="accent">Local scheduler</Badge>
          <h3 className="mt-3 text-2xl font-black uppercase tracking-[0.14em]">
            {selectedAutomationId ? "Edit automation" : "Create automation"}
          </h3>
          <p className="mt-2 text-sm text-zinc-600">
            These runs execute locally while the app is open.
          </p>
        </div>

        <Input
          value={automationForm.name}
          onChange={(event) =>
            setAutomationForm((current) => ({ ...current, name: event.target.value }))
          }
          placeholder="Automation name"
        />
        <Textarea
          value={automationForm.prompt}
          onChange={(event) =>
            setAutomationForm((current) => ({ ...current, prompt: event.target.value }))
          }
          placeholder="What should this automation ask the agent to do?"
        />
        <Input
          value={automationForm.schedule}
          onChange={(event) =>
            setAutomationForm((current) => ({ ...current, schedule: event.target.value }))
          }
          placeholder="Cron expression, e.g. 0 * * * *"
        />
        <div className="flex items-center justify-between border border-black px-3 py-3">
          <div>
            <div className="text-xs font-black uppercase tracking-[0.16em]">Active</div>
            <div className="text-xs text-zinc-500">Paused automations stay in the list.</div>
          </div>
          <Switch
            checked={automationForm.status === "active"}
            onCheckedChange={(checked) =>
              setAutomationForm((current) => ({
                ...current,
                status: checked ? "active" : "paused",
              }))
            }
          />
        </div>
        <Button className="w-full" onClick={() => void handleSaveAutomation()} disabled={saving}>
          <Save className="size-4" />
          Save automation
        </Button>
      </section>

      <section className="space-y-4">
        {snapshot.automations.length === 0 ? (
          <div className="grid min-h-[260px] place-items-center border border-dashed border-zinc-300 bg-white p-8 text-center">
            <div className="space-y-3">
              <div className="mx-auto grid size-12 place-items-center border border-black bg-zinc-50">
                <TimerReset className="size-5" />
              </div>
              <div className="text-lg font-black uppercase tracking-[0.14em]">
                No automations yet
              </div>
              <p className="max-w-md text-sm text-zinc-600">
                Save a cron schedule to run the same coding workflow on your workspace in the
                background.
              </p>
            </div>
          </div>
        ) : (
          snapshot.automations.map((automation) => (
            <article key={automation.id} className="border border-black bg-white p-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Badge variant={automation.status === "active" ? "default" : "outline"}>
                      {automation.status}
                    </Badge>
                    <Badge variant="outline">{formatSchedule(automation.schedule)}</Badge>
                  </div>
                  <h3 className="text-xl font-black uppercase tracking-[0.14em]">
                    {automation.name}
                  </h3>
                  <p className="max-w-2xl text-sm text-zinc-600">{automation.prompt}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleEditAutomation(automation)}
                  >
                    Edit
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => void handleRunAutomation(automation.id)}
                  >
                    Run now
                  </Button>
                  <Button
                    size="sm"
                    variant="subtle"
                    onClick={() => void handleDeleteAutomation(automation.id)}
                  >
                    Delete
                  </Button>
                </div>
              </div>

              <Separator className="my-4" />

              <div className="grid gap-3 md:grid-cols-3">
                <div className="border border-zinc-300 bg-zinc-50 p-3">
                  <div className="text-[11px] font-black uppercase tracking-[0.16em] text-zinc-500">
                    Last run
                  </div>
                  <div className="mt-2 text-sm">
                    {automation.lastRunAt
                      ? new Date(automation.lastRunAt).toLocaleString()
                      : "Never"}
                  </div>
                </div>
                <div className="border border-zinc-300 bg-zinc-50 p-3">
                  <div className="text-[11px] font-black uppercase tracking-[0.16em] text-zinc-500">
                    Next run
                  </div>
                  <div className="mt-2 text-sm">
                    {automation.nextRunAt
                      ? new Date(automation.nextRunAt).toLocaleString()
                      : "Pending schedule"}
                  </div>
                </div>
                <div className="border border-zinc-300 bg-zinc-50 p-3">
                  <div className="text-[11px] font-black uppercase tracking-[0.16em] text-zinc-500">
                    Recent history
                  </div>
                  <div className="mt-2 space-y-2 text-sm">
                    {automation.history.slice(0, 3).map((entry) => (
                      <div key={entry.id} className="border border-zinc-300 bg-white p-2">
                        <div className="font-black uppercase tracking-[0.14em]">
                          {entry.status}
                        </div>
                        <div className="mt-1 text-zinc-600">{entry.summary}</div>
                      </div>
                    ))}
                    {automation.history.length === 0 ? (
                      <div className="text-zinc-500">No history yet.</div>
                    ) : null}
                  </div>
                </div>
              </div>
            </article>
          ))
        )}
      </section>
    </motion.div>
  );
}
