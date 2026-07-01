# `abg ps` Process-Monitoring Command — Manual E2E Test Plan

**Goal:** Verify `abg ps` correctly lists codex/claude/hermes/agent/ollama-family
processes across platforms, with correct sorting, filtering, and CLI error
handling.

**Code anchors:**

- `src/cli/ps.ts` — CLI argument parsing + table/JSON rendering.
- `src/process-monitor.ts` — `ps` invocation, parsing, filtering, sorting.

---

## Setup

Run these from a checkout of this repo, on both a Linux machine (or CI's
`ubuntu-latest`) and a macOS machine (or CI's `macos-latest`) — the two
platforms ship materially different `ps` implementations (GNU procps vs BSD),
which is the specific class of bug this plan exists to catch.

```bash
bun install
bun run build:cli   # or run directly via `bun run src/cli.ts ps ...`
```

## Scenarios

1. **Basic listing (both platforms)**

   ```bash
   agentbridge ps
   ```

   Expect: a table with columns `PID  %CPU  %MEM  ELAPSED  COMMAND`, no error,
   no crash. On macOS specifically, confirm this does NOT fail with `ps:
   illegal keyword or modifier: etimes` (the bug this command was fixed to
   avoid — macOS's BSD `ps` doesn't support the GNU-only `etimes` keyword;
   the command now uses the portable `etime` string and parses it itself).

2. **Sort order is numeric, not lexicographic**

   Start (or find) at least two long-running codex/claude processes whose
   elapsed times cross a string-sort boundary, e.g. one running ~9 minutes and
   another ~10+ minutes. Confirm the 10-minute one is listed FIRST (longest
   running first) — a naive string sort on the `ELAPSED` column would rank a
   "9:xx" row above a "10:xx" row.

3. **JSON output**

   ```bash
   agentbridge ps --json
   ```

   Expect valid JSON: an array of objects with `pid`, `cpuPercent`,
   `memPercent`, `elapsedSeconds`, `command`. `elapsedSeconds` must be a
   plain number (not a string), consistent with the table's `ELAPSED` column
   converted back from seconds.

4. **Self-exclusion**

   Confirm the current `abg ps` invocation's own process does not appear in
   its own output (check no row's PID matches the PID reported by
   `echo $$` / the shell running the command, and that the command isn't
   listed twice for repeated invocations).

5. **AgentBridge's own daemon/bridge-server processes are NOT falsely listed**
   as generic "agent" hits (regression check for the word-boundary fix)

   With a pair running (`agentbridge claude` in one terminal), run
   `agentbridge ps` from a DIFFERENT terminal and confirm:

   - The `daemon.js`/`bridge-server.js` processes (paths containing
     `.../plugins/agentbridge/server/...`) are excluded when the surrounding
     path has no separator before "agentbridge" (e.g. a global install path
     like `~/.agentbridge/...bundled/agentbridge/server/daemon.js` with no
     hyphen).
   - **Known, accepted limitation:** if the repo checkout directory itself is
     named with a hyphen (e.g. `agent-bridge`, as in THIS repo), those
     daemon/bridge-server rows MAY still appear, because the hyphen creates a
     word boundary the pattern legitimately matches (the same reason
     `ssh-agent`/`gpg-agent` still match). This is documented, tested
     behavior (see `AGENT_PROCESS_PATTERN`'s doc comment and the
     "known residual limitation" unit test in
     `src/unit-test/process-monitor.test.ts`), not a regression — do not
     file a bug for this specific case.

6. **CLI error handling**

   ```bash
   agentbridge ps --bogus
   ```

   Expect: `Unknown ps option(s): --bogus`, usage text, exit code 1.

   ```bash
   agentbridge ps --bogus -h
   ```

   Expect: the unknown-flag error still fires (exit code 1) — `-h` must NOT
   silently mask a real invalid flag.

   ```bash
   agentbridge ps json
   ```

   Expect: `Unknown ps option(s): json`, exit code 1 — a stray positional
   argument (a forgotten leading `--`) must be reported, not silently
   ignored.

   ```bash
   agentbridge ps --help
   ```

   Expect: usage text printed, exit code 0.

7. **No matching processes**

   On a machine/container with no codex/claude/hermes/agent/ollama processes
   running, confirm `agentbridge ps` prints
   `No matching processes found (pattern: ...)` instead of an empty table or
   a crash.

8. **Large process count (maxBuffer regression check)**

   On a machine with an unusually large number of running processes (or
   simulate by running many short-lived background processes), confirm
   `agentbridge ps` still completes without an `ENOBUFS`/"stdout maxBuffer
   length exceeded" error.
