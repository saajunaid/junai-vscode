<div align="center">

<img src="https://raw.githubusercontent.com/saajunaid/junai-vscode/main/icon.png" alt="junai" width="96"/>

# junai — AI Agent Pipeline

### Agentic Engineering for GitHub Copilot

**A structured, persistent, auditable multi-agent SDLC pipeline — purpose-built for GitHub Copilot.**

[![Beta](https://img.shields.io/badge/status-beta-orange?style=flat-square)](https://github.com/saajunaid/junai-vscode)
[![License](https://img.shields.io/badge/license-MIT-22c55e?style=flat-square)](https://github.com/saajunaid/junai-vscode/blob/main/LICENSE)
[![VS Code](https://img.shields.io/badge/VS%20Code-1.101%2B-007ACC?style=flat-square&logo=visual-studio-code)](https://code.visualstudio.com)
[![GitHub Copilot](https://img.shields.io/badge/GitHub%20Copilot-required-6e40c9?style=flat-square&logo=github)](https://github.com/features/copilot)

</div>

---

<div align="center">

![junai AI Agent Pipeline — 25 agents, 4 model tiers, full handoff map](https://raw.githubusercontent.com/saajunaid/junai-vscode/main/media/pipeline-poster.png)

*25 agents · 4 model tiers · 121 skills · full handoff map*

</div>

---

## What is junai?

Most AI coding tools are chat assistants — you ask, they answer, and when the session ends, all context is lost.

**junai turns GitHub Copilot into a full software delivery pipeline.** 25 specialist AI agents — each scoped to a single role like Architect, Implementer, Tester, or Code Reviewer — collaborate through a deterministic state machine that persists across sessions. Every stage transition is logged in a plain-text `pipeline-state.json` that lives in your repo.

```
Idea → PRD → Architecture → Plan → Implement → Test → Review → Done
  ↑ every stage has a dedicated agent, every transition is tracked, every gate is explicit
```

### How junai compares

| Feature | junai | Generic AI Chat | Other Agent Tools |
|---|---|---|---|
| State persists across sessions | Yes | No | No |
| Deterministic routing (state machine) | Yes | No | No |
| 25 role-scoped specialist agents | Yes | No | 4–6 generic |
| Full SDLC pipeline | Yes | No | Partial |
| Three modes: supervised / assisted / autopilot | Yes | No | No |
| Autopilot watcher (auto-opens next agent) | Yes | No | No |
| Works with your existing Copilot subscription | Yes | No | Needs separate API keys |
| Portable — lives in `.github/`, travels with your repo | Yes | No | No |
| Auditable — all state in git-committed JSON | Yes | No | No |
| 9 MCP tools callable from chat | Yes | No | Varies |

---

## Quick Start

Three steps to get going:

1. **Install** — Search `junai` in the VS Code Extensions panel, or install from the [Marketplace](https://marketplace.visualstudio.com/items?itemName=junai-labs.junai)
2. **Initialize** — Press `Ctrl+Shift+P` → **`junai: Initialize Agent Pipeline`**. The full agent pool installs into `.github/` and the MCP server is auto-configured
3. **Start building** — Open Copilot Chat, select **Orchestrator** from the agent picker, and say:

```
New feature: <describe what you want to build>
I want to run this in autopilot mode.
```

The pipeline handles routing from there.

### Prerequisites

| Requirement | Why |
|---|---|
| **VS Code** 1.101+ | Agent mode support |
| **GitHub Copilot** subscription | Agents run as Copilot chat participants |
| **`uv`** on PATH | Runs the MCP server — [install uv](https://docs.astral.sh/uv/getting-started/installation/) (one command, ~30 seconds) |

---

## Three Pipeline Modes

| Mode | How it works | Best for |
|---|---|---|
| **Supervised** | Every gate requires your explicit click before advancing | Learning the pipeline, high-stakes changes |
| **Assisted** | Agents route automatically — you only approve key gates | Day-to-day feature work |
| **Autopilot** | All gates auto-satisfied after intent sign-off; the extension watches `pipeline-state.json` and **opens the next agent automatically** — zero clicks | Trusted, well-scoped work |

Switch anytime from Copilot chat:
> *"Switch pipeline to autopilot mode"*

### How autopilot works

In **autopilot** mode, junai watches `pipeline-state.json` in real-time. When a stage completes:

1. Reads the routing decision from the state file
2. Opens the correct specialist agent in Copilot chat automatically
3. Sends the handoff prompt — the agent starts working immediately

**You approve the intent once. The pipeline does the rest.**

---

## 25 Specialist Agents

Each agent is a deeply crafted instruction file in `.github/agents/` — scoped to a single responsibility, model-matched for the task, and wired with handoffs to the next stage.

### Model assignments

| Model | Agents |
|---|---|
| **Claude Opus 4.6** | Anchor, Architect |
| **Claude Sonnet 4.6** | Orchestrator, Planner, PRD, Code Reviewer, Debug, Security Analyst, Prompt Engineer, Mentor, Knowledge Transfer, Project Manager, UX Designer, UI/UX Designer, Accessibility |
| **GPT-5.3-Codex** | Implement, Frontend Developer, Streamlit Developer, Data Engineer, DevOps, SQL Expert, Tester, Janitor |
| **Gemini 3.1 Pro** | Mermaid Diagram Specialist, SVG Diagram |

All agents share a **handoff protocol** — each completion writes artefact paths and routing context into `pipeline-state.json`, so the Orchestrator can cold-start a new session from state alone.

---

## 121 Reusable Skills

Skills are modular knowledge packs that agents load on demand — covering everything from testing strategies to design systems. Organized across **10 categories**:

| Category | Skills | Examples |
|---|---|---|
| **Coding** | 20 | API design, refactoring, code patterns |
| **Frontend** | 27 | CSS architecture, design systems, word clouds, brand design, UI styling |
| **Workflow** | 16 | Git, CI/CD, deployment workflows |
| **Productivity** | 11 | Documentation, planning, automation |
| **Media** | 10 | SVG, image processing, visualization |
| **Docs** | 9 | Technical writing, README generation |
| **Cloud** | 6 | AWS, Azure, infrastructure |
| **Data** | 6 | ETL, data pipelines, analytics |
| **DevOps** | 6 | Docker, monitoring, infrastructure |
| **Testing** | 6 | Unit, integration, E2E testing |

Agents automatically load the right skills based on the task at hand. You can also reference skills directly in chat.

---

## 9 MCP Tools

The MCP server provides pipeline operations callable directly from Copilot chat:

| Tool | What it does |
|---|---|
| `pipeline_init` | Start a new pipeline (active-pipeline guard built-in) |
| `pipeline_reset` | Force-clear and restart (bypasses guard) |
| `notify_orchestrator` | Record stage completion + trigger routing |
| `set_pipeline_mode` | Switch supervised / assisted / autopilot |
| `satisfy_gate` | Manually satisfy a supervision gate |
| `skip_stage` | Skip the current stage (blocked on implement, anchor, tester) |
| `get_pipeline_status` | Read current stage, mode, and routing decision |
| `validate_deferred_paths` | Verify deferred artefact file paths exist |
| `run_command` | Execute CLI commands from chat context |

---

## What Gets Installed

One command. Everything lands in your `.github/` folder and travels with your repo.

| Folder | What's inside |
|---|---|
| `agents/` | 25 agent definition files — one per specialist |
| `skills/` | 121 reusable skill modules across 10 categories |
| `prompts/` | 30 workflow-level prompt templates (ADR, commit, handoff, etc.) |
| `instructions/` | 24 coding convention files for Copilot context (Python, SQL, FastAPI, Docker, security, etc.) |
| `plans/` | Plan templates and backlog scaffold |
| `agent-docs/` | Artefact hub, architecture docs, schema references |
| `handoffs/` | Cross-session handoff protocol |
| `tools/` | MCP server (auto-registered via `uv run`, no pip install needed) |

Plus at the root level:

| File | Purpose |
|---|---|
| `pipeline-state.json` | Live pipeline state — stage, mode, gates, routing, artefacts |
| `copilot-instructions.md` | **Your project context file** — junai manages a small `<!-- junai:start -->` … `<!-- junai:end -->` section; everything else is yours and never touched |
| `.vscode/mcp.json` | MCP server registration (auto-configured) |

---

## Your Files Are Safe

junai uses **sentinel-delimited managed sections** — the same approach used by SSH config and Terraform. Your content is never overwritten.

| File | On Initialize | On Update | On Remove |
|---|---|---|---|
| `copilot-instructions.md` | Created with a small junai section (or appended if yours already exists) | Only the `<!-- junai:start -->` … `<!-- junai:end -->` block is refreshed — your content is untouched | Only the junai section is stripped — your content stays |
| `pipeline-state.json` | Created if missing | Never touched | Deleted |
| `project-config.md` | Created (backup if overwriting) | Never touched | Deleted |
| Agent / skill / instruction files | Installed | Updated to latest | Deleted |

---

## Commands

| Command | What it does |
|---|---|
| `junai: Initialize Agent Pipeline` | Install the full agent pool and configure the MCP server |
| `junai: Update Agent Pool` | Pull latest agent/skill files — preserves your pipeline state |
| `junai: Show Pipeline Status` | View current stage, mode, gate states, and last routing decision |
| `junai: Set Pipeline Mode` | Switch pipeline mode without re-initializing |
| `junai: Remove from this project` | Clean uninstall — removes agent pool and MCP config |

---

## Extension Settings

| Setting | Default | Description |
|---|---|---|
| `junai.defaultMode` | `supervised` | Pipeline mode applied on Initialize |

---

## Learn More

- [Full User Guide](https://github.com/saajunaid/junai/blob/main/USERGUIDE.md) — walkthrough, CLI reference, all 25 agents, stage table, troubleshooting
- [GitHub](https://github.com/saajunaid/junai) — star the repo, browse the source
- [Issues & Feature Requests](https://github.com/saajunaid/junai-vscode/issues)

---

<div align="center">

*The future of software engineering is agentic.*
*junai makes it structured, auditable, and yours.*

**MIT &copy; junai Labs**

</div>
