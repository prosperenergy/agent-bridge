import { describe, expect, test } from "bun:test";
import {
  AGENT_PROCESS_PATTERN,
  filterAgentProcesses,
  formatElapsed,
  parsePsMonitorOutput,
  sortByElapsedDesc,
  type ProcessMonitorEntry,
} from "../process-monitor";

describe("parsePsMonitorOutput", () => {
  test("parses pid/pcpu/pmem/etimes/command columns", () => {
    const entries = parsePsMonitorOutput(`
      101  12.5   2.2   540  /usr/bin/codex --enable tui_app_server
      102   0.0   0.1  3661  /bin/sh -c echo hello
    `);
    expect(entries).toEqual([
      { pid: 101, cpuPercent: 12.5, memPercent: 2.2, elapsedSeconds: 540, command: "/usr/bin/codex --enable tui_app_server" },
      { pid: 102, cpuPercent: 0.0, memPercent: 0.1, elapsedSeconds: 3661, command: "/bin/sh -c echo hello" },
    ]);
  });

  test("skips unparseable lines", () => {
    expect(parsePsMonitorOutput("\n   \nnot a process line\n")).toEqual([]);
  });
});

describe("filterAgentProcesses", () => {
  const entries: ProcessMonitorEntry[] = [
    { pid: 1, cpuPercent: 0, memPercent: 0, elapsedSeconds: 10, command: "/usr/bin/codex tui_app_server" },
    { pid: 2, cpuPercent: 0, memPercent: 0, elapsedSeconds: 20, command: "/usr/bin/claude --resume" },
    { pid: 3, cpuPercent: 0, memPercent: 0, elapsedSeconds: 30, command: "/usr/bin/vim notes.txt" },
    { pid: 4, cpuPercent: 0, memPercent: 0, elapsedSeconds: 40, command: "/usr/bin/ollama serve" },
  ];

  test("matches the codex/claude/hermes/agent/ollama family by default", () => {
    expect(filterAgentProcesses(entries)).toEqual([entries[0]!, entries[1]!, entries[3]!]);
  });

  test("excludes a given pid (the caller's own process)", () => {
    expect(filterAgentProcesses(entries, { excludePid: 2 })).toEqual([entries[0]!, entries[3]!]);
  });

  test("accepts a custom pattern", () => {
    expect(filterAgentProcesses(entries, { pattern: /vim/ })).toEqual([entries[2]!]);
  });

  test("default pattern matches the documented AGENT_PROCESS_PATTERN", () => {
    expect(AGENT_PROCESS_PATTERN.test("hermes-bridge")).toBe(true);
    expect(AGENT_PROCESS_PATTERN.test("agent-daemon")).toBe(true);
    expect(AGENT_PROCESS_PATTERN.test("nginx")).toBe(false);
  });
});

describe("sortByElapsedDesc", () => {
  test("sorts numerically, not lexicographically", () => {
    // The bug this replaces: `ps ... etime ... | sort -k4 -r` sorts the etime
    // DISPLAY STRING ("9:00" vs "10:00") lexicographically, so a 9-minute
    // process (540s) would incorrectly outrank a 10-minute one (600s) because
    // "9" > "1" as text. Sorting the numeric elapsedSeconds field must not.
    const nineMinutes: ProcessMonitorEntry = { pid: 1, cpuPercent: 0, memPercent: 0, elapsedSeconds: 540, command: "codex" };
    const tenMinutes: ProcessMonitorEntry = { pid: 2, cpuPercent: 0, memPercent: 0, elapsedSeconds: 600, command: "claude" };
    expect(sortByElapsedDesc([nineMinutes, tenMinutes])).toEqual([tenMinutes, nineMinutes]);
  });

  test("does not mutate the input array", () => {
    const input: ProcessMonitorEntry[] = [
      { pid: 1, cpuPercent: 0, memPercent: 0, elapsedSeconds: 10, command: "a" },
      { pid: 2, cpuPercent: 0, memPercent: 0, elapsedSeconds: 20, command: "b" },
    ];
    const sorted = sortByElapsedDesc(input);
    expect(sorted).not.toBe(input);
    expect(input[0]!.pid).toBe(1);
  });
});

describe("formatElapsed", () => {
  test("renders mm:ss under an hour", () => {
    expect(formatElapsed(5)).toBe("0:05");
    expect(formatElapsed(65)).toBe("1:05");
  });

  test("renders h:mm:ss under a day", () => {
    expect(formatElapsed(3661)).toBe("1:01:01");
  });

  test("renders d-hh:mm:ss at and beyond a day", () => {
    expect(formatElapsed(90061)).toBe("1-01:01:01");
  });
});
