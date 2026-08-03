# Repo Audit — agent-bridge（2026-06-28）

## 审计范围

- 仓库结构
- 运行时与开发依赖
- CI/CD 与发布链路
- 当前健康状况、主要风险、缺失测试/文档

## 审计方法

- 依据仓库内现有文档、脚本、工作流与测试目录进行静态审阅。
- 尝试执行 `bun install --frozen-lockfile && bun run typecheck && bun test src` 做本地校验，但依赖下载阶段出现多项 `ConnectionRefused` / `FailedToOpenSocket`，因此本次健康结论以静态审阅为主。

## 一句话结论

这是一个用 Bun + TypeScript 构建的本地双进程桥接工具；整体测试与发布链路较完整，但文档同步、发布运维依赖与平台门禁成熟度仍有改进空间。参考：`README.md:8-15`, `README.md:41-73`, `.github/workflows/ci.yml:19-109`, `.github/workflows/release-on-merge.yml:22-142`, `.github/workflows/publish.yml:1-187`。

## 仓库用途

- 项目定位是“本地桥接 Claude Code 与 Codex 的双向通信工具”，不是托管服务，也不是通用多后端编排框架。参考：`README.md:17-30`。
- 架构是前台 `bridge.ts` + 后台 `daemon.ts` 的双进程模型，前者承接 Claude Code 插件侧通道，后者持有 Codex app-server 代理与桥状态。参考：`README.md:10-15`, `README.md:41-73`。

## 仓库结构概览

- `src/`：核心运行时代码与 CLI 命令实现。README 中已对关键入口文件给出结构化说明。参考：`README.md:211-260`。
- `plugins/agentbridge/`：Claude Code 插件与打包后的服务端 bundle。参考：`README.md:224-229`。
- `docs/`：包含架构、路线图、设计说明与测试计划。参考：`README.md:220-223`。
- `.github/workflows/`：包含 CI、自动 release、发布到 npm 的工作流。参考：`README.md:215-218`。

## 依赖与工具链

- 包管理器与运行时固定为 Bun，`packageManager` 为 `bun@1.3.11`，并通过 `engines.bun >=1.3.11` 约束版本。参考：`package.json:5-8`。
- 顶层开发依赖较少，主要是 `typescript`、`@types/bun`、`@modelcontextprotocol/sdk`。参考：`package.json:65-68`。
- 常用校验命令已经沉淀到脚本：`typecheck`、`test`、`check`、`smoke:built`、`smoke:pack`。参考：`package.json:23-44`。

## CI/CD 与发布链路

- CI 分成三层：
  - `unit`：Ubuntu + macOS 上跑快速单元层。参考：`.github/workflows/ci.yml:19-38`。
  - `check`：Ubuntu + macOS 上跑 `bun run check`，并增加 `smoke:built` 与 `smoke:pack`。参考：`.github/workflows/ci.yml:59-83`。
  - `windows-port-cleanup`：Windows 专项覆盖，但当前仍是 `continue-on-error: true` 的顾问型信号。参考：`.github/workflows/ci.yml:85-108`。
- 发布链路是三段式：
  1. `release-on-merge.yml`：push 到 `master` 后跑完整门禁并自动 bump patch 版本。参考：`.github/workflows/release-on-merge.yml:22-142`。
  2. `auto-release.yml`：检测 `package.json` 版本变更后创建 tag 与 GitHub Release。参考：`.github/workflows/auto-release.yml:1-93`。
  3. `publish.yml`：在 release 发布后再次跑 `bun run check`、构建、做 smoke、再发布 npm。参考：`.github/workflows/publish.yml:1-187`。
- 发布链路显式依赖 `RELEASE_PAT` 与 `NPM_TOKEN`；工作流对缺失密钥会 fail loudly，设计上是正确的，但也意味着发布可靠性强依赖仓库 secrets 管理。参考：`.github/workflows/release-on-merge.yml:41-60`, `.github/workflows/auto-release.yml:14-29`, `.github/workflows/publish.yml:39-47`, `docs/RELEASING.md:38-57`。

## 当前健康状况

- **优点**
  - 测试分层清晰：`CONTRIBUTING.md` 明确区分 unit 与 integration/E2E，仓库中可见大量 `src/unit-test/*.test.ts` 与 `src/integration-test/*.test.ts`。参考：`CONTRIBUTING.md:48-53`。
  - 发布链路有重复门禁：merge 前后、publish 前均会再次执行校验，降低错误产物发布概率。参考：`.github/workflows/release-on-merge.yml:98-126`, `.github/workflows/publish.yml:21-37`。
  - 安全文档明确强调本地环回通信、Research Preview 信任边界与漏洞提交流程。参考：`SECURITY.md:3-30`。

