import { describe, expect, test } from "bun:test";
import {
  CLOSE_CODE_CONTRACT_MISMATCH,
  CLOSE_CODE_EVICTED_STALE,
  CLOSE_CODE_PAIR_MISMATCH,
  CLOSE_CODE_PROBE_IN_PROGRESS,
  CLOSE_CODE_REPLACED,
  CLOSE_CODE_TOKEN_MISMATCH,
  type ControlClientMessage,
  type ControlServerMessage,
  type DaemonStatus,
  type TurnPhase,
} from "../control-protocol";

const TURN_PHASES = ["idle", "running", "stalled", "aborted"] as const satisfies readonly TurnPhase[];

const STATUS = {
  bridgeReady: true,
  tuiConnected: true,
  threadId: "thread-123",
  queuedMessageCount: 2,
  proxyUrl: "ws://127.0.0.1:4501",
  appServerUrl: "ws://127.0.0.1:4500",
  pid: 4242,
  pairId: "pair-1",
  cwd: "/tmp/project",
  stateDir: "/tmp/project/.state",
  build: {
    version: "0.1.22",
    commit: "abc1234",
    bundle: "dist",
    contractVersion: 1,
    codeHash: "def5678abc90",
  },
  turnInProgress: true,
  turnPhase: "running",
  attentionWindowActive: true,
  appServerInfo: {
    version: "0.139.0",
    userAgent: "codex_cli_rs/0.139.0 (Linux 6.9; x64)",
    platformFamily: "unix",
    platformOs: "linux",
  },
} satisfies DaemonStatus;

const CLIENT_MESSAGES = [
  {
    type: "claude_connect",
    identity: {
      pairId: "pair-1",
      pairName: "main",
      cwd: "/tmp/project",
      baseDir: "/tmp",
      stateDir: "/tmp/project/.state",
      clientPid: 9001,
      contractVersion: 1,
      controlToken: "token-123",
    },
  },
  { type: "claude_disconnect" },
  {
    type: "claude_to_codex",
    requestId: "req-1",
    message: {
      id: "msg-1",
      source: "claude",
      content: "[IMPORTANT] Please review the latest patch.",
      timestamp: 1_719_590_400_000,
    },
    requireReply: true,
    onBusy: "steer",
    idempotencyKey: "reply-1",
    wrapUp: true,
  },
  { type: "status" },
  { type: "ack_resume", resumeId: "resume-1", status: "resumed" },
  { type: "probe_incumbent" },
  { type: "request_budget_refresh", requestId: "budget-1" },
] satisfies readonly ControlClientMessage[];

const SERVER_MESSAGES = [
  {
    type: "codex_to_claude",
    message: {
      id: "codex-1",
      source: "codex",
      content: "[STATUS] Tests passed.",
      timestamp: 1_719_590_401_000,
    },
  },
  {
    type: "claude_to_codex_result",
    requestId: "req-1",
    success: false,
    error: "Codex is busy",
    ok: false,
    code: "busy_reject",
    phase: "running",
    retryAfterMs: 3000,
  },
  {
    type: "turn_started",
    requestId: "req-1",
    idempotencyKey: "reply-1",
    threadId: "thread-123",
    turnId: "turn-456",
  },
  { type: "status", status: STATUS },
  { type: "incumbent_status", connected: true, alive: true },
  { type: "budget_refresh", requestId: "budget-1", snapshot: null },
] satisfies readonly ControlServerMessage[];

describe("control protocol contract", () => {
  test("keeps the supported turn phases explicit", () => {
    expect(TURN_PHASES).toEqual(["idle", "running", "stalled", "aborted"]);
  });

  test("keeps representative client message variants constructible", () => {
    expect(CLIENT_MESSAGES.map((message) => message.type)).toEqual([
      "claude_connect",
      "claude_disconnect",
      "claude_to_codex",
      "status",
      "ack_resume",
      "probe_incumbent",
      "request_budget_refresh",
    ]);
    expect(CLIENT_MESSAGES[2]).toMatchObject({
      type: "claude_to_codex",
      onBusy: "steer",
      idempotencyKey: "reply-1",
      wrapUp: true,
    });
  });

  test("keeps representative server message variants constructible", () => {
    expect(SERVER_MESSAGES.map((message) => message.type)).toEqual([
      "codex_to_claude",
      "claude_to_codex_result",
      "turn_started",
      "status",
      "incumbent_status",
      "budget_refresh",
    ]);
    expect(SERVER_MESSAGES[1]).toMatchObject({
      type: "claude_to_codex_result",
      code: "busy_reject",
      phase: "running",
      retryAfterMs: 3000,
    });
  });

  test("supports status payloads carrying both legacy and current turn fields", () => {
    expect(STATUS.turnInProgress).toBe(true);
    expect(STATUS.turnPhase).toBe("running");
    expect(STATUS.attentionWindowActive).toBe(true);
    expect(STATUS.build?.contractVersion).toBe(1);
    expect(STATUS.appServerInfo?.version).toBe("0.139.0");
  });

  test("reserves distinct websocket close codes for each admission outcome", () => {
    const codes = [
      CLOSE_CODE_REPLACED,
      CLOSE_CODE_EVICTED_STALE,
      CLOSE_CODE_PROBE_IN_PROGRESS,
      CLOSE_CODE_PAIR_MISMATCH,
      CLOSE_CODE_TOKEN_MISMATCH,
      CLOSE_CODE_CONTRACT_MISMATCH,
    ];

    expect(codes).toEqual([4001, 4002, 4003, 4004, 4005, 4006]);
    expect(new Set(codes).size).toBe(codes.length);
  });
});
