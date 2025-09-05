# Commit Message 规范（Conventional Commits）

## 结构

<type>(<scope>): <short summary>
<BLANK LINE>
[body - what & why, wrapped at 100 cols]
<BLANK LINE>
[BREAKING CHANGE: <description>]
[Refs: #issue, PR-123]

**type**（固定小写）：

- feat | fix | perf | refactor | docs | style | test | build | ci | chore | revert
  **scope**：模块或包名，如 `auth`, `billing`, `ui`, `api(user)`；可多级 `app/login`
  **summary**：不超过 72 字符，陈述式英文；禁止句号结尾

## 规则

- 每个 commit 聚焦**单一变更**；不做“混合提交”
- body 解释**动机**与**影响面**，非代码复读；说明回滚风险与兼容性
- 破坏性变更必须使用 `BREAKING CHANGE:` 行，并在 PR 中重复声明
- 引用问题与 PR：`Refs: #123, PR-456`

## 示例

feat(ui): add compact density for Table pagination

fix(api): handle 401 by refreshing tokens with exponential backoff

refactor(auth): extract useSession() and remove legacy HOC

perf(chart): virtualize 10k points rendering in LineChart

docs(readme): add quickstart and troubleshooting section

revert: feat(otp): switch to WebAuthn by default

BREAKING CHANGE: old OTP endpoints removed; use /v2/webauthn flows
