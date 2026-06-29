import { describe, expect, test } from "bun:test";
import {
  agentBurnRates,
  agentRunway,
  agentWeeklyFiveHourWindowsLeft,
  hasAnyBurnSignal,
  windowBurnRate,
} from "../budget/burn-view";
import { STALE_MAX_AGE_SEC, type AgentUsage } from "../budget/types";

const NOW = 1_700_000_000;

function usage(overrides: Partial<AgentUsage> = {}): AgentUsage {
  const gateUtil = overrides.gateUtil ?? 40;
  const warnUtil = overrides.warnUtil ?? gateUtil;
  return {
    ok: true,
    stale: false,
    gateUtil,
    warnUtil,
    fiveHour: { util: gateUtil, resetEpoch: NOW + 7_200 },
    weekly: { util: warnUtil, resetEpoch: NOW + 604_800 },
    remaining: 100 - gateUtil,
    rateLimitedUntil: 0,
    fetchedAt: NOW,
    parsedVia: "id-match",
    ...overrides,
  };
}

describe("burn-view: windowBurnRate / agentBurnRates", () => {
  test("windowBurnRate: 缺失窗口或 burnRate 时返回 null", () => {
    expect(windowBurnRate(null)).toBeNull();
    expect(windowBurnRate({ util: 10, resetEpoch: NOW + 1000 })).toBeNull();
  });

  test("windowBurnRate: burnConfident 仅 true 才视为 confident", () => {
    expect(windowBurnRate({ util: 10, resetEpoch: NOW + 1000, burnRate: 1.2 })).toEqual({
      pctPerHour: 1.2,
      confident: false,
    });
    expect(windowBurnRate({ util: 10, resetEpoch: NOW + 1000, burnRate: 1.2, burnConfident: true })).toEqual({
      pctPerHour: 1.2,
      confident: true,
    });
  });

  test("agentBurnRates: null usage 回落为双 null", () => {
    expect(agentBurnRates(null)).toEqual({ fiveHour: null, weekly: null });
  });
});

describe("burn-view: agentRunway", () => {
  test("在 stale / ok=false / 非 decision-grade 时保守返回 null", () => {
    expect(agentRunway(usage({ stale: true }), NOW)).toBeNull();
    expect(agentRunway(usage({ ok: false }), NOW)).toBeNull();
    expect(
      agentRunway(
        usage({
          fetchedAt: NOW - STALE_MAX_AGE_SEC - 1,
          fiveHour: { util: 40, resetEpoch: NOW + 7200, burnRate: 2, burnConfident: true, runwaySeconds: 1800 },
        }),
        NOW,
      ),
    ).toBeNull();
  });

  test("选择满足条件窗口里的最短 runway_seconds（不做再计算）", () => {
    const result = agentRunway(
      usage({
        fiveHour: {
          util: 40,
          resetEpoch: NOW + 7200,
          burnRate: 3,
          burnConfident: true,
          runwaySeconds: 3600,
          depletedAtEpoch: NOW + 3600,
        },
        weekly: {
          util: 30,
          resetEpoch: NOW + 86_400,
          burnRate: 1,
          burnConfident: true,
          runwaySeconds: 1800,
        },
      }),
      NOW,
    );

    expect(result).toEqual({
      seconds: 1800,
      basis: "weekly",
      depletedAtEpoch: null,
    });
  });

  test("忽略 reset 失效 / 非 confident / 缺失 runwaySeconds 的窗口", () => {
    const result = agentRunway(
      usage({
        fiveHour: {
          util: 40,
          resetEpoch: NOW,
          burnRate: 2,
          burnConfident: true,
          runwaySeconds: 1000,
        },
        weekly: {
          util: 50,
          resetEpoch: NOW + 86_400,
          burnRate: 1,
          burnConfident: false,
          runwaySeconds: 900,
        },
      }),
      NOW,
    );

    expect(result).toBeNull();
  });
});

describe("burn-view: weekly window count + signal presence", () => {
  test("agentWeeklyFiveHourWindowsLeft: 仅在 weekly decision-grade 且 confident+runway 存在时返回值", () => {
    const positive = agentWeeklyFiveHourWindowsLeft(
      usage({
        weekly: {
          util: 70,
          resetEpoch: NOW + 86_400,
          burnRate: 1.2,
          burnConfident: true,
          runwaySeconds: 7200,
          fiveHourWindowsLeft: 3,
        },
      }),
      NOW,
    );
    expect(positive).toBe(3);

    expect(
      agentWeeklyFiveHourWindowsLeft(
        usage({
          weekly: {
            util: 70,
            resetEpoch: NOW + 86_400,
            burnRate: 1.2,
            burnConfident: true,
          },
        }),
        NOW,
      ),
    ).toBeNull();
  });

  test("hasAnyBurnSignal: 任一侧有 rate 或 runway 即为 true", () => {
    expect(
      hasAnyBurnSignal(
        {
          claude: { fiveHour: null, weekly: null },
          codex: { fiveHour: null, weekly: null },
        },
        { claude: null, codex: null },
      ),
    ).toBe(false);

    expect(
      hasAnyBurnSignal(
        {
          claude: { fiveHour: { pctPerHour: 1, confident: true }, weekly: null },
          codex: { fiveHour: null, weekly: null },
        },
        { claude: null, codex: null },
      ),
    ).toBe(true);
  });
});
