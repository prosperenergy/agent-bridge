import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";

const repoRoot = resolve(import.meta.dir, "../..");

/**
 * Tests the MECHANISM behind bundle-only-commit acceptance: build-bundles.mjs
 * honors AGENTBRIDGE_BUILD_COMMIT_OVERRIDE, which verify-plugin-sync.cjs uses to
 * rebuild comparison bundles with the commit already embedded in the committed
 * bundle (so a rebuild-only commit doesn't fail sync purely because HEAD moved).
 *
 * Deliberately does NOT run verify-plugin-sync against the live working tree:
 * that comparison legitimately fails whenever src/ has uncommitted changes,
 * which would make `bun test src` unrunnable exactly when developers need it —
 * mid-change. Whole-tree sync remains enforced by `bun run check` (pre-commit).
 */
describe("build-bundles commit override (verify-plugin-sync mechanism)", () => {
  test("AGENTBRIDGE_BUILD_COMMIT_OVERRIDE embeds the given commit into the bundle", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "abg-bundle-override-"));
    try {
      const outfile = join(tempDir, "bridge-server.js");
      const result = spawnSync(
        "node",
        ["scripts/build-bundles.mjs", "bridge-plugin", "--outfile", outfile],
        {
          cwd: repoRoot,
          encoding: "utf-8",
          env: { ...process.env, AGENTBRIDGE_BUILD_COMMIT_OVERRIDE: "feedc0de" },
        },
      );
      expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
      const bundle = readFileSync(outfile, "utf-8");
      expect(bundle).toContain('"feedc0de"');
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test("blank override is ignored and falls back to git HEAD", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "abg-bundle-override-"));
    try {
      const outfile = join(tempDir, "bridge-server.js");
      const result = spawnSync(
        "node",
        ["scripts/build-bundles.mjs", "bridge-plugin", "--outfile", outfile],
        {
          cwd: repoRoot,
          encoding: "utf-8",
          env: { ...process.env, AGENTBRIDGE_BUILD_COMMIT_OVERRIDE: "   " },
        },
      );
      expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
      const head = spawnSync("git", ["rev-parse", "--short", "HEAD"], {
        cwd: repoRoot,
        encoding: "utf-8",
      }).stdout.trim();
      expect(readFileSync(outfile, "utf-8")).toContain(`"${head}"`);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });
});

/**
 * Bundle bytes are bun-version-sensitive (`bun build` codegen differs between
 * versions), so the repo declares ONE canonical build version. `.bun-version`
 * (read by setup-bun via `bun-version-file` and by local version managers) must
 * stay in lockstep with package.json `packageManager: bun@x.y.z`. If they drift,
 * CI and local dev build with different bun versions and verify-plugin-sync
 * produces confusing false "out of sync" failures — this test is the guard.
 */
describe(".bun-version pin consistency", () => {
  const pkg = JSON.parse(readFileSync(resolve(repoRoot, "package.json"), "utf-8"));

  test(".bun-version equals the package.json packageManager bun version", () => {
    const dotBunVersion = readFileSync(resolve(repoRoot, ".bun-version"), "utf-8").trim();
    const match = String(pkg.packageManager ?? "").match(/^bun@(.+)$/);
    expect(
      match,
      `package.json "packageManager" should be "bun@<version>", got ${JSON.stringify(pkg.packageManager)}`,
    ).not.toBeNull();
    expect(dotBunVersion).toBe(match![1]);
  });

  test(".bun-version satisfies the engines.bun lower bound", () => {
    const dotBunVersion = readFileSync(resolve(repoRoot, ".bun-version"), "utf-8").trim();
    const floor = String(pkg.engines?.bun ?? "").match(/(\d+)\.(\d+)\.(\d+)/);
    expect(floor, `engines.bun should declare a floor, got ${JSON.stringify(pkg.engines?.bun)}`).not.toBeNull();
    const pinned = dotBunVersion.match(/(\d+)\.(\d+)\.(\d+)/);
    expect(pinned, `.bun-version should be a semver, got "${dotBunVersion}"`).not.toBeNull();
    const toNum = (m: RegExpMatchArray) => [Number(m[1]), Number(m[2]), Number(m[3])];
    const [pinMajor, pinMinor, pinPatch] = toNum(pinned!);
    const [floorMajor, floorMinor, floorPatch] = toNum(floor!);
    const pinTuple = pinMajor * 1e6 + pinMinor * 1e3 + pinPatch;
    const floorTuple = floorMajor * 1e6 + floorMinor * 1e3 + floorPatch;
    expect(pinTuple).toBeGreaterThanOrEqual(floorTuple);
  });
});
