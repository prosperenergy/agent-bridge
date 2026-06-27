# Repo Audit — agent-bridge (2026-06-27)

## 1) 仓库用途与范围（What this repo does）
- 该仓库是本地双代理桥接工具：把 Claude Code 与 Codex 在同一工作流内做双向消息转发与协作。
- 运行形态为前台 `bridge.ts` + 后台持久 `daemon.ts` 两进程架构，并通过本地端口与协议层做连接与状态管理。
- 关键定位与边界已在 README 明确：本项目是本地开发工具，不是托管式多租户系统，也不是不可信工具之间的安全隔离层。

证据：
- `/home/runner/work/agent-bridge/agent-bridge/README.md:8`
- `/home/runner/work/agent-bridge/agent-bridge/README.md:10`
- `/home/runner/work/agent-bridge/agent-bridge/README.md:17`
- `/home/runner/work/agent-bridge/agent-bridge/README.md:25`

## 2) 结构审计（Repository structure）
- 顶层结构清晰：`src/`（核心实现）、`scripts/`（构建/发布辅助）、`plugins/`（插件打包产物）、`docs/`（架构与流程文档）、`.github/workflows/`（CI/CD）。
- `src/` 采用模块化拆分，职责边界明确（adapter、lifecycle、state、cli、protocol、budget 等）。
- 测试分层明确：`src/unit-test`（快速逻辑层）与 `src/integration-test`（真实进程/E2E）。

证据：
- `/home/runner/work/agent-bridge/agent-bridge/src`（目录结构）
- `/home/runner/work/agent-bridge/agent-bridge/CONTRIBUTING.md:50`
- `/home/runner/work/agent-bridge/agent-bridge/CONTRIBUTING.md:51`

## 3) 依赖与构建审计（Dependencies & build）
- 运行时与构建核心依赖较轻：主要开发依赖为 `@modelcontextprotocol/sdk`、`@types/bun`、`typescript`。
- 版本与运行时约束清晰：`packageManager` 为 `bun@1.3.11`，`engines.bun >=1.3.11`，脚本完整覆盖 typecheck/test/build/check/release smoke。
- 风险点：仓库高度依赖 Bun 生态与网络可用性；在受限网络环境下 `bun install` 无法拉包，会阻断本地校验。

证据：
- `/home/runner/work/agent-bridge/agent-bridge/package.json:6`
- `/home/runner/work/agent-bridge/agent-bridge/package.json:8`
- `/home/runner/work/agent-bridge/agent-bridge/package.json:23`
- `/home/runner/work/agent-bridge/agent-bridge/package.json:65`

本次本地校验尝试结果：
- 已尝试执行：`bun install --frozen-lockfile && bun run typecheck && bun test src`
- 结果：受环境网络限制（大量 `ConnectionRefused/FailedToOpenSocket`）未能完成依赖安装，故无法在当前环境完成 typecheck/test 的实跑确认。

## 4) CI/CD 审计（Workflows）
- CI 主链路较完善：
  - `ci.yml`：`unit` + `check` 双层校验，并在 Ubuntu/macOS 双平台执行，外加 Windows 端口清理专项作业。
  - `publish.yml`：release 触发后执行 `check`、构建、发布前后校验（含 registry 可见性与安装后版本一致性验证）。
  - `release-on-merge.yml` + `auto-release.yml`：形成 merge->bump->tag/release->publish 链路。
- 风险点：发布链强依赖 `RELEASE_PAT` 与 `NPM_TOKEN`；若权限/配置异常会直接卡住发布或造成流程中断。

证据：
- `/home/runner/work/agent-bridge/agent-bridge/.github/workflows/ci.yml:19`
- `/home/runner/work/agent-bridge/agent-bridge/.github/workflows/ci.yml:59`
- `/home/runner/work/agent-bridge/agent-bridge/.github/workflows/ci.yml:90`
- `/home/runner/work/agent-bridge/agent-bridge/.github/workflows/publish.yml:25`
- `/home/runner/work/agent-bridge/agent-bridge/.github/workflows/publish.yml:44`
- `/home/runner/work/agent-bridge/agent-bridge/.github/workflows/auto-release.yml:17`
- `/home/runner/work/agent-bridge/agent-bridge/.github/workflows/release-on-merge.yml:45`

## 5) 总体健康度（Overall health）
**结论：整体健康度中上（Good, with operational risks）。**

优点：
- 架构文档与贡献规范较完整，测试分层与 CI 流程清晰。
- 发布流程有多重门禁（check + smoke + post-publish verify），质量意识较强。

主要风险：
1. **发布密钥单点依赖风险**：`RELEASE_PAT` 失效会中断自动发布链。
2. **供应链风险**：GitHub Actions 主要使用 tag 版本（如 `actions/checkout@v4`），未 pin 到 commit SHA。
3. **平台覆盖风险**：Windows 专项作业目前 `continue-on-error: true`，会弱化失败信号。
4. **环境可重复性风险**：对 Bun 与外部网络依赖较重，离线/受限网络下本地验证不可用。

## 6) 测试/文档缺口（Missing tests/docs）
1. **测试缺口（流程层）**：缺少“发布链 secrets/权限预检与故障演练”文档化测试清单（例如 PAT 权限变更、token 失效应急演练）。
2. **测试缺口（平台层）**：Windows 端作业仍为 advisory，建议补充稳定性追踪标准与转正条件。
3. **文档缺口（运维层）**：虽有 `docs/RELEASING.md`，但缺一个“发布失败 runbook”（症状->排查->回滚/补救）速查页。
4. **文档缺口（治理层）**：未见依赖更新策略文档（如自动升级频率、风险分级、审批规则）。

## 7) 优先级改进建议（Top 5, prioritized）
1. **P1：为 Actions 关键步骤改为 pin 到 commit SHA**（先从 `actions/checkout`、`actions/setup-node`、`oven-sh/setup-bun` 开始），降低供应链漂移风险。  
2. **P1：补充发布失败 Runbook**（新增 `docs/` 运维文档，覆盖 `RELEASE_PAT/NPM_TOKEN`、tag/release不一致、registry 传播延迟等场景）。  
3. **P2：将 Windows 端口清理作业设定“转正门槛”**（连续稳定后移除 `continue-on-error`），提高跨平台回归拦截能力。  
4. **P2：建立依赖治理机制**（Dependabot/Renovate + 安全扫描 + 例行升级窗口），减少长期技术债与漏洞暴露窗口。  
5. **P3：增加离线/受限网络开发说明**（最小可运行路径、缓存策略、失败排障），提升贡献者可达性与复现效率。  

## 8) 本次审计变更范围
- 本次仅新增审计报告文件：
  - `/home/runner/work/agent-bridge/agent-bridge/docs/audits/repo-audit-2026-06-27.md`
- 未修改生产代码、CI 配置、密钥、依赖版本或其他已有文件。
