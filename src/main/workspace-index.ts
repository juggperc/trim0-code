import fs from "node:fs";
import path from "node:path";

const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  "dist",
  "dist-electron",
  ".next",
  "build",
  "coverage",
  ".cache",
]);

const MAX_FILES = 15_000;

/**
 * Walk the workspace and collect relative file paths for local indexing (Open Folder flow).
 */
export const indexWorkspacePaths = (workspacePath: string): string[] => {
  const files: string[] = [];

  const walk = (dir: string) => {
    if (files.length >= MAX_FILES) {
      return;
    }
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (files.length >= MAX_FILES) break;
      if (SKIP_DIRS.has(entry.name)) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else {
        files.push(path.relative(workspacePath, full).replaceAll("\\", "/"));
      }
    }
  };

  walk(workspacePath);
  return files.sort((a, b) => a.localeCompare(b));
};
