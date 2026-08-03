# Repo Audit — agent-bridge (2026-06-27)

## 1) What this repo does
- This repository is a local dual-agent bridge tool that enables bidirectional message forwarding and collaboration between Claude Code and Codex in one workflow.
- Runtime architecture is a two-process model: foreground `bridge.ts` + persistent background `daemon.ts`, with local ports/protocol layers for connectivity and state management.
- README clearly defines scope and boundaries: this is a local developer tool, not a hosted multi-tenant system, and not a hardened security boundary between untrusted tools.

Evidence:
- `README.md:8`
- `README.md:10`
- `README.md:17`
- `README.md:25`

## 2) Repository structure
- Top-level structure is clear: `src/` (core implementation), `scripts/` (build/release helpers), `plugins/` (plugin artifacts), `docs/` (architecture/process docs), `.github/workflows/` (CI/CD).
- `src/` is modular with clear responsibility boundaries (adapter, lifecycle, state, cli, protocol, budget, etc.).
- Test layering is explicit: `src/unit-test` (fast logic layer) and `src/integration-test` (real process/E2E).

Evidence:
- `src/` (directory structure)
- `CONTRIBUTING.md:50`
- `CONTRIBUTING.md:51`

## 3) Dependencies & build
- Runtime/build core dependencies are relatively lean: main dev dependencies are `@modelcontextprotocol/sdk`, `@types/bun`, and `typescript`.
- Version/runtime constraints are explicit: `packageManager` is `bun@1.3.11`, `engines.bun >=1.3.11`, and scripts comprehensively cover typecheck/test/build/check/release smoke.
- Risk: the repo is highly dependent on the Bun ecosystem and network availability; in restricted network environments, `bun install` may fail and block local validation.

Evidence:
- `package.json:6`
- `package.json:8`
- `package.json:23`
- `package.json:65`

Local validation attempt in this run:
- Attempted: `bun install --frozen-lockfile && bun run typecheck && bun test src`
- Result: dependency installation did not complete due to environment network restrictions (many `ConnectionRefused/FailedToOpenSocket` errors), so typecheck/test execution could not be fully confirmed in this environment.

## 4) CI/CD workflows
- Primary CI path is solid:
  - `ci.yml`: two-layer validation (`unit` + `check`) on Ubuntu/macOS, plus a dedicated Windows port-cleanup job.
  - `publish.yml`: after release trigger, runs `check`, build, and pre/post-publish verifications (including registry visibility and installed version consistency).
  - `release-on-merge.yml` + `auto-release.yml`: forms a merge -> bump -> tag/release -> publish chain.
- Risk: release chain strongly depends on `RELEASE_PAT` and `NPM_TOKEN`; permission/config drift can block release flow.

Evidence:
- `.github/workflows/ci.yml:19`
- `.github/workflows/ci.yml:59`
- `.github/workflows/ci.yml:90`
- `.github/workflows/publish.yml:25`
- `.github/workflows/publish.yml:44`
- `.github/workflows/auto-release.yml:17`
- `.github/workflows/release-on-merge.yml:45`

## 5) Overall health
**Conclusion: Good overall health, with notable operational risks.**

Strengths:
- Architecture docs and contribution guidance are reasonably complete.
- Test layering and CI flow are clear.
- Release pipeline uses multiple gates (`check` + smoke + post-publish verify), showing strong quality controls.

Key risks:
1. **Single-point dependency on release secrets**: `RELEASE_PAT` failure can break the automated release chain.
2. **Supply-chain risk**: GitHub Actions largely use mutable major-version tags (e.g., `actions/checkout@v5`) that automatically move to newer patch/minor releases within that major version, so CI may run different code over time without explicit workflow-file changes, rather than immutable commit-SHA pinning.
3. **Platform-coverage risk**: Windows job currently uses `continue-on-error: true`, weakening failure signal.
4. **Reproducibility risk**: heavy dependency on Bun + external network availability reduces validation reliability in offline/restricted setups.

## 6) Missing tests/docs
1. **Testing gap (process level)**: no documented test checklist for release-chain secret/permission prechecks and failure drills (e.g., PAT permission change, token expiration drills).
2. **Testing gap (platform level)**: Windows job remains advisory; should define stability tracking and graduation criteria.
3. **Documentation gap (operations)**: `docs/RELEASING.md` exists, but there is no concise release-failure runbook (symptom -> diagnosis -> rollback/recovery).
4. **Documentation gap (governance)**: no clear dependency update policy doc (upgrade cadence, risk tiers, approval rules).

## 7) Top 5 prioritized recommendations
1. **P1: Pin critical GitHub Actions steps to commit SHA** (start with `actions/checkout`, `oven-sh/setup-bun`, and `actions/setup-node` where currently used in release publishing) to reduce supply-chain drift risk.
2. **P1: Add a release-failure runbook** (new `docs/` operational doc covering `RELEASE_PAT/NPM_TOKEN`, tag/release mismatch, registry propagation delays, etc.).
3. **P2: Define graduation criteria for the Windows port-cleanup job** (remove `continue-on-error` after sustained stability) to improve cross-platform regression blocking.
4. **P2: Establish dependency governance** (Dependabot/Renovate + security scanning + scheduled upgrade windows) to reduce long-tail tech debt and vulnerability exposure.
5. **P3: Add guidance for offline/restricted-network development** (minimum viable workflow, cache strategy, failure troubleshooting) to improve contributor reproducibility.

## 8) Scope of this audit change
- This audit added only one report file:
  - `docs/audits/repo-audit-2026-06-27.md`
- No production code, CI config, secrets, dependency versions, or other existing files were modified by this audit itself.
