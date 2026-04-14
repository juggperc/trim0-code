import type { ReactNode } from "react";

const TOOL_NAME_RE = /\b[a-z][a-z0-9]*(?:_[a-z][a-z0-9_]*)+\b/g;
const PATH_RE =
  /(?:\/[\w.-]+)+|(?:\.\/)?(?:[\w.-]+\/)+[\w.-]+|(?:[A-Za-z]:\\(?:[^\\/:*?"<>|\r\n]+\\)*[^\\/:*?"<>|\r\n]+)/g;

const mergeRanges = (
  text: string,
  patterns: Array<{ regex: RegExp; kind: "tool" | "path" }>,
) => {
  const ranges: Array<{ start: number; end: number; kind: "tool" | "path"; value: string }> = [];
  for (const { regex, kind } of patterns) {
    regex.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(text)) !== null) {
      ranges.push({ start: match.index, end: match.index + match[0].length, kind, value: match[0] });
    }
  }

  ranges.sort((a, b) => a.start - b.start || b.end - a.end);

  const kept: typeof ranges = [];
  let lastEnd = -1;
  for (const range of ranges) {
    if (range.start < lastEnd) {
      continue;
    }
    kept.push(range);
    lastEnd = range.end;
  }

  return kept;
};

export const highlightMessageContent = (content: string): ReactNode => {
  const ranges = mergeRanges(content, [
    { regex: new RegExp(PATH_RE.source, "g"), kind: "path" },
    { regex: new RegExp(TOOL_NAME_RE.source, "g"), kind: "tool" },
  ]);

  if (ranges.length === 0) {
    return content;
  }

  const nodes: ReactNode[] = [];
  let cursor = 0;

  for (const range of ranges) {
    if (range.start > cursor) {
      nodes.push(content.slice(cursor, range.start));
    }

    const label =
      range.kind === "tool" ? `Tool: ${range.value}` : `Path: ${range.value}`;

    nodes.push(
      <span
        key={`hl-${range.start}-${range.end}-${range.kind}-${nodes.length}`}
        className="cursor-help border-b border-dotted border-zinc-400"
        title={label}
      >
        {range.value}
      </span>,
    );
    cursor = range.end;
  }

  if (cursor < content.length) {
    nodes.push(content.slice(cursor));
  }

  return nodes;
};
