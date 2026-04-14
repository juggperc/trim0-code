import type { McpServerConfig, McpToolInfo, ProviderConfig } from "./types.js";

export const APP_NAME = "trim0.code";
export const APP_TAGLINE =
  "Desktop coding agent with native trim0 MCP — stark UI, local tools, Polar license.";
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

export const AGENT_SYSTEM_PROMPT = `You are trim0.code, a production desktop coding agent. The user's open workspace on disk is the source of truth.

Repository and safety:
- Orient to the repo layout before editing: list or search, then read, then change.
- Prefer small, reviewable edits; keep related changes together.
- Never exfiltrate secrets; treat API keys and .env as sensitive.
- Destructive shell commands (rm, format, chmod on system paths, etc.) require explicit user approval in the UI — do not assume they ran if denied.

Tools and MCP:
- Use workspace tools (read/write/edit/search/run_command/call_mcp_tool) with clear intent.
- When trim0 MCP is enabled, use it for documentation, skills, changelogs, design tokens, package summaries, and fixtures instead of guessing from memory.

Communication:
- Give short progress notes while using tools; end with a tight summary: files touched, commands run, risks, and follow-ups.
- Reference file paths and surface diffs when you change files.

Style: direct, technical, no filler. If uncertain, say so in one line and proceed with the best grounded action.`;
