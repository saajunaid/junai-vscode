# junai - AI Agent Pipeline

> AI agent pipeline for GitHub Copilot. Agentic workflow automation with 23 role-scoped agents - architect, implement, test, review. Deterministic. Auditable. From idea to shipped.

## Quick Start

1. Open any project in VS Code
2. Press `Ctrl+Shift+P` then run **junai: Initialize Agent Pipeline**
3. The full agent pool is installed into `.github/` and the MCP server is configured automatically

Open `.github/agent-docs/ARTIFACTS.md` to start your first pipeline.

---

## What gets installed

| Folder | Contents |
|---|---|
| `agents/` | 23 role-scoped agent files (architect, planner, implementer, tester, reviewer...) |
| `skills/` | Reusable skill modules for agents |
| `prompts/` | Workflow-level prompt templates |
| `instructions/` | VS Code `.instructions.md` files for Copilot context |
| `plans/` | Plan templates and backlog scaffold |
| `agent-docs/` | ARTIFACTS hub, architecture, PRD, UX, security docs |
| `handoffs/` | Cross-session context handoff protocol |
| `diagrams/` | Pipeline diagrams and reference cards |

A `pipeline-state.json` is scaffolded to track stage, gates, and mode.

A `.vscode/mcp.json` entry for the `junai` MCP server is added automatically (requires `uv` installed).

---

## Commands

| Command | What it does |
|---|---|
| `junai: Initialize Agent Pipeline` | Install agent pool into `.github/` and configure MCP server |
| `junai: Show Pipeline Status` | Display current stage, mode, and gate status |
| `junai: Set Pipeline Mode` | Switch pipeline mode without re-initialising |

---

## Pipeline Modes

| Mode | Behaviour |
|---|---|
| `supervised` | Every gate requires explicit manual approval |
| `assisted` | Manual gates with AI-generated guidance hints |
| `autopilot` | All gates auto-satisfied except `intent_approved` -- fully autonomous once intent is signed off |

---

## Extension Settings

| Setting | Default | Description |
|---|---|---|
| `junai.defaultMode` | `supervised` | Pipeline mode applied on init |

---

## Requirements

- VS Code 1.80+
- For MCP server: [`uv`](https://docs.astral.sh/uv/getting-started/installation/) installed and on PATH

---

## Learn more

- [Full User Guide](https://github.com/saajunaid/junai/blob/main/USERGUIDE.md) -- walkthrough, CLI reference, stage table, troubleshooting
- [GitHub](https://github.com/saajunaid/junai)

---

MIT (c) junai Labs