<div align="center">

<img src="https://raw.githubusercontent.com/saajunaid/junai-vscode/main/icon.png" alt="junai" width="96"/>

# junai — AI Agent Pipeline

### Agentic Engineering for GitHub Copilot

**The only structured, persistent, auditable multi-agent SDLC pipeline — purpose-built for GitHub Copilot.**

[![VS Marketplace](https://img.shields.io/visual-studio-marketplace/v/junai-labs.junai?color=0066cc&label=marketplace&style=flat-square&logo=visual-studio-code)](https://marketplace.visualstudio.com/items?itemName=junai-labs.junai)
[![Installs](https://img.shields.io/visual-studio-marketplace/i/junai-labs.junai?color=0066cc&style=flat-square)](https://marketplace.visualstudio.com/items?itemName=junai-labs.junai)
[![License](https://img.shields.io/badge/license-MIT-22c55e?style=flat-square)](https://github.com/saajunaid/junai-vscode/blob/main/LICENSE)
[![VS Code](https://img.shields.io/badge/VS%20Code-1.101%2B-007ACC?style=flat-square&logo=visual-studio-code)](https://code.visualstudio.com)
[![GitHub Copilot](https://img.shields.io/badge/GitHub%20Copilot-required-6e40c9?style=flat-square&logo=github)](https://github.com/features/copilot)

</div>

---

<div align="center">

**[🗺️ View Full Pipeline Poster →](https://github.com/saajunaid/junai/blob/main/.github/diagrams/agent-pipeline-poster.svg)**

*22 agents · 3 model tiers · full handoff map*

</div>

---

## Why junai?

Most AI coding tools are **chat assistants**. You ask, they answer. There is no memory, no process, no structure — and when your session ends, context dies with it.

**junai is different.** It brings **Agentic Engineering** to your codebase: a structured software delivery lifecycle orchestrated by 23 role-scoped AI agents, driven by a deterministic state machine, and tracked in a plain-text `pipeline-state.json` that survives every session restart.

```
Idea → Intent → PRD → Architecture → Plan → Implement → Test → Review → Shipped
         ↑ every stage has a specialist agent, every transition is logged, every gate is explicit
```

| | junai | Generic AI Chat | Other Agent Tools |
|---|---|---|---|
| Persistent state across sessions | ✅ | ❌ | ❌ |
| Deterministic routing state machine | ✅ | ❌ | ❌ |
| 23 role-scoped specialist agents | ✅ | ❌ | 4–6 generic agents |
| Full SDLC: Intent → PRD → Arch → Plan → Impl → Test → Review | ✅ | ❌ | Partial |
| Three pipeline modes: supervised / assisted / autopilot | ✅ | ❌ | ❌ |
| Autopilot watcher — auto-opens next agent, zero clicks | ✅ | ❌ | ❌ |
| Works with GitHub Copilot you already pay for | ✅ | ❌ | No — requires new API keys |
| Repo-portable — travels with your `.github/` folder | ✅ | ❌ | ❌ |
| Auditable — all state in git-committed plain text | ✅ | ❌ | ❌ |
| MCP tools — pipeline ops callable from Copilot chat | ✅ | ❌ | Varies |

---

## 🚀 Three Pipeline Modes

**[▶ View Pipeline Modes Reference Card →](https://github.com/saajunaid/junai/blob/main/.github/diagrams/advisory-hub-mode.svg)**

| Mode | How it works | Best for |
|---|---|---|
| 🎛️ **supervised** | Every gate requires your explicit approval before advancing | Learning the pipeline, high-stakes changes |
| 🤝 **assisted** | AI generates guidance and gate recommendations — you approve | Most day-to-day feature work |
| 🤖 **autopilot** | All gates auto-satisfied after intent sign-off. The extension watches `pipeline-state.json` and **automatically opens the next agent and sends its routing prompt** — no clicks needed | Trusted, well-scoped work |

Switch mode anytime from Copilot chat:
> *"Switch pipeline to autopilot mode"*

---

## 🤖 Autopilot Watcher

In **autopilot** mode, the junai extension watches your `pipeline-state.json` in real-time. The moment a stage completes and the routing decision is written, the extension:

1. Reads `_routing_decision.target_agent` from the state file
2. Automatically opens the correct specialist agent in Copilot chat
3. Sends the handoff prompt — the agent starts working immediately

**You sign off the intent once. The pipeline does the rest.**

---

## 🧠 23 Specialist Agents

Each agent is a deeply crafted instruction file in `.github/agents/` — scoped to a single responsibility, model-matched for its task, and wired with handoff buttons to the next stage.

| Tier | Agents | Model |
|---|---|---|
| 🔵 **Deep Reasoning** | Architect, PRD, Plan, SQL Expert, Security Analyst, Data Engineer, Debug, UX Designer, UI/UX Designer | Claude Opus 4.6 |
| 🟢 **Multi-file Coding** | Implement, Frontend Developer, Streamlit Developer, DevOps, Tester | Claude Sonnet 4.6 |
| 🟣 **Orchestration** | Orchestrator, Code Reviewer, Mentor, Janitor, Prompt Engineer, Mermaid Specialist, SVG Diagram, Accessibility | Claude Sonnet 4.6 |

All agents share a **handoff protocol** — each completion writes artefact paths and routing context into `pipeline-state.json`, so the Orchestrator can cold-start a new session from state alone.

---

## 🔧 8 MCP Tools

The junai MCP server provides callable pipeline operations from Copilot chat:

| Tool | What it does |
|---|---|
| `pipeline_init` | Initialise a new pipeline (active-pipeline guard built-in) |
| `pipeline_reset` | Force-clear and restart (bypasses guard) |
| `notify_orchestrator` | Record stage completion + trigger routing decision |
| `set_pipeline_mode` | Switch supervised / assisted / autopilot |
| `satisfy_gate` | Manually satisfy a supervision gate |
| `get_pipeline_status` | Read current stage, mode, routing decision |
| `validate_deferred_paths` | Verify deferred item file paths before close |
| `run_command` | Execute CLI commands from chat context |

---

## ⚡ Quick Start

1. Open any project in VS Code
2. Press `Ctrl+Shift+P` → **`junai: Initialize Agent Pipeline`**
3. The full agent pool installs into `.github/` and the MCP server is configured

Then in Copilot chat, open `@Orchestrator` and say:

```
New feature: <describe what you want to build>
I want to run this in autopilot mode.
```

The pipeline takes it from there.

---

## 📁 What Gets Installed

One command. Everything below lands in your `.github/` folder and travels with your repo.

| Folder | Contents |
|---|---|
| `agents/` | 23 role-scoped agent files — deeply crafted system prompts per specialist |
| `skills/` | Reusable skill modules agents can load on demand |
| `prompts/` | Workflow-level prompt templates (ADR, conventional commit, handoff, etc.) |
| `instructions/` | VS Code `.instructions.md` files for Copilot context (Python, FastAPI, SQL, Docker...) |
| `plans/` | Plan templates and backlog scaffold |
| `agent-docs/` | ARTIFACTS hub, architecture, PRD, UX, security docs |
| `handoffs/` | Cross-session context handoff protocol |
| `diagrams/` | Pipeline diagrams and reference cards |

Plus at the root level:
- `pipeline-state.json` — live pipeline state (stage, mode, gates, routing decisions, artefact refs)
- `.vscode/mcp.json` — MCP server registered automatically (requires `uv`)

---

## 🛠️ Commands

| Command | What it does |
|---|---|
| `junai: Initialize Agent Pipeline` | Install the full agent pool and configure the MCP server |
| `junai: Update Agent Pool` | Pull latest agent/skill files from the extension — preserves your pipeline state |
| `junai: Show Pipeline Status` | Inline status: current stage, mode, gate states, last routing decision |
| `junai: Set Pipeline Mode` | Switch pipeline mode without re-initialising |
| `junai: Remove from this project` | Clean uninstall — removes agent pool and MCP config |

---

## ⚙️ Extension Settings

| Setting | Default | Description |
|---|---|---|
| `junai.defaultMode` | `supervised` | Pipeline mode applied on `Initialize` |

---

## 📋 Requirements

- **VS Code** 1.101+
- **GitHub Copilot** subscription (the agents are Copilot chat participants)
- **`uv`** on PATH for MCP server — [install uv](https://docs.astral.sh/uv/getting-started/installation/) (one command, 30 seconds)

---

## 📚 Learn More

- [Full User Guide](https://github.com/saajunaid/junai/blob/main/USERGUIDE.md) — walkthrough, CLI reference, all 23 agents, stage table, troubleshooting
- [GitHub](https://github.com/saajunaid/junai) — star the repo, read the source
- [Issues & Feature Requests](https://github.com/saajunaid/junai-vscode/issues)

---

<div align="center">

*The future of software engineering is agentic.*
*junai makes it structured, auditable, and yours.*

**MIT © junai Labs**

</div>