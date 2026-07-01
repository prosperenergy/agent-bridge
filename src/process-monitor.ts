import { execFileSync } from "node:child_process";

export interface ProcessMonitorEntry {
  pid: number;
  cpuPercent: number;
  memPercent: number;
  elapsedSeconds: number;
  command: string;
}

/**
 * The same process families the ad-hoc `ps | grep -Ei 'codex|claude|hermes|agent|ollama'`
 * incantation looks for — named here so the CLI and its tests share one definition.
 */
export const AGENT_PROCESS_PATTERN = /codex|claude|hermes|agent|ollama/i;

/**
 * Parses `ps -Ao pid=,pcpu=,pmem=,etimes=,command=` output. `etimes` (plural)
 * is elapsed time in whole seconds — a plain integer, unlike `etime`'s
 * `[[dd-]hh:]mm:ss` display string, which sorts wrong lexicographically the
 * moment two rows straddle a minute/hour/day boundary (e.g. "9:00" > "10:00"
 * as text). One entry per parseable line; anything that doesn't match the
 * expected column shape is skipped.
 */
export function parsePsMonitorOutput(output: string): ProcessMonitorEntry[] {
  const entries: ProcessMonitorEntry[] = [];
  for (const line of output.split(/\r?\n/)) {
    const match = line.match(/^\s*(\d+)\s+([\d.]+)\s+([\d.]+)\s+(\d+)\s+(.+?)\s*$/);
    if (!match) continue;
    const pid = Number.parseInt(match[1]!, 10);
    const elapsedSeconds = Number.parseInt(match[4]!, 10);
    if (!Number.isFinite(pid) || !Number.isFinite(elapsedSeconds)) continue;
    entries.push({
      pid,
      cpuPercent: Number.parseFloat(match[2]!),
      memPercent: Number.parseFloat(match[3]!),
      elapsedSeconds,
      command: match[5]!,
    });
  }
  return entries;
}

export function filterAgentProcesses(
  entries: ProcessMonitorEntry[],
  options: { excludePid?: number; pattern?: RegExp } = {},
): ProcessMonitorEntry[] {
  const pattern = options.pattern ?? AGENT_PROCESS_PATTERN;
  return entries.filter((entry) => entry.pid !== options.excludePid && pattern.test(entry.command));
}

/** Descending by elapsed time (longest-running first) — numeric, never string. */
export function sortByElapsedDesc(entries: ProcessMonitorEntry[]): ProcessMonitorEntry[] {
  return [...entries].sort((a, b) => b.elapsedSeconds - a.elapsedSeconds);
}

/** Render elapsed seconds the way `ps etime` would (`[[dd-]hh:]mm:ss`) — display only, never for sorting. */
export function formatElapsed(totalSeconds: number): string {
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  if (days > 0) return `${days}-${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
  if (hours > 0) return `${hours}:${pad(minutes)}:${pad(seconds)}`;
  return `${minutes}:${pad(seconds)}`;
}

/**
 * I/O shell: every currently-running process whose command line matches an
 * agent/bridge process family (codex/claude/hermes/agent/ollama by default),
 * sorted longest-running first. This backs `abg ps`, the supported
 * replacement for the ad-hoc
 * `ps -Ao pid,pcpu,pmem,etime,command | grep -Ei '...' | sort -k4 -r`
 * one-liner — whose `sort -k4` on the `etime` STRING column silently
 * misorders once rows cross a minute/hour/day boundary.
 */
export function listAgentProcesses(pattern: RegExp = AGENT_PROCESS_PATTERN): ProcessMonitorEntry[] {
  const output = execFileSync("ps", ["-Ao", "pid=,pcpu=,pmem=,etimes=,command="], { encoding: "utf-8" });
  const entries = filterAgentProcesses(parsePsMonitorOutput(output), {
    excludePid: process.pid,
    pattern,
  });
  return sortByElapsedDesc(entries);
}
