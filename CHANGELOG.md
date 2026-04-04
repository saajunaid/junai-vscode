# Changelog

All notable changes to the **junai** VS Code extension are documented here.

---

## [0.8.2] — 2026-04-04

### New Features

- **Data-contract-pipeline DB discovery** — `extract_schema.py` now supports full database discovery: `--discover` enumerates all tables/views with columns, primary keys, and foreign key relationships. `--sample N` fetches rows for type inference and detects embedded structured data (JSON, XML, YAML, markdown, pipe-delimited) inside string columns. `--schema` targets specific DB schemas (dbo, public, etc.).
- **Multi-DB type coverage** — SQL type map expanded from SQL Server-only to include PostgreSQL (JSONB, UUID, ARRAY, TIMESTAMPTZ, BOOLEAN, SERIAL, BYTEA, CITEXT, INET), MySQL (ENUM, SET, MEDIUMTEXT, LONGBLOB), and SQLite types.
- **FK-based DTO nesting** — Foreign key relationships extracted during discovery inform DTO nesting suggestions and multi-table join patterns.
- **Natural-language DB intent** — Skill instructions updated so agents detect "data is in the database" naturally without requiring CLI flags from users.

### Improvements

- **SKILL.md Step 1.5 — DB Discovery** — New pipeline phase for database sources: discover → sample → embedded format detect → multi-table aggregate → relationship map. Feeds into existing Step 2+ pipeline unchanged.
- **Drift check catalog** — Two new checks: D13 (embedded format in string column not extracted to typed model), D14 (FK relationship exists but DTO is flat).
- **DB Discovery & Sampling docs** — Connection string examples for SQL Server, PostgreSQL, MySQL, SQLite added to Scripts section.

---

## [0.8.1] — 2026-04-04

### New Features

- **Recipe discovery in managed section** — Recipe-Driven Delivery instructions now embedded inside the `<!-- junai:start -->` sentinel markers in `copilot-instructions.md`. Every project gets recipe discovery automatically on extension install/update — no manual copy needed. Works with ALL AI tools (Copilot, Claude, Cursor, Windsurf, Codex).
- **Recipe selection in profile flow** — After selecting a project profile, the extension now prompts for recipe selection via quick-pick. Scans `.github/recipes/` for available `.recipe.md` files. Writes the selected recipe to `project-config.md` automatically.
- **PROJECT-ONBOARDING-RUNBOOK.md** — Comprehensive end-to-end onboarding guide covering the full process from `platform-infra` bootstrap through junai extension pool deployment to pipeline kickoff. Includes all commands, parameters, and troubleshooting.
- **`validation-discipline.instructions.md` promoted to pool** — Previously only in project-template, now available to all projects via pool deployment.

### Improvements

