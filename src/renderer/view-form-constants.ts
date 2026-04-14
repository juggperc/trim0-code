import type { AutomationDefinition, McpServerConfig } from "@shared/types";

export type ProviderFormState = {
  label: string;
  apiKey: string;
  baseUrl: string;
  defaultModel: string;
};

export const INITIAL_PROVIDER_FORM: ProviderFormState = {
  label: "OpenRouter",
  apiKey: "",
  baseUrl: "https://openrouter.ai/api/v1",
  defaultModel: "openai/gpt-4.1-mini",
};

export type CustomMcpFormState = {
  id?: string;
  kind: "http" | "stdio";
  label: string;
  command: string;
  url: string;
  args: string;
  env: string;
  authMode: McpServerConfig["authMode"];
  enabled: boolean;
  licenseKey: string;
};

export const INITIAL_CUSTOM_MCP_FORM: CustomMcpFormState = {
  kind: "http",
  label: "",
  command: "",
  url: "",
  args: "",
  env: "",
  authMode: "none",
  enabled: true,
  licenseKey: "",
};

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
