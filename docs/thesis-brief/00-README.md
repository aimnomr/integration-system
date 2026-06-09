# Thesis Brief — Project Knowledge Bundle

A self-contained snapshot of the AMR Integration System, curated for use as
**project knowledge in claude.ai (web)** when writing the thesis. Each file is
a section; upload them all into one project so the model can cross-reference.

Snapshot date: **2026-05-28**. Past this date, the code is authoritative.

## Reading order

| # | File | What it covers |
|---|---|---|
| 1 | [01-overview.md](01-overview.md) | What the system *is* — five components, MQTT backbone, VDA5050 |
| 2 | [02-architecture.md](02-architecture.md) | How services connect; inbound + outbound message paths |
| 3 | [03-status.md](03-status.md) | What is implemented; tested vs. not; open gaps |
| 4 | [04-decisions.md](04-decisions.md) | *Why* the design looks the way it does (decision log) |
| 5 | [05-old-interface.md](05-old-interface.md) | The **previous** single-robot UI — the "before" picture |
| 6 | [06-vda5050-migration.md](06-vda5050-migration.md) | The migration plan that bridged old → new |
| 7 | [07-comparison.md](07-comparison.md) | **Explicit before/after table** — thesis-ready contrast |

## How to use this with claude.ai

1. Create a new project in claude.ai.
2. Upload every `.md` file in this folder as project knowledge.
3. In the project's custom instructions, paste:

   > This project is an AMR (Autonomous Mobile Robot) Integration System FYP.
   > File `05-old-interface.md` describes the **previous** single-robot React
   > interface. Files `01`–`04` describe the **current** fleet-capable
   > VDA5050 system. File `07-comparison.md` summarizes what changed.
   > Use these as the source of truth when helping me draft thesis chapters.
   > There is currently an old doc file that needs to be adjusted to fit the current projet architecture

4. Ask the model to draft chapters, compare designs, or explain rationale —
   it will ground answers in these files.

## What is intentionally not in this bundle

- `CONTINUATION.md` — handoff snapshot that decays daily; noise for thesis.
- `manual-test-*.md`, `testing.md`, `postman/` — verification scaffolding.
- `gaps.md` — useful only if a "future work" chapter cites open issues.
- Full schema dumps (`schema/*.md`) — include separately only if the thesis
  has a "data model" chapter that needs the table list verbatim.
