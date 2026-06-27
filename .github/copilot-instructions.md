# Prosper — Copilot repository instructions

Context every Copilot agent (including **Burtha**) should assume when working in Prosper repos.

## Stack
- **Supabase** — Postgres + Edge Functions (Deno/TypeScript). Brain project `tgsaceudgboexxydmzot`.
- **GoHighLevel / LeadConnector** — SMS/CRM automations + Conversation AI. Location `hU3tflAFRrVsoETFstfk`.
- **Netlify** — `*.prospershield.io` sites; Cloudflare DNS.
- **Python + Node/TypeScript**; **Redis** cloud fleet bus; `agent-bridge` = Mac-fleet bridge.

## Conventions
- Small, focused, reviewable PRs — one concern each. Match existing style; reuse before adding deps.
- Add/maintain tests for every change. Update docs/README when behavior changes. Conventional commits.
- Open a draft PR, plan in the description, request human review (Craig / Sam).

## Hard guardrails (non-negotiable)
- **No secrets in code, ever** — they live in Supabase `app_secrets`, 1Password, and Actions secrets. Use env vars only.
- **No destructive DB ops** on prod (drop/truncate/delete). Migrations are **additive only**.
- **No SMS / Telnyx** (frozen). **No customer-facing comms from code.**
- **No money-moving code, DNS cutovers, or auth/permission changes** without explicit written human approval in the PR.
- Keep changes backward-compatible. When unsure, ask in a draft PR instead of merging risk.

— Prosper, 2026-06.
