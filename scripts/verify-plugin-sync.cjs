#!/usr/bin/env node

const { mkdtempSync, readFileSync, existsSync, rmSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join, relative, resolve } = require("node:path");
const { spawnSync } = require("node:child_process");
const { extractBuildCommit } = require("./bundle-commit.cjs");

const repoRoot = resolve(__dirname, "..");
const pluginBundles = [
  {
    label: "plugins/agentbridge/server/bridge-server.js",
    target: "bridge-plugin",
    output: resolve(repoRoot, "plugins/agentbridge/server/bridge-server.js"),
    outfileName: "bridge-server.js",
  },
  {
    label: "plugins/agentbridge/server/daemon.js",
    target: "daemon-plugin",
    output: resolve(repoRoot, "plugins/agentbridge/server/daemon.js"),
    outfileName: "daemon.js",
  },
];

function readSnapshot(path) {
  return existsSync(path) ? readFileSync(path) : null;
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    stdio: "inherit",
    ...options,
  });

  if (result.error) {
    console.error(`Failed to execute ${command}: ${result.error.message}`);
    process.exit(1);
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

// extractBuildCommit moved to scripts/bundle-commit.cjs (shared with
// smoke-pack and the release bump rebuild).

// ── Bundle output is bun-version-sensitive ───────────────────────────────────
// `bun build` codegen/minification can differ BYTE-FOR-BYTE between bun versions
// even for identical source. The committed bundles are produced with the pinned
// version (package.json `packageManager: bun@x.y.z`, mirrored in `.bun-version`).
// Because `engines.bun` is a `>=` range, a newer-but-allowed bun builds a
// byte-different bundle that is NOT a real source drift. Detect that case so we
// never tell a contributor to "commit" pure minifier noise.
function pinnedBunVersion() {
  let fromPkg = null;
  try {
    const pkg = JSON.parse(readFileSync(resolve(repoRoot, "package.json"), "utf-8"));
    const match = typeof pkg.packageManager === "string" && pkg.packageManager.match(/^bun@(.+)$/);
    if (match) fromPkg = match[1].trim();
  } catch {}
  let fromFile = null;
  try {
    const raw = readFileSync(resolve(repoRoot, ".bun-version"), "utf-8").trim();
    if (raw) fromFile = raw;
  } catch {}
  if (fromPkg && fromFile && fromPkg !== fromFile) {
    console.warn(
      `\n⚠ bun version pin mismatch: package.json packageManager=bun@${fromPkg} but .bun-version=${fromFile}. Align the two.`
    );
  }
  return fromPkg || fromFile;
}

function activeBunVersion() {
  const res = spawnSync("bun", ["--version"], {
    cwd: repoRoot,
    encoding: "utf-8",
    stdio: ["ignore", "pipe", "ignore"],
  });
  return res.status === 0 && typeof res.stdout === "string" ? res.stdout.trim() : null;
}

const pinnedBun = pinnedBunVersion();
const activeBun = activeBunVersion();
const bunVersionMismatch = Boolean(pinnedBun && activeBun && pinnedBun !== activeBun);
if (bunVersionMismatch) {
  console.warn(
    `\n⚠ Active bun ${activeBun} differs from the pinned build version ${pinnedBun} (.bun-version / packageManager).`
  );
  console.warn(
    "  Bundle bytes are bun-version-sensitive; any diff below is likely minifier drift, not a real source change."
  );
}

const tempDir = mkdtempSync(join(tmpdir(), "agentbridge-plugin-sync-"));

try {
  for (const bundle of pluginBundles) {
    const current = readSnapshot(bundle.output);
    const buildCommit = extractBuildCommit(current);
    const env = buildCommit
      ? { ...process.env, AGENTBRIDGE_BUILD_COMMIT_OVERRIDE: buildCommit }
      : process.env;
    const tempOutput = join(tempDir, bundle.outfileName);
    run("node", ["scripts/build-bundles.mjs", bundle.target, "--outfile", tempOutput], { env });
    bundle.generated = tempOutput;
  }

  const changedBundles = pluginBundles.filter((bundle) => {
    const current = readSnapshot(bundle.output);
    const generated = readSnapshot(bundle.generated);

    if (current === null || generated === null) {
      return current !== generated;
    }

    return !current.equals(generated);
  });

  if (changedBundles.length > 0) {
    if (bunVersionMismatch) {
      console.error(
        `\nPlugin bundle(s) differ, but you are on bun ${activeBun}, not the pinned build version ${pinnedBun}.`
      );
      console.error(
        "This is almost certainly bun-minifier drift, NOT a real source change — do NOT commit a rebuild from this bun."
      );
      console.error(
        `Switch to bun ${pinnedBun} (see .bun-version; a version manager like proto/mise/asdf picks it up), then re-run:`
      );
      console.error("  bun run verify:plugin-sync");
      console.error(
        "If it STILL differs on the pinned bun, it is a real drift — run `bun run build:plugin` and commit:"
      );
    } else {
      console.error(
        "\nPlugin bundles are out of sync with source. Run `bun run build:plugin` and commit the updated files:"
      );
    }
    for (const bundle of changedBundles) {
      console.error(`- ${bundle.label}`);
    }
    process.exit(1);
  }

  console.log("Plugin bundles are already in sync with source.");

  // Guard: ensure src/cli.ts has not been overwritten by a bundle artifact.
  const cliSource = resolve(repoRoot, "src/cli.ts");
  if (existsSync(cliSource)) {
    const cliContent = readFileSync(cliSource, "utf-8");
    const bundleMarkers = ["// @bun", "var __commonJS", "var __defProp = Object.defineProperty"];
    const found = bundleMarkers.find((m) => cliContent.includes(m));
    if (found) {
      console.error(
        `\nsrc/cli.ts contains bundle marker "${found}" — it looks like a compiled artifact was written back over the source file.`
      );
      console.error('Run: git restore src/cli.ts');
      process.exit(1);
    }
  }
  console.log("src/cli.ts is not a bundle artifact.");
} finally {
  rmSync(tempDir, { recursive: true, force: true });
}
