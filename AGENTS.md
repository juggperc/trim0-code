# AGENTS.md

## Cursor Cloud specific instructions

### Project overview

trim0.code is a desktop AI coding agent built with Electron + React + Bun. See `README.md` for full architecture and feature details.

### Key services (dev mode)

| Service | Port | What it does |
|---------|------|--------------|
| Vite dev server | 5173 | Hot-reloads the React renderer |
| Electron main process | — | Desktop shell, IPC, SQLite |
| Bun sidecar runtime | 47822 | Agent loop, tools, OpenRouter, MCP client |

All three start together via `npm run dev`.

### Commands

| Task | Command |
|------|---------|
| Install deps | `npm install` |
| Dev (all 3 processes) | `npm run dev` |
| Lint | `npm run lint` |
| Typecheck | `npm run typecheck` |
| Build | `npm run build` |

### Gotchas

- **better-sqlite3 native module**: After `npm install`, you must rebuild better-sqlite3 for Electron's Node.js ABI. Run: `npm_config_runtime=electron npm_config_target=$(npx electron --version | sed 's/v//') npm_config_disturl=https://electronjs.org/headers npm rebuild better-sqlite3 --build-from-source`. Without this, Electron crashes with `NODE_MODULE_VERSION` mismatch.
- **Bun must be in PATH**: The Electron main process spawns `bun` as a child process. Install via `curl -fsSL https://bun.sh/install | bash` and ensure `~/.bun/bin` is on PATH.
- **Headless display**: Electron requires a display. Start Xvfb before running: `Xvfb :99 -screen 0 1280x720x24 -ac &` and `export DISPLAY=:99`. Note: the Electron window may not render visibly due to GPU compositing issues in Xvfb; the dbus/GPU stderr errors are harmless.
- **Renderer in browser**: Opening `http://127.0.0.1:5173` in a browser shows a gradient but no functional UI — the React app depends on `window.trim0` IPC bridge injected by Electron's preload script.
- **Pre-existing lint errors**: `npm run lint` reports 5 pre-existing errors (unused import, react-refresh warnings). These are in the existing codebase and not regressions.
- **No automated tests**: The project has no test framework or test suite configured.
- **OpenRouter API key**: Required to use the agent chat feature. Configured through the in-app Settings UI (no `.env` files).
