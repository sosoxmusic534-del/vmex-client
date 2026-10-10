import { EventEmitter } from "node:events";
import type { LogLine } from "../shared/types";

const MAX = 600;
const lines: LogLine[] = [];
export const logEvents = new EventEmitter();

export function log(src: LogLine["src"], text: string, level?: LogLine["level"]) {
  const clean = text.replace(/\x1b\[[0-9;]*m/g, "").trim();
  if (!clean) return;
  const lvl = level ?? (/\b(error|fatal|failed)\b/i.test(clean) ? "error" : /\bwarn/i.test(clean) ? "warn" : "info");
  const line: LogLine = { t: Date.now(), src, level: lvl, text: clean.slice(0, 2000) };
  lines.push(line);
  if (lines.length > MAX) lines.splice(0, lines.length - MAX);
  logEvents.emit("line", line);
}

export const listLogs = () => [...lines];
export const clearLogs = () => {
  lines.length = 0;
};