## 主要风险

1. **文档版本漂移风险**
   使用说明写的是 Bun `v1.0+`，而包元数据与 CI 实际都要求/固定在 1.3.11 系列；新贡献者容易按 README 成功安装到不满足要求的版本。参考：`README.md:77-83`, `CONTRIBUTING.md:5-10`, `package.json:5-8`, `.github/workflows/ci.yml:29-32`。

2. **发布文档与现实流程不完全一致**
   `docs/RELEASING.md` 仍写着 “PR #90 合入后再把 smoke 加到门禁”，但 `publish.yml` 已经包含 `smoke:built` 与 `smoke:pack`；文档状态落后于仓库现状。参考：`docs/RELEASING.md:79-89`, `.github/workflows/publish.yml:31-37`。

3. **Windows 覆盖仍非硬门禁**
   既然仓库已经承认该路径是“本地维护者无法覆盖”的平台专项检查，长期维持 `continue-on-error: true` 会让真实回归被降级为提示而不是阻断。参考：`.github/workflows/ci.yml:85-95`。

4. **发布链路对 secrets 的可用性高度敏感**
   当前自动发布完全依赖 `RELEASE_PAT` / `NPM_TOKEN`；虽然工作流有显式失败保护，但仍缺少一眼可见的“例行校验/轮换节奏”说明。参考：`.github/workflows/release-on-merge.yml:41-60`, `.github/workflows/auto-release.yml:14-29`, `.github/workflows/publish.yml:39-47`, `docs/RELEASING.md:38-57`。

## 缺失测试 / 文档

- **缺失的文档校准**：`README.md`、`CONTRIBUTING.md`、`docs/RELEASING.md` 与当前脚本/工作流之间存在漂移，说明“文档随行为变更同步更新”的约束还没有被流程化执行。参考：`CONTRIBUTING.md:33-46`, `CONTRIBUTING.md:62`, `README.md:77-83`, `docs/RELEASING.md:79-89`。
- **缺失的依赖维护自动化**：本次审计仅发现 `ci.yml`、`release-on-merge.yml`、`auto-release.yml`、`publish.yml` 四个工作流，未发现 `.github/dependabot.yml`；当前仓库缺少显式的依赖更新节奏声明或自动化入口。参考：`.github/workflows/ci.yml:1-109`, `.github/workflows/release-on-merge.yml:1-142`, `.github/workflows/auto-release.yml:1-93`, `.github/workflows/publish.yml:1-187`。
- **缺失的离线/受限网络校验说明**：贡献文档要求本地运行 Bun 校验，但没有说明当依赖拉取受限时的替代验证路径。参考：`CONTRIBUTING.md:37-46`。

## 5 条优先级最高的建议

1. **P1：统一 Bun 最低版本说明**
   立即把 `README.md` 与 `CONTRIBUTING.md` 里的 Bun 前置条件从 `v1.0+` 改成与 `package.json` / CI 一致的 `>=1.3.11`，避免新环境踩坑。参考：`README.md:77-83`, `CONTRIBUTING.md:5-10`, `package.json:5-8`。

2. **P2：修正文档中的发布链路陈旧描述**
   更新 `docs/RELEASING.md`，删除“等待 PR #90”这类已过期叙述，并准确反映 `publish.yml` 已经执行 smoke 校验的现状。参考：`docs/RELEASING.md:79-89`, `.github/workflows/publish.yml:31-37`。

3. **P3：为依赖维护建立显式机制**
   增加 Dependabot 或等价的人工维护节奏文档，尤其针对 Bun/TypeScript/MCP SDK 这类核心开发依赖，降低长期漂移与安全补丁滞后风险。

4. **P4：给 Windows 专项校验设定转正条件**
   保留当前 job 不变，但在文档或 issue 中明确“连续多少次稳定通过后转为硬门禁”，避免 `continue-on-error` 无限期停留。参考：`.github/workflows/ci.yml:90-95`。

5. **P5：补一份受限网络环境的贡献说明**
   在贡献文档中补充“依赖下载失败时的排查顺序 / 是否允许跳过 / 何时依赖 CI 代跑”的说明，减少外部贡献者在受限网络下的无效尝试。参考：`CONTRIBUTING.md:37-46`。

## 本次变更说明

- 本次自动化任务仅新增本审计文档，未修改业务逻辑、CLI、插件、工作流或发布配置。
