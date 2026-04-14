/**
 * Heuristic: shell commands that are likely destructive or security-sensitive.
 * Normal read-only commands (git status, ls, cat) do not require confirmation.
 */
const DESTRUCTIVE_PATTERNS: RegExp[] = [
  /\brm\b/i,
  /\bdel\b/i,
  /\berase\b/i,
  /\brmdir\b/i,
  /\bformat\b/i,
  /\bmkfs\b/i,
  /\bdd\b/i,
  /\bchmod\b/i,
  /\bchown\b/i,
  /[>|]\s*\/dev\//,
  /\bcurl\b.*\|\s*(?:bash|sh|pwsh)/i,
  /\bwget\b.*\|\s*(?:bash|sh)/i,
  /:\(\)\s*\{\s*:\|:&\s*\};?:/,
  /\bshutdown\b/i,
  /\breboot\b/i,
  /\bformat-volume\b/i,
  /\bRemove-Item\b/i,
  /\bInvoke-WebRequest\b.*\|\s*iex/i,
];

export const isLikelyDestructiveShellCommand = (command: string): boolean => {
  const trimmed = command.trim();
  if (!trimmed) return false;
  return DESTRUCTIVE_PATTERNS.some((re) => re.test(trimmed));
};
