# Changelog

All notable changes to the **junai** VS Code extension are documented here.

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
