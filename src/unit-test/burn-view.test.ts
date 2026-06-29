import { describe, expect, test } from "bun:test";
import {
  agentBurnRates,
  agentRunway,
  agentWeeklyFiveHourWindowsLeft,
  hasAnyBurnSignal,
  windowBurnRate,
} from "../budget/burn-view";
import { STALE_MAX_AGE_SEC, type AgentUsage } from "../budget/types";

const TEST_NOW = 1_700_000_000;
const TWO_HOURS_SEC = 7_200;
const ONE_DAY_SEC = 86_400;
const ONE_WEEK_SEC = 604_800;

function usage(overrides: Partial<AgentUsage> = {}): AgentUsage {
  const gateUtil = overrides.gateUtil ?? 40;
  const warnUtil = overrides.warnUtil ?? gateUtil;
  return {
    ok: true,
    stale: false,
    gateUtil,
    warnUtil,
    fiveHour: { util: gateUtil, resetEpoch: TEST_NOW + TWO_HOURS_SEC },
    weekly: { util: warnUtil, resetEpoch: TEST_NOW + ONE_WEEK_SEC },
    remaining: 100 - gateUtil,
    rateLimitedUntil: 0,
    fetchedAt: TEST_NOW,
    parsedVia: "id-match",
    ...overrides,
  };
}

describe("burn-view: windowBurnRate / agentBurnRates", () => {
  test("windowBurnRate returns null for missing window or burnRate", () => {
    expect(windowBurnRate(null)).toBeNull();
    expect(windowBurnRate({ util: 10, resetEpoch: TEST_NOW + 1000 })).toBeNull();
  });

  test("windowBurnRate treats confidence as true only when burnConfident is true", () => {
    expect(windowBurnRate({ util: 10, resetEpoch: TEST_NOW + 1000, burnRate: 1.2 })).toEqual({
      pctPerHour: 1.2,
      confident: false,
    });
    expect(windowBurnRate({ util: 10, resetEpoch: TEST_NOW + 1000, burnRate: 1.2, burnConfident: true })).toEqual({
      pctPerHour: 1.2,
      confident: true,
    });
  });

  test("agentBurnRates returns both windows as null for missing usage", () => {
    expect(agentBurnRates(null)).toEqual({ fiveHour: null, weekly: null });
  });
});

describe("burn-view: agentRunway", () => {
  test("returns null for stale, ok=false, or non-decision-grade usage", () => {
    expect(agentRunway(usage({ stale: true }), TEST_NOW)).toBeNull();
    expect(agentRunway(usage({ ok: false }), TEST_NOW)).toBeNull();
    expect(
      agentRunway(
        usage({
          fetchedAt: TEST_NOW - STALE_MAX_AGE_SEC - 1,
          fiveHour: { util: 40, resetEpoch: TEST_NOW + TWO_HOURS_SEC, burnRate: 2, burnConfident: true, runwaySeconds: 1800 },
        }),
        TEST_NOW,
      ),
    ).toBeNull();
  });

  test("selects the shortest qualifying runway_seconds without recomputing", () => {
    const result = agentRunway(
      usage({
        fiveHour: {
          util: 40,
          resetEpoch: TEST_NOW + TWO_HOURS_SEC,
          burnRate: 3,
          burnConfident: true,
          runwaySeconds: 3600,
          depletedAtEpoch: TEST_NOW + 3600,
        },
        weekly: {
          util: 30,
          resetEpoch: TEST_NOW + ONE_DAY_SEC,
          burnRate: 1,
          burnConfident: true,
          runwaySeconds: 1800,
        },
      }),
      TEST_NOW,
    );

    expect(result).toEqual({
      seconds: 1800,
      basis: "weekly",
      depletedAtEpoch: null,
    });
  });

  test("preserves depletedAtEpoch from the selected runway window", () => {
    const result = agentRunway(
      usage({
        fiveHour: {
          util: 40,
          resetEpoch: TEST_NOW + TWO_HOURS_SEC,
          burnRate: 3,
          burnConfident: true,
          runwaySeconds: 1200,
          depletedAtEpoch: TEST_NOW + 1200,
        },
        weekly: {
          util: 30,
          resetEpoch: TEST_NOW + ONE_DAY_SEC,
          burnRate: 1,
          burnConfident: true,
          runwaySeconds: 2400,
          depletedAtEpoch: TEST_NOW + 2400,
        },
      }),
      TEST_NOW,
    );

    expect(result).toEqual({
      seconds: 1200,
      basis: "fiveHour",
      depletedAtEpoch: TEST_NOW + 1200,
    });
  });

  test("ignores windows with reset<=now, non-confident burn, or missing runway", () => {
    const result = agentRunway(
      usage({
        fiveHour: {
          util: 40,
          resetEpoch: TEST_NOW,
          burnRate: 2,
          burnConfident: true,
          runwaySeconds: 1000,
        },
        weekly: {
          util: 50,
          resetEpoch: TEST_NOW + ONE_DAY_SEC,
          burnRate: 1,
          burnConfident: false,
          runwaySeconds: 900,
        },
      }),
      TEST_NOW,
    );

    expect(result).toBeNull();
  });
});

describe("burn-view: weekly window count + signal presence", () => {
  test("agentWeeklyFiveHourWindowsLeft returns value only for decision-grade confident weekly runway", () => {
    const positive = agentWeeklyFiveHourWindowsLeft(
      usage({
        weekly: {
          util: 70,
          resetEpoch: TEST_NOW + ONE_DAY_SEC,
          burnRate: 1.2,
          burnConfident: true,
          runwaySeconds: 7200,
          fiveHourWindowsLeft: 3,
        },
      }),
      TEST_NOW,
    );
    expect(positive).toBe(3);

    expect(
      agentWeeklyFiveHourWindowsLeft(
        usage({
          weekly: {
            util: 70,
            resetEpoch: TEST_NOW + ONE_DAY_SEC,
            burnRate: 1.2,
            burnConfident: true,
          },
        }),
        TEST_NOW,
      ),
    ).toBeNull();
  });

  test("hasAnyBurnSignal returns true if any side has rate or runway", () => {
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

    expect(
      hasAnyBurnSignal(
        {
          claude: { fiveHour: null, weekly: null },
          codex: { fiveHour: null, weekly: { pctPerHour: 0.8, confident: false } },
        },
        { claude: null, codex: null },
      ),
    ).toBe(true);

    expect(
      hasAnyBurnSignal(
        {
          claude: { fiveHour: null, weekly: null },
          codex: { fiveHour: null, weekly: null },
        },
        {
          claude: { seconds: 3600, basis: "fiveHour", depletedAtEpoch: null },
          codex: null,
        },
      ),
    ).toBe(true);
  });
});
