# AgentBridge 安全与密钥扫描报告（2026-06-28）

## 扫描范围
- 仓库：`/home/runner/work/agent-bridge/agent-bridge`
- 范围：源码、脚本、插件产物、配置模板、依赖告警
- 约束：仅审计，不修改业务代码；不输出任何密钥明文

## 扫描方法
- 密钥/凭据特征扫描：高风险模式（私钥头、常见令牌前缀、硬编码赋值）
- 不安全模式扫描：动态执行、进程拉起、权限位、WebSocket 暴露面
- 依赖风险扫描：`bun audit`
- 配置暴露检查：`.mcp.json.example`、`.cursor/mcp.json`、`.agentbridge/config.json`

## 结果总览
- **高危（HIGH）**：2 项（依赖漏洞族）
- **中危（MEDIUM）**：2 项（依赖漏洞族）
- **低危（LOW）**：2 项（防御降级/运维侧风险）
- **未发现**：生产代码中的硬编码密钥明文、私钥块、公开监听到 `0.0.0.0`

## 发现与修复建议

### 1) HIGH — 传递依赖存在高危安全公告（需升级）
- 证据：`bun audit` 报告
  - `fast-uri <=3.1.1`（host confusion / path traversal）
  - `path-to-regexp >=8.0.0 <8.4.0`（ReDoS / DoS）
- 依赖链（审计输出）：均通过 `@modelcontextprotocol/sdk` 传递引入
- 影响：在特定输入条件下可能触发路由/解析绕过或拒绝服务
- 修复建议：
  1. 先执行兼容升级：`bun update`（优先）
  2. 若仍残留漏洞，评估并执行：`bun update --latest`，配套完整回归测试
  3. 在 CI 增加定期 `bun audit` 作为阻断门禁（仅策略建议，本次未改 CI）

### 2) MEDIUM — Hono / Node Server 依赖存在多项中危公告
- 证据：`bun audit` 报告
  - `@hono/node-server <1.19.13`
  - `hono <4.12.18`（多项：缓存隔离、cookie 处理、路径处理等）
- 依赖链（审计输出）：通过 `@modelcontextprotocol/sdk` 传递引入
- 影响：在特定部署/中间件场景下可能出现策略绕过或数据边界问题
- 修复建议：
  1. 升级 `@modelcontextprotocol/sdk` 到包含修复版本的发布
  2. 升级后复跑 `bun audit`，并重点回归 MCP 通道与 daemon 连接链路

### 3) LOW — 控制口令校验在“预期口令缺失”时会降级放行
- 证据：`/home/runner/work/agent-bridge/agent-bridge/src/control-token.ts:89-105`
- 说明：当 `expectedToken` 缺失时，逻辑回退为允许连接（兼容旧行为）
- 影响：若口令文件异常缺失，会失去该层防护，依赖其它防线（Origin guard 等）
- 修复建议：
  1. 增加启动期强校验与告警（口令缺失时拒绝启动或进入受限模式）
  2. 至少在日志/健康检查中暴露“当前处于降级模式”状态

### 4) LOW — 多处进程拉起调用需持续保持参数约束
- 证据（示例）：
  - `/home/runner/work/agent-bridge/agent-bridge/src/daemon-lifecycle.ts:511-520`
  - `/home/runner/work/agent-bridge/agent-bridge/src/cli/claude.ts:112`
  - `/home/runner/work/agent-bridge/agent-bridge/src/cli/codex.ts:472`
  - `/home/runner/work/agent-bridge/agent-bridge/scripts/install-global.mjs:360-368`
- 说明：当前实现以参数数组调用、未见 `shell: true`，风险可控
- 影响：后续若引入字符串拼接命令或 shell 执行，可能产生命令注入面
- 修复建议：
  1. 维持“参数数组 + 禁止 shell”的编码规范
  2. 对外部输入参与命令参数的位置补充单元测试

### 5) MEDIUM — 审计能力受网络限制，基线验证未完全通过
- 证据：
  - `bun run typecheck` 失败：缺失 `bun-types`（未安装依赖）
  - `bun install` 失败：多包下载 `ConnectionRefused`
- 影响：当前环境无法完成完整“安装依赖 → typecheck/tests”闭环验证
- 修复建议：
  1. 在可联网或有私有镜像的 CI 环境复跑：`bun install && bun run typecheck && bun test src`
  2. 将此次结果视为“静态安全巡检 + 依赖告警快照”，待 CI 二次确认

## 未发现项（本次扫描）
- 未发现生产代码硬编码密钥赋值（排除测试样例后）
- 未发现私钥块（`BEGIN ... PRIVATE KEY`）
- 未发现公开绑定 `0.0.0.0` 的监听（核心服务监听为 `127.0.0.1`，见 `/home/runner/work/agent-bridge/agent-bridge/src/daemon.ts:1116`）

## 建议优先级
1. **P0（本周）**：处理 `bun audit` 中 HIGH 项（`fast-uri`、`path-to-regexp`）
2. **P1（本周）**：处理 Hono / Node Server 中危项并复测
3. **P2（下个迭代）**：收紧 control token 缺失时的降级策略与可观测性
