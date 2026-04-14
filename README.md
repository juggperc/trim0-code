# trim0.code

**A desktop coding agent built on [trim0](https://trim0.dev).**

`trim0.code` is a native Electron + Bun application that puts a local AI coding agent directly on your machine. Open a workspace, chat with the agent, inspect diffs live, manage MCP servers, and schedule automations — all with the stark, utilitarian aesthetic that defines the trim0 brand.

---

## Status

**v1 Beta** — Core flows are implemented and typechecked. Packaging uses `electron-builder`; startup verifies OpenRouter via `/models`, MCP servers get periodic health checks and TTL-based tool-cache refresh, and the sidebar includes chat search (FTS5), per-chat workspace switching, and prefetch feedback.

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

- **Workspace file search** — The `search_files` tool still does naive linear text search capped at 500 files. A workspace-wide index (e.g. SQLite FTS5 over file contents, or an AST-based index) would scale better for very large repos.

### Completed (recent)

- **Packaging** — `electron-builder` is configured in `package.json` (`npm run dist` / `npm run package` after `npm run generate:icons` for platform icons).
- **Session title + sidebar** — Auto-generated titles sync to the sidebar immediately via the assistant-final event.
- **Per-chat workspace** — Sidebar selector binds the active chat to any known workspace without starting a new chat.
- **Prefetch feedback** — Hover prefetch shows a small “Prefetch” label with spinner.
- **Automation failures** — Failed runs trigger a desktop notification when supported.
- **Provider health on boot** — Bootstrap calls OpenRouter `/models` and surfaces success or failure via toast.
- **MCP health + cache TTL** — Runtime exposes `/mcp/health`; bootstrap checks enabled servers; tool cache refreshes after 6h (and on a 15m background sweep) when stale.
- **Chat history search** — Sidebar search uses SQLite FTS5 over user/assistant messages.
- **Chat hover hints** — Assistant messages highlight likely file paths and `snake_case` tool names with `title` tooltips.

### TODO (stretch)

- Richer workspace indexing for the `search_files` agent tool (beyond chat FTS).
- Optional Electron Forge pipeline or CI matrix for all target OSes.

---

## Getting Started

### Prerequisites

- **Node.js 20+** and **npm**
- **Bun** — required to run the sidecar runtime (`bun` must be in PATH)
- **Git**

### Install

```bash
npm install
```

### Develop

```bash
# Terminal 1 — watch mode for both renderer and electron code
npm run dev

# The Electron app will launch with hot-reload for the renderer
```

### Build

```bash
npm run build        # Type-check + compile all TypeScript + Vite production bundle
npm run generate:icons   # Optional: regenerate platform icons from build/icon-source.svg
npm run dist         # Same as build, then electron-builder → ./release
```

> **Note:** `bun` must be on PATH for the packaged app to spawn the sidecar. Run `npm run generate:icons` before your first `npm run dist` if `build/icon.ico` / `icon.icns` / `icon.png` are missing.

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