- **RECIPE-RUNBOOK.md updated** — Fresh project scenario now documents the correct flow (platform-infra bootstrap → extension pool deploy → profile/recipe selection). Standalone mode section updated to explain managed-section deployment mechanism.
- **project-template cleanup** — Removed stale `.github/instructions/` folder (was 14 files behind pool's 26, with 1 outdated). Instructions now deployed exclusively by the extension pool, eliminating version drift.

---

## [0.8.0] — 2026-04-03

### New Features

- **Cross-project recipe system** — New `recipes/` directory in the pool with composable delivery workflow manifests. Recipes are thin orchestration layers that compose existing skills into repeatable pipelines — eliminating manual skill invocation for standard project archetypes.
  - **`enterprise-dashboard` recipe** — 9-phase delivery pipeline (data-intake → adapter → normalize → display-DTO → contract-test → API-surface → UI-design → implement → verify) with mandatory skill composition per phase, cross-skill conventions (DTO naming chain, directory structure, service layer patterns), visualization decision matrix (10 chart types → Recharts mappings), mockup-to-react contract (5 annotation types), and cross-cutting observability integration.
  - **Universal recipe discovery** — `copilot-instructions.md` now includes a "Recipe-Driven Delivery" section that ALL AI tools read automatically (Copilot, Claude Code, Cursor, Windsurf, Codex). Recipe discovery works in standalone mode — no pipeline dependency required. Follows the Netflix "Paved Roads" principle: you don't need a special map to find the road.
  - **3-source skill loading** — Agents now compose skills from three sources (handoff payload + mandatory triggers + recipe), taking the union of all three. Additive, never destructive.
  - **Recipe-aware agents** — Planner (uses recipe's Delivery Pipeline as phase scaffold), Orchestrator (appends recipe skills to handoff payload), Frontend Developer and Implement (independently discover and load recipe skills for their phases).
  - **RECIPE-RUNBOOK.md** — Comprehensive documentation covering 4 onboarding scenarios (fresh project, existing project mid-flight, no-recipe, creating a new recipe), standalone mode explanation, and FAQ.
  - **recipe-system-architecture.drawio** — 5-layer architecture diagram (source of truth → project bootstrap → agent skill loading → recipe content → delivery pipeline).

### Improvements

- **`react-fastapi-vite-mssql` profile enriched** — Stack Details expanded from 10 to 23 rows (added React 19, Vite 6+, Tailwind 3.4+, Recharts 3+, React-Leaflet, Framer Motion 12+, react-hook-form + zod, uv, ruff, Vitest, Playwright, DM Sans, JetBrains Mono, Warm Editorial design system). Key Conventions expanded from 5 to 11 rows.
- **Planner agent enhanced** — Added iterative Planning Workflow (Discovery → Alignment → Design → Refinement cycle), recipe-aware mandatory trigger, and Section 6.2 Recipe-Aware Planning (7 rules for recipe consumption including phase scaffolding, skill embedding, and convention enforcement).
- **onboard-project skill updated** — Now asks about recipe selection during project setup (optional, not a gate).
- **sync.ps1 updated** — `recipes` added to `$POOL_FOLDERS`, `$CLEAN_FOLDERS`, and `junai-push` git staging.
- **Runtime export tooling** — `export_runtime_resources.py` and `runtime-targets.json` added for building runtime-specific project resources.
- **Root cleanup** — Removed scratch files (`nul`, `test_pil.py`, `process_icon.py`, `Personas for Prompt`). Added `.gitignore` exclusions for local-only docs.

---

## [0.7.3] — 2026-03-31

### New Features

- **Preflight agent** � New `preflight` specialist validates implementation plans against the actual codebase (API endpoints, type names, field names, dependencies, file paths, data shapes, transforms) before any coding begins. Routes to Planner on FAIL or directly to Implement on PASS. Supports standalone mode and full pipeline integration.
- **skill-creator skill** � New `workflow/skill-creator` skill with a full evaluation framework: analyzer, comparator, and grader sub-agents; benchmark scripts; eval-viewer HTML report; and packaging utilities for authoring new skills from scratch.
- **webapp-testing skill** � New `testing/webapp-testing` skill with Playwright-based automation patterns, element discovery, static HTML automation, and server-integrated test examples.
- **high-end-visual-design skill** � New `frontend/high-end-visual-design` skill for premium visual UI work.
- **windows-deployment skill** � New `devops/windows-deployment` skill for Windows-specific deployment patterns.
- **New skill reference files** � Added `css-architecture/RESPONSIVE-DESIGN.md`, `design-system-tokens/DESIGN-SYSTEM-TEMPLATE.md`, `frontend/premium-react/MOTION-SPEC.md`, and `frontend/ux-design/ACCESSIBILITY.md` reference documents to existing skill categories.

### Improvements

- **UX Designer agent overhauled** � Merged the `ui-ux-designer` agent into `ux-designer`. The unified agent covers both generative design (JTBD, wireframes, specs) and evidence-based critique with NN Group citations. `ui-ux-designer.agent.md` removed.
- **17 agents updated** � `accessibility`, `anchor`, `architect`, `code-reviewer`, `data-engineer`, `debug`, `frontend-developer`, `implement`, `janitor`, `mentor`, `orchestrator`, `planner`, `prd`, `prompt-engineer`, `sql-expert`, `streamlit-developer`, `tester` � all received refinements to protocols, routing logic, and output contracts.
- **Orchestrator & Planner enhanced** � Improved handoff payload handling, intent verification, and multi-phase routing for assisted/autopilot modes.
- **large-task-fidelity instructions updated** � Added Output Decay self-sweep rule with mechanically-detectable decay signal patterns.
- **Pipeline tooling** � `agents.registry.json` updated with Preflight entry; `schema.py` and `pipeline-state.template.json` updated; pipeline flowchart refreshed.

---
## [0.7.0] — 2026-03-26

### New Features

- **9 new frontend skills** — Added word-cloud, ui-ux-intelligence (CSV knowledge bases), slides, banner-design, brand-design, design-system-tokens, brand-voice, and ui-styling-patterns to the frontend skill category. Moved algorithmic-art from media to frontend.
- **Skill pool expanded to 121** — Up from 112. Frontend category now has 27 skills (was 18).
- **Agent skill references updated** — ui-ux-designer, ux-designer, and frontend-developer agents now reference the new skills with mandatory triggers.
- **README rewritten** — Clearer structure, accurate model assignments, updated pool counts, removed duplicates.

---

## [0.6.8] — 2026-03-24

### Improvements

- **Pool update reliability** — Minor stability improvements to the pool update flow.

---

## [0.6.6] — 2026-03-22

### New Features

- **Auto-commit pool files after `Update Agent Pool`** — After writing pool files to the workspace, the extension now automatically stages and commits all pool directories (`.github/agents`, `tools`, `skills`, `instructions`, `prompts`, `diagrams`, `handoffs`, `agent-docs`) to git. Users no longer see uncommitted pool files as noise in their working tree after an update.
  - All edge cases handled: no git repo or git not installed (silently skipped); in-progress operation (rebase / merge / cherry-pick / bisect) — skipped with notification; detached HEAD — skipped with notification; no staged changes — skipped (no empty commit created); missing author identity — retries with fallback `junai-bot@localhost` identity; workspace nested inside a larger git root — uses `git rev-parse --show-toplevel` to find true root; Windows paths — uses `spawnSync` args array (no shell, no injection risk).
  - Commit message: `chore(junai): update pool to v{version}`.
  - Result appended to the update notification only when actionable (committed, in-progress, detached HEAD, or error); silently does nothing if no repo or nothing changed.

---

## [0.6.5] — 2026-03-22

### Bug Fixes

- **Pool update scan runs in all pipeline modes** — The activation-time stale-pool check now fires regardless of `pipeline_mode` value. Previously it only triggered in `supervised` mode, so workspaces running `assisted` or `autopilot` never received silent auto-update prompts.
- **Backward-compatible `mode` key migration** — `pipeline-state.json` files written by older extension versions used `"mode"` instead of `"pipeline_mode"`. The extension now reads both keys during the activation scan so silent auto-updates resume correctly on legacy workspaces without requiring a manual init.

---

## [0.6.4] — 2026-03-22

### Bug Fixes

- **Plan agent output enforces YAML frontmatter** — The `Plan` agent's output contract now requires a YAML frontmatter block at the top of every plan file. Fixes plans that could previously be written without the required metadata header.

---

## [0.6.3] — 2026-03-22

### Internal

- Fixed Unicode encoding in `package.json` display strings (em dashes now use proper `—` characters throughout).

---

## [0.6.2] — 2026-06-28

### New Features

- **Managed-section `copilot-instructions.md`** — The extension no longer owns the entire `copilot-instructions.md` file. Instead, it manages a small sentinel-delimited block (`<!-- junai:start -->` … `<!-- junai:end -->`) containing a ~10-line signpost to the real documentation in `.github/instructions/junai-system.instructions.md`. Everything outside the markers is yours and is never read, modified, or deleted by the extension.

  - **Initialize**: Creates the file with a template + managed section if it doesn't exist; appends the managed section if your file already exists without sentinels.
  - **Update**: Refreshes only the managed section — your project-specific content is untouched.
  - **Remove**: Strips only the managed section and cleans up blank lines — your content stays.

- **`copilot-instructions.md` removed from pool bundle** — The file is no longer copied into `pool/` by `bundle-pool.js` and is no longer deployed via `copyDirSync`. The extension synthesizes the managed section programmatically, ensuring the content always matches the installed extension version.

### Migration

- Users upgrading from 0.6.1 or earlier: on the next **Update Agent Pool**, the extension detects the old full-file format (no sentinels), appends the managed section at the end of your existing file, and preserves all your content. No manual steps required.

---

## [0.5.7] — 2026-03-11

### New Features

- **`copilot-instructions.md` is now user-owned** — The `.github/copilot-instructions.md` file deployed to your project is no longer overwritten by pool updates (`Update Agent Pool`). It is now protected alongside `pipeline-state.json` and `project-config.md`. Once you add project-specific context to it (architecture notes, team conventions, institutional knowledge), that context is preserved across every extension update. The update confirmation dialog and notification messages both reflect this change.

- **`junai-system.instructions.md` — pool-managed junai documentation** — A new file (`.github/instructions/junai-system.instructions.md`, `applyTo: "**"`) is bundled in the pool and refreshed on every `Update Agent Pool`. It contains all junai system documentation: the 25 agents (model assignments, key roles), pipeline flow (stages, modes, routing mechanism), VS Code Autopilot integration, the 9 MCP tools, and key pipeline conventions. VS Code Copilot loads it automatically in every chat session, so your Copilot always has up-to-date information about the pipeline even when `copilot-instructions.md` contains only your project-specific notes.

- **`copilot-instructions.md` becomes a project-context template** — The `copilot-instructions.md` deployed to new installs is now a short, structured template with clearly labelled sections (Project Overview, Tech Stack, Architecture Notes, Team Conventions, Institutional Knowledge) backed by plain HTML comments so you know exactly what to fill in. Existing installs that already have the file are unaffected (USER_OWNED — not overwritten).

### Bug Fixes

- Fixed: `Update Agent Pool` silently overwrote `.github/copilot-instructions.md` on every pool update, destroying any project-specific context the user had documented there. Now it is skipped like `pipeline-state.json` and `project-config.md`.

---

## [0.5.6] — 2026-03-11

### New Features

- **VS Code Autopilot compatibility** — All 22 agents now use explicit `@AgentName [prompt]` as the final line of their response to trigger VS Code's built-in agent invocation. Previously the instruction said "invoke immediately" without specifying the mechanism, meaning VS Code had no signal to act on. With both VS Code Autopilot (permissions picker → Autopilot preview) and `pipeline_mode: autopilot` enabled, the full pipeline runs hands-free: `@Orchestrator` → specialist → `@Orchestrator` → … without any button clicks.

- **Two-layer autopilot setup documented** — The `copilot-instructions.md` (deployed to every project) now explains the distinction between VS Code Autopilot (auto-approves tool calls, retries MCP errors) and junai's `pipeline_mode: autopilot` (stage routing, artefact contracts, gate enforcement). The two work together, not in competition.

- **`uv` as the MCP server runtime** — The MCP server (`server.py`) ships with a PEP 723 inline script header (`# dependencies = ["fastmcp"]`). The extension now configures VS Code to launch it via `uv run`, so `fastmcp` installs automatically into an isolated environment on first run. The only prerequisite is `uv` installed once globally — no `.venv` setup or `pip install` needed per-project. Previously the extension generated an mcp.json pointing to `.venv/Scripts/python.exe` (Windows) or `.venv/bin/python` (Linux/Mac), requiring manual venv setup before the MCP server would start.

- **Profile picker (`junai: Select Project Profile`)** — A new command reads the named profiles defined in `.github/project-config.md` (matching `### profilename` headings) and lets you pick one from a quick-pick list. On selection, it writes the chosen profile name into the `| **profile** |` row of the config. A profile picker prompt also appears automatically after a fresh Initialize, so all agents receive project context immediately without manual config editing. Includes 18 predefined profile descriptions (Streamlit+MSSQL, FastAPI+PostgreSQL, React+Node.js SaaS, ML training, MCP server tooling, and more).

- **Silent auto-initialize mode (`autoInitializeOnActivation: always`)** — A new extension setting controls what happens when VS Code opens a workspace that hasn't been initialized yet: `prompt` (default — show a notification offering to initialize), `always` (silently initialize on first open without any dialogs), or `never` (suppress all activation prompts). Silent init uses the first workspace folder and never re-initializes an already-initialized project, making junai zero-friction in fully automated dev environments.

- **Project config backup on overwrite** — When re-running Initialize on an already-initialized project and choosing Overwrite, the existing `project-config.md` is now backed up to `project-config.bak.<timestamp>.md` before being replaced, preventing accidental loss of project customizations.

- **25 specialist agents** — Added `ui-ux-designer` agent (opinionated UI/UX critic with evidence-based design guidance) bringing the total from 24 to 25. Model assignments: Anchor + Architect on Claude Opus 4.6; Orchestrator and 10 others on Claude Sonnet 4.6; Implement, Streamlit Developer, and 6 others on GPT-5.3-Codex; Mermaid and SVG agents on Gemini 3.1 Pro Preview.

### Fixes

- **`run_command` MCP tool — pytest-xdist pipe hang** — On Windows, `pytest -n auto` worker processes inherited the MCP server's PIPE write-end handles, causing `communicate()` to block forever waiting for all pipe writers to close. Fixed with: (1) `CREATE_NEW_PROCESS_GROUP` flag to isolate the process tree, (2) bounded 5-second post-kill drain instead of an unbounded `communicate()` call, and (3) a hard 600-second cap on the `timeout` parameter regardless of what the calling agent passes.

### Pipeline Routing

- **Orchestrator**: Routing lines for `assisted` and `autopilot` modes now explicitly say "write `@[AgentName] [routing prompt]` as the final line of your response" — eliminating the ambiguity of "invoke immediately" which could result in a button being presented instead of a response-line trigger.
- **3 pipeline-mutating specialists** (Implement, Anchor, Frontend Developer): Return instruction now ends with `@Orchestrator Stage complete — [summary]. Read pipeline-state.json and _routing_decision, then route.`
- **19 non-mutating specialists**: Same explicit final-line `@Orchestrator` trigger, replacing the vague "invoke @Orchestrator directly — VS Code will auto-route back without a button click."
- **advisory-mode.instructions.md**: Session mechanics table updated to show the exact `@AgentName` response-line trigger for assisted/autopilot modes vs the button-click pattern for supervised mode.

---

## [0.5.5] — 2026-03-06

### New Features

- **`copilot-instructions.md` deployed to all projects** — A comprehensive context document is now copied into `.github/` on `Initialize` and `Update`. It gives VS Code Copilot (default chat) full awareness of the workspace structure, the 25 agents, pipeline flow, MCP tooling, and key conventions — eliminating context loss between sessions.

- **Auto-routing boundary rule** — Added `advisory-mode.instructions.md` with an explicit prohibition on default Copilot chat routing to pipeline agents. Auto-routing from outside the pipeline (not from Orchestrator) bypasses pipeline-state.json updates and causes state desync. The instructions describe the single entry point: always start via `@Orchestrator`.

- **Mode Detection for pipeline-mutating agents** — Implement, Anchor, and Frontend Developer now detect whether they're running inside the pipeline (trigger phrase: "The pipeline is routing to you") or standalone. In standalone mode they skip `notify_orchestrator`/`satisfy_gate` calls that would corrupt pipeline state.

- **Complete pipeline auto-routing loop** — All 21 specialist agents updated with assisted/autopilot return instructions. Previously 18 of 21 agents contained dead text pointing to `notify_orchestrator` — a tool they don't have. Now all specialists have the correct return path to Orchestrator.

### Fixes

- **Nested pool directory bug** — `checkPoolUpdate` now auto-heals any `dir/dir` double-nesting (e.g. `.github/agents/agents/`) left by v0.5.1 and earlier.

---

## [0.5.4] — 2026-02-28

### New Features

- **`run_command` MCP tool** — Agents can execute CLI commands directly from chat context without the user switching to a terminal. Supports timeout control, working directory override, and environment variable injection.
- **`skip_stage` MCP tool** — Agents can skip a pipeline stage with a recorded reason. Unskippable on `implement`, `anchor`, and `tester` stages.
- **ADR path convention** — Architecture Decision Records now live at `docs/architecture/agentic-adr/ADR-{feature-slug}.md` (permanent project docs), separate from the transient `agent-docs/` working space.
- **Partial Completion Protocol (§8) cascade** — All 25 agents now include the Partial Completion Protocol: if context runs out mid-task, stop cleanly, commit stable work, and report exactly what is done vs not done. Do not mark the pipeline stage complete.

---

## [0.5.3] — 2026-02-21

### New Features

- **Autopilot fast-path** — Orchestrator in `pipeline_mode: autopilot` skips the intake classification interview and detects the correct entry stage from artefacts already on disk (plan → `implement`, PRD → `plan`, ADR → `architect`).
- **`validate_deferred_paths` MCP tool** — Verify that artefact file paths recorded as deferred items actually exist before closing out a pipeline stage.
- **vmie skill excluded from bundle** — The internal `vmie` skill is no longer copied into the extension bundle or deployed to user workspaces.
- **Model tier optimisation** — Gemini 3.1 Pro Preview scoped to visual artifact agents only (Mermaid, SVG). Claude Opus 4.6 reserved for Anchor and Architect. All other agents on Claude Sonnet 4.6 or GPT-5.3-Codex.

---

## [0.5.2] — 2026-02-14

### New Features

- **Auto-update on activation** — `checkPoolUpdate` runs silently on every VS Code startup, comparing the bundled pool version against `.github/.junai-pool-version`. When they differ, pool files are merged automatically (user-owned files `pipeline-state.json` and `project-config.md` are never overwritten).
- **`pipeline_reset` guard** — `pipeline_init` now raises a clear error if a pipeline is already active; use `pipeline_reset` to intentionally restart.
- **`set_pipeline_mode` MCP tool** — Switch between supervised / assisted / autopilot without editing `pipeline-state.json` by hand.

---

## [0.5.1] — 2026-02-07

### New Features

- **MCP stdio deadlock fix** — All subprocess spawns in `server.py` now use `stdin=asyncio.subprocess.DEVNULL`, preventing child processes from inheriting the MCP stdio pipe and causing the server to hang on startup.
- **`POOL_VERSION` stamp** — `bundle-pool.js` writes the extension version into `pool/.junai-pool-version` so deployed workspaces can detect stale pools.
- **`dir/dir` nesting guard** — `bundle-pool.js` checks for accidental double-folder nesting (legacy bug) and aborts with a clear error if detected.

---

## [0.5.0] — 2026-01-31

### Initial Public Release

- 25 specialist agents deployed via `Initialize` command into `.github/agents/`
- 9-tool MCP server (`server.py`) configured via `.vscode/mcp.json` using `uv run`
- Three pipeline modes: supervised (all gates manual), assisted (manual gates with AI hints), autopilot (all gates auto-satisfied except `intent_approved`)
- `pipeline-state.json` for cross-session state persistence
- `Uninstall` command for clean removal
- Skills, prompts, instructions, diagrams, and handoff templates deployed alongside agents
