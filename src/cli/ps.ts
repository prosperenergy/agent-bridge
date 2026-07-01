import {
  AGENT_PROCESS_PATTERN,
  formatElapsed,
  listAgentProcesses,
  type ProcessMonitorEntry,
} from "../process-monitor";

export async function runPs(args: string[] = []) {
  // Unrecognized-argument check runs FIRST (and catches every non-recognized
  // token, not just ones starting with "-") so a typo is never silently
  // swallowed by a co-occurring --help/-h, and a stray positional argument
  // (e.g. `abg ps json`, forgetting the leading `--`) is never ignored as a
  // silent no-op.
  const unknown = args.filter((arg) => arg !== "--json" && arg !== "--help" && arg !== "-h");
  if (unknown.length > 0) {
    console.error(`Unknown ps option(s): ${unknown.join(", ")}`);
    printPsUsage();
    process.exit(1);
  }
  if (args.includes("--help") || args.includes("-h")) {
    printPsUsage();
    return;
  }
  const json = args.includes("--json");

  let entries: ProcessMonitorEntry[];
  try {
    entries = listAgentProcesses();
  } catch (err) {
    console.error(`Error: failed to list processes (${err instanceof Error ? err.message : String(err)})`);
    process.exit(1);
  }

  if (json) {
    console.log(JSON.stringify(entries, null, 2));
    return;
  }
  printTable(entries);
}

function printPsUsage() {
  console.log(
    `
Usage: abg ps [--json]

Lists running codex/claude/hermes/agent/ollama processes (pid, %CPU, %MEM,
elapsed time, command), sorted longest-running first.

Options:
  --json      Emit the raw entries as JSON instead of a table.
  --help, -h  Show this help message.
`.trim(),
  );
}

function printTable(entries: ProcessMonitorEntry[]) {
  if (entries.length === 0) {
    console.log(`No matching processes found (pattern: ${AGENT_PROCESS_PATTERN}).`);
    return;
  }

  const rows = entries.map((entry) => ({
    pid: String(entry.pid),
    cpu: entry.cpuPercent.toFixed(1),
    mem: entry.memPercent.toFixed(1),
    elapsed: formatElapsed(entry.elapsedSeconds),
    command: entry.command,
  }));

  const headers = { pid: "PID", cpu: "%CPU", mem: "%MEM", elapsed: "ELAPSED" };
  const keys = ["pid", "cpu", "mem", "elapsed"] as const;
  const widths = Object.fromEntries(
    keys.map((key) => [key, Math.max(headers[key].length, ...rows.map((row) => row[key].length))]),
  ) as Record<(typeof keys)[number], number>;

  const line = (row: { pid: string; cpu: string; mem: string; elapsed: string; command: string }) =>
    keys.map((key) => row[key].padStart(widths[key])).join("  ") + `  ${row.command}`;

  console.log(line({ ...headers, command: "COMMAND" }));
  for (const row of rows) console.log(line(row));
}
