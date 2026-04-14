import cron, { type ScheduledTask } from "node-cron";
import { CronExpressionParser } from "cron-parser";
import type { AutomationDefinition } from "../shared/types.js";

const computeNextRunAt = (schedule: string) => {
  try {
    return CronExpressionParser.parse(schedule).next().toDate().toISOString();
  } catch {
    return undefined;
  }
};

export class AutomationScheduler {
  private readonly tasks = new Map<string, ScheduledTask>();

  constructor(private readonly executeAutomation: (automationId: string, nextRunAt?: string) => Promise<void>) {}

  sync(automations: AutomationDefinition[]) {
    for (const [automationId, task] of this.tasks.entries()) {
      if (!automations.find((item) => item.id === automationId && item.status === "active")) {
        task.stop();
        this.tasks.delete(automationId);
      }
    }

    for (const automation of automations) {
      if (automation.status !== "active" || !cron.validate(automation.schedule)) {
        continue;
      }

      if (this.tasks.has(automation.id)) {
        continue;
      }

      const task = cron.schedule(automation.schedule, async () => {
        await this.executeAutomation(automation.id, computeNextRunAt(automation.schedule));
      });

      this.tasks.set(automation.id, task);
    }
  }

  stopAll() {
    for (const task of this.tasks.values()) {
      task.stop();
    }
    this.tasks.clear();
  }

  nextRunAt(schedule: string) {
    return computeNextRunAt(schedule);
  }
}
