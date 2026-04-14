import type { McpServerConfig, McpToolInfo, ProviderConfig } from "./types.js";

export const APP_NAME = "trim0.code";
export const APP_TAGLINE = "An electrobun coding agent with native trim0 MCP integration.";
export const OPENROUTER_DEFAULT_BASE_URL = "https://openrouter.ai/api/v1";
export const OPENROUTER_DEFAULT_MODEL = "openai/gpt-4.1-mini";
export const TRIM0_ENDPOINT = "https://www.trim0.dev/api/mcp";

export const TRIM0_TOOLS: McpToolInfo[] = [
  {
    name: "trim0_agent_guide",
    description:
      "Agent playbook: when to use each tool, pairing workflows, example arguments, and license behavior.",
  },
  {
    name: "trim0_docs",
    description:
      "Fetch compressed documentation for npm, PyPI, cargo, Go, GitHub, or a public domain with token savings analytics.",
  },
  {
    name: "trim0_skills",
    description:
      "Fuzzy-search the trim0 skill library and return the best-matching SKILL.md content.",
  },
  {
    name: "trim0_changelog_digest",
    description:
      "Summarize recent npm releases with versions, dates, and release notes when available.",
  },
  {
    name: "trim0_design_tokens",
    description:
      "Extract heuristic design tokens from a public page, including colors, variables, fonts, and spacing hints.",
  },
  {
    name: "trim0_fixture_factory",
    description:
      "Generate example JSON fixtures from OpenAPI specs or JSON Schemas.",
  },
  {
    name: "trim0_package_json",
    description: "Summarize npm package.json metadata without dumping the full file.",
  },
  {
    name: "trim0_readme",
    description: "Fetch README content for npm packages or Rust crates.",
  },
  {
    name: "trim0_skill_list",
    description: "List all bundled trim0 skills with names and short descriptions.",
  },
];

export const DEFAULT_PROVIDER: ProviderConfig = {
  id: "provider-openrouter",
  kind: "openrouter",
  label: "OpenRouter",
  apiKey: "",
  baseUrl: OPENROUTER_DEFAULT_BASE_URL,
  defaultModel: OPENROUTER_DEFAULT_MODEL,
  headers: {},
  enabled: true,
};

export const TRIM0_PRESET: McpServerConfig = {
  id: "mcp-trim0",
  kind: "builtin",
  label: "trim0",
  url: TRIM0_ENDPOINT,
  args: [],
  env: {},
  authMode: "x-trim0-license-key",
  enabled: true,
  toolCache: TRIM0_TOOLS,
  builtInSlug: "trim0",
  licenseKey: "",
};

export const AGENT_SYSTEM_PROMPT = `You are trim0.code, a desktop coding agent built for fast local software work.

Rules:
- Be repository-aware before making changes.
- Prefer reading and searching before editing.
- Keep updates concise, direct, and useful.
- Use tools to inspect files, run commands, write code, search the workspace, and invoke MCP servers when they add real value.
- Avoid destructive commands unless explicitly requested.
- When editing code, keep changes intentional and cohesive.
- Surface diffs, file paths, and concrete outcomes.
- If trim0 MCP is enabled, use it for docs, skills, changelogs, design tokens, package summaries, and fixture generation instead of guessing.
- When information is uncertain, say so briefly and continue with the best grounded next action.

Working style:
- Start by orienting to the user's workspace.
- Keep tool use tight and purposeful.
- Prefer concise final answers that summarize what changed, what ran, and what still needs attention.
- Treat the current workspace as the source of truth.
`;
