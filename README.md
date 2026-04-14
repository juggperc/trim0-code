# trim0.code

**A desktop coding agent built on [trim0](https://trim0.dev).**

`trim0.code` is a native Electron + Bun application that puts a local AI coding agent directly on your machine. Open a workspace, chat with the agent, inspect diffs live, manage MCP servers, and schedule automations — all with the stark, utilitarian aesthetic that defines the trim0 brand.

---

## Status

**v1 Beta** — Core flows are implemented and typechecked. See the [Build Directive](#-build-directive) below for what is done, what is wired but needs attention, and what is still TODO.

---

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                    Electron Main                      │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────┐  │
│  │  AppDatabase │  │   Scheduler  │  │   IPC    │  │
│  │  (SQLite)    │  │  (node-cron) │  │  Bridge  │  │
│  └──────────────┘  └──────────────┘  └──────────┘  │
│         ▲                 ▲               │         │
│         │    Bun Sidecar  │               │         │
│  ┌──────┴─────────────────┴───────────────┴──────┐ │
│  │              Runtime (Bun/Node)                │ │
│  │  Agent loop · Tools · OpenRouter · MCP client │ │
│  └─────────────────────────────────────────────────┘ │
│         ▲                                         │
│    NDJSON stream (real-time events)                │
│         ▲                                         │
│  ┌──────┴────────────────────────────────────────┐ │
│  │           Renderer (React + Vite)             │ │
│  │  3-panel layout · trim0 design system         │ │
│  └─────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────┘
```

### Key Files

| Path | Purpose |
|------|---------|
| `src/main/index.ts` | Electron main process — IPC handlers, lifecycle |
| `src/main/db.ts` | SQLite via better-sqlite3 — all persistence |
| `src/main/runtime-client.ts` | Spawns Bun sidecar, bridges HTTP ↔ IPC |
| `src/main/scheduler.ts` | Automation runner via node-cron |
| `src/runtime/server.ts` | Bun sidecar — agent loop, tools, OpenRouter, MCP |
| `src/preload/index.ts` | `window.trim0` API exposed to renderer |
| `src/shared/types.ts` | All shared TypeScript interfaces |
| `src/shared/brand.ts` | trim0 MCP preset, agent system prompt |
| `src/renderer/App.tsx` | Shell layout, sidebar, diff panel |
| `src/renderer/views/` | Chat, Plugins, Automations, Settings views |

---

## Features

### Implemented (v1 Beta)

- **Workspace management** — Open any local folder as a workspace; per-workspace session history
- **Chat interface** — Multi-turn conversation with the agent; streaming text, tool events, and status
- **Live diff panel** — See file writes and edits as unified diffs in real time
- **7 native tools** — `list_files`, `read_file`, `search_files`, `write_file`, `edit_file`, `run_command`, `call_mcp_tool`
- **OpenRouter integration** — Configure API key + base URL; dynamic model listing
- **Built-in trim0 MCP** — Pre-configured first-party plugin with 9 tools (`trim0_docs`, `trim0_skills`, `trim0_design_tokens`, etc.); supports both `X-Trim0-License-Key` and `Authorization: Bearer` auth modes
- **Custom MCP servers** — Add stdio or HTTP MCP servers; tool discovery and caching
- **Automations** — Create, edit, pause, resume, and schedule local automations with cron expressions; run history tracked per automation
- **Agent run persistence** — Every run is saved with its event log and summary
- **Real NDJSON streaming** — Bun sidecar streams events as `application/x-ndjson` lines in real time
- **Destructive action confirmation** — `run_command` pauses for explicit user approval before executing
- **Chat session deletion** — Delete sessions (and cascade-delete messages/diffs) from the sidebar
- **trim0 design system** — Zero-radius surfaces, uppercase labels, Silkscreen pixel wordmark, restrained cyan/violet/pink accents, grid canvas background

### Wired But Needs Attention

- **Workspace indexing** — The `search_files` tool does naive linear text search capped at 500 files. A proper index (SQLite FTS5, or a simple AST-based index) would make search significantly faster for large workspaces.
- **Error recovery** — OpenRouter/provider errors are surfaced to the user but the agent loop does not retry with backoff. If a provider call fails mid-run, the run fails. Adding retry logic with exponential backoff would improve robustness.
- **MCP tool schema caching** — Tool schemas are cached in SQLite per server but the cache is only invalidated on explicit "refresh" in the UI. A TTL-based invalidation would keep schemas fresher.

### TODO

- **macOS/Linux packaging** — The icon generation script works; `electron-builder` config is needed for `.dmg` and Linux builds
- **Electron Forge or electron-builder config** — `npm run build` currently runs Vite + TypeScript only. No `electron-builder`/`electron-forge` config exists yet to produce distributable `.exe`/`.app` bundles
- **Session title auto-update in sidebar** — When a chat's title is auto-generated by the agent, the sidebar doesn't reflect the new title until the next bootstrap
- **Workspace switch on sidebar** — The sidebar shows recent chats but doesn't yet let users switch the active workspace without creating a new chat
- **Hover prefetch visual feedback** — The session hover prefetch triggers but there's no visual indicator that a prefetch is in progress (the loading spinner only shows after the click)
- **Automation failure notifications** — Failed automation runs log to the DB but don't surface a desktop notification
- **Provider health check on startup** — The app boots without verifying the configured OpenRouter key is valid; a quick `/models` call on bootstrap would give immediate feedback
- **MCP server health monitoring** — MCP server status is stored but there's no periodic health check to detect if a server goes down
- **Session search** — No ability to search chat history across sessions
- **Variable/tool name hover in chat** — In the chat view, hover tooltips for file paths or tool names in agent messages would improve discoverability

---

## Getting Started

### Prerequisites

- **Node.js 20+** and **npm**
- **Bun** — required to run the sidecar runtime (`bun` must be in PATH)
- **Git**
- **A display** — Electron requires a GUI environment (X11, macOS Quartz, or Windows)

### Install

```bash
npm install
```

> **Note:** `bun.lock` is committed; npm will install from `package.json` and maintain its own `package-lock.json` (ignored by git).

### Develop

```bash
npm run dev
```

This starts three concurrent processes:
- **Vite** — hot-reloads the React renderer at `http://127.0.0.1:5173`
- **tsc --watch** — type-checks and compiles electron + runtime TypeScript to `dist-electron/`
- **electronmon** — runs the compiled electron app and restarts it when files change

> **Note:** The dev script requires a GUI environment. On headless servers, run `npm run build` instead and launch the packaged app directly.

### Build

```bash
npm run build        # Type-check + compile all TypeScript
npm run electron     # Compile electron + runtime TypeScript
npm run renderer     # Build renderer with Vite
```

> **Note:** No `electron-builder`/`electron-forge` config exists yet. For distributable builds, add one and run `npm run dist`.

### Configure

1. Go to **Settings** (⚙️ tab)
2. Enter your OpenRouter API key and select a default model
3. (Optional) Add your trim0 Polar license key under the trim0 panel
4. Go to **Plugins** (🔌 tab) to manage MCP servers

---

## Stack

| Layer | Technology |
|-------|------------|
| Desktop | Electron |
| Sidecar runtime | Bun (or Node.js) |
| Renderer | React 19, Vite, Tailwind v4 |
| UI components | shadcn/ui (customised zero-radius) |
| Animations | Framer Motion |
| Layout | react-resizable-panels |
| Database | better-sqlite3 |
| Scheduling | node-cron |
| MCP | @modelcontextprotocol/sdk |
| Diff | diff npm package |

---

## License

MIT
