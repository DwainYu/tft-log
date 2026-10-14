# ROADMAP

Direction of travel: **manual training log → structured game data → automatic capture →
analytics → agent coach → MCP**. Each phase must stay useful on its own; nothing here is a
prerequisite for the tool being worth using today.

> **Next-phase design docs** live in [`docs/`](./docs):
> [PRODUCT_ROADMAP](./docs/PRODUCT_ROADMAP.md) · [UI_IMPROVEMENT_PLAN](./docs/UI_IMPROVEMENT_PLAN.md) ·
> [QUICK_RECORD_UX](./docs/QUICK_RECORD_UX.md) · [REVIEW_SYSTEM](./docs/REVIEW_SYSTEM.md) ·
> [DATA_CENTER](./docs/DATA_CENTER.md) · [SCREENSHOT_IMPORT](./docs/SCREENSHOT_IMPORT.md).
> This file records what shipped and roughly when; those files record how it should evolve.

## Phase 1 — Manual Training Log (MVP) ✅

- [x] Bootstrap: Vite 6 + React 19 + TypeScript + Tailwind v4 + Dexie + Recharts + Vitest
- [x] Domain model + IndexedDB storage (`matches` / `decisions` / `reviews` / `trainingGoals`)
- [x] Match CRUD with cascade cleanup of decisions and reviews
- [x] Quick Add — placement on `1–8`, one game logged in 1–2 minutes
- [x] Full match form (basic info / game state / composition, items, augments / training-window warning)
- [x] Match list & detail (search, filters, sorting, pagination)
- [x] Post-game review (opening / mid / late / conclusion, four required conclusion fields)
- [x] Decision log (round, type, situation, decision, reasoning, result, hindsight)
- [x] Statistics (overall, recent trend, mistake bars, per composition, per time slot)
- [x] Training goals (`active` / `completed` / `archived` + related mistake types)
- [x] Weekly review (rule-based summary behind a `ReviewSummaryProvider` seam)
- [x] Dashboard (core metrics, recent games, current goal, frequent mistakes)
- [x] JSON export / merge-import, CSV export, storage overview, wipe
- [x] Read-only agent tool facade (`src/services/agent-tools.ts`)
- [x] Responsive layout (desktop-first, tablet and mobile usable)
- [x] Fictional demo dataset + one-click load / remove (`data/examples/demo-matches.json`)
- [x] Repository hygiene: `.gitignore` for personal data, MIT license, English README with screenshots

## Phase 1.5 — Release Engineering ✅

- [x] CI: typecheck + 139 tests + production build on every push and pull request
- [x] GitHub Pages deployment from `main` (`https://dwainyu.github.io/tft-log/`)
- [x] Vite `base` for the project-page sub-path, favicon and page description

## Phase 2 — S18 Static Data

- [x] Set 18 snapshot (65 champions / 36 traits / 186 items / 592 augments) in
      `data/tft/set18/`, generated from Riot Data Dragon with a reproducible script
      (`scripts/build-set18-data.mjs`) and documented provenance
- [x] Static-data layer: set registry + lookup repositories + import-time
      validation (`src/data/tft/`)
- [x] Canonical S18 ids on `Match` (optional, backward-compatible), validated at
      write and import time against the snapshot
- [ ] Replace the remaining free-text trait / item / augment fields with
      pickers / autocomplete backed by that data

## Phase 2.5 — Session Context

- [x] `TrainingSession` domain + `trainingSessions` / `settings` IndexedDB stores (v2)
- [x] Built-in sessions: 日常训练 (`daily`) + 云顶之巅冲榜 S18 (`yunding-s18`,
      2026-10-13 ~ 2026-10-18 — personal competition config, editable)
- [x] Persisted active session (survives refresh / browser restart), global
      switcher in the app shell
- [x] `Match.sessionId`; new matches inherit the active session, existing matches
      can be moved between sessions from the edit form
- [x] Dashboard / Matches / Statistics / Review flows scoped by the active session,
      with an "all sessions" scope on Matches + Statistics
- [x] Demo data pinned to `daily`; import normalizes missing / unknown
      `sessionId` to `daily`; export round-trips sessions
- [x] Session manager on the Data page (create / edit / set active / guarded delete)

## Phase 3 — China Client (LCU) Adapter

- [ ] Read the player's own client through the LCU API
- [ ] Human confirmation before anything is written into the log

## Phase 4 — Automatic Match Ingestion

- [ ] Detect and record games inside the training window

## Phase 5 — Screenshot / Replay / Key Rounds

- [ ] Screenshot adapter
- [ ] Key-round captures with annotation

## Phase 6 — Agent Coach

- [ ] `LLMSummary` weekly review
- [ ] Personalised advice grounded in the player's own decision log (tool calling)

## Phase 7 — MCP

- [ ] Expose `agent-tools` as an MCP server

## Phase 8 — Personal TFT AI Coach

- [ ] Memory + retrieval over personal decision history
- [ ] Evaluation: does the training loop actually move the numbers?

## Explicitly out of scope

- Anything that reads game state for a live advantage (cheat-adjacent tooling).
- Server-side accounts, cloud sync and telemetry — the tool is local-first by design.
- Hosting other than GitHub Pages (Vercel / Cloudflare Pages) — one static deploy target is enough.
- Riot Match API dependence: the Chinese server does not expose one to this project, and the
  roadmap does not assume it.
