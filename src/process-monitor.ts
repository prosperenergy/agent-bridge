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
 *
 * Word-boundary anchored so the bare `agent` alternative does not swallow
 * unrelated hits: without `\b`, it would match this project's OWN daemon/
 * bridge-server processes (their command lines contain "agentbridge") and
 * compound OS agent names with no separator (e.g. macOS's `UserEventAgent`,
 * `CalendarAgent`). It still matches hyphenated system agents like
 * `ssh-agent`/`gpg-agent` — accepted as a known limitation of a lightweight
 * keyword lister, not a rigorous AgentBridge-identity matcher (see
 * process-lifecycle.ts's isAgentBridgeProcess/isAgentBridgeDaemon for that).
 */
export const AGENT_PROCESS_PATTERN = /\b(?:codex|claude|hermes|agent|ollama)\b/i;

/**
 * Parses `ps -Ao pid=,pcpu=,pmem=,etime=,command=` output. `etime` (the
 * portable BSD-and-GNU `[[dd-]hh:]mm:ss` display string — NOT the GNU/procps-
 * only `etimes` seconds-integer keyword, which macOS's BSD `ps` rejects
 * outright) is parsed into numeric seconds by {@link parseEtimeToSeconds} so
 * sorting is always numeric, never the lexicographic string sort that misorders
 * once two rows straddle a minute/hour/day boundary (e.g. "9:00" > "10:00" as
 * text). One entry per parseable line; anything that doesn't match the
 * expected column shape (including an unparseable etime) is skipped.
 */
export function parsePsMonitorOutput(output: string): ProcessMonitorEntry[] {
  const entries: ProcessMonitorEntry[] = [];
  for (const line of output.split(/\r?\n/)) {
    const match = line.match(/^\s*(\d+)\s+([\d.]+)\s+([\d.]+)\s+(\S+)\s+(.+?)\s*$/);
    if (!match) continue;
    const pid = Number.parseInt(match[1]!, 10);
    const elapsedSeconds = parseEtimeToSeconds(match[4]!);
    if (!Number.isFinite(pid) || elapsedSeconds === null) continue;
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

/**
 * Parses a `ps etime` value (`[[dd-]hh:]mm:ss`, e.g. "05:09", "1:02:03",
 * "2-03:04:05") into whole seconds. Returns null for anything that doesn't
 * match the format, so the caller can skip the line rather than sort on a
 * bogus 0.
 */
export function parseEtimeToSeconds(etime: string): number | null {
  const match = etime.match(/^(?:(\d+)-)?(?:(\d+):)?(\d{1,2}):(\d{1,2})$/);
  if (!match) return null;
  const days = match[1] ? Number.parseInt(match[1], 10) : 0;
  const hours = match[2] ? Number.parseInt(match[2], 10) : 0;
  const minutes = Number.parseInt(match[3]!, 10);
  const seconds = Number.parseInt(match[4]!, 10);
  return days * 86400 + hours * 3600 + minutes * 60 + seconds;
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

/** 16MB — generous headroom over the default 1MB execFileSync stdout cap for a system-wide `ps -A` dump. */
const PS_MAX_BUFFER_BYTES = 16 * 1024 * 1024;

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
  const output = execFileSync("ps", ["-Ao", "pid=,pcpu=,pmem=,etime=,command="], {
    encoding: "utf-8",
    maxBuffer: PS_MAX_BUFFER_BYTES,
  });
  const entries = filterAgentProcesses(parsePsMonitorOutput(output), {
    excludePid: process.pid,
    pattern,
  });
  return sortByElapsedDesc(entries);
}
