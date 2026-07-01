import { describe, expect, test } from "bun:test";
import { listAgentProcesses } from "../process-monitor";

describe("listAgentProcesses (real ps I/O)", () => {
  test("shells out to the platform's real ps without throwing", () => {
    // Regression coverage for the GNU-procps-only `etimes` keyword, which
    // macOS's BSD `ps` rejects outright ("ps: illegal keyword or modifier:
    // etimes"). The pure-logic unit tests only ever fed hand-built fixture
    // strings into parsePsMonitorOutput and never exercised the real
    // `execFileSync("ps", [...])` call, so that platform-specific bug shipped
    // undetected on macos-latest CI. This test runs the real `ps` binary on
    // whatever platform executes the suite.
    let entries: ReturnType<typeof listAgentProcesses> | undefined;
    expect(() => {
      entries = listAgentProcesses();
    }).not.toThrow();
    expect(Array.isArray(entries)).toBe(true);
  });

  test("excludes its own process from the results", () => {
    const entries = listAgentProcesses();
    expect(entries.some((entry) => entry.pid === process.pid)).toBe(false);
  });
});
