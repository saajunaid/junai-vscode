# junai — Agent Pipeline

> From idea to shipped — drop-in agentic pipelines. Deterministic. Auditable. Autonomous.

## What it does

Installs the full **junai agent pool** into any project's `.github/` directory with a single command. The pool includes:

| Folder | Contents |
|---|---|
| `agents/` | Role-scoped agent instruction files (architect, planner, implementer, tester, reviewer…) |
| `skills/` | Reusable skill modules for agents |
| `prompts/` | Workflow-level prompt templates |
| `instructions/` | VS Code `.instructions.md` files (Copilot context) |
| `plans/` | Plan templates and backlog |
| `agent-docs/` | ARTIFACTS hub, architecture, PRD, UX docs |
| `handoffs/` | Cross-session context handoff protocol |
| `diagrams/` | Pipeline diagrams and reference cards |

A `pipeline-state.json` is also scaffolded to track stage progress and gate approvals.

## Commands

| Command | Description |
|---|---|
| `junai: Initialize Agent Pipeline` | Copy the full agent pool into `.github/` and scaffold `pipeline-state.json` |
| `junai: Show Pipeline Status` | Display current mode, version, and init timestamp in the output panel |
| `junai: Set Pipeline Mode` | Switch between `supervised`, `assisted`, and `autopilot` modes |

## Pipeline Modes

| Mode | Behaviour |
|---|---|
| `supervised` | Every gate requires explicit manual approval |
| `assisted` | Manual gates with AI-generated guidance hints |
| `autopilot` | All gates auto-satisfied **except** `intent_approved` — fully autonomous once intent is signed off |

## Extension Settings

| Setting | Default | Description |
|---|---|---|
| `junai.defaultMode` | `supervised` | Default pipeline mode applied to new projects |

## Requirements

VS Code 1.80+. No other dependencies needed at runtime.

---

## Development

### Pre-requisites

- Node.js 18+
- The `agent-sandbox` or `junai` source repo as a sibling directory

### Build

```bash
npm install
npm run bundle-pool      # copies agent pool from sibling source repo → pool/
npm run compile          # tsc
```

### Bundle pool from a custom path

```bash
JUNAI_SOURCE=/path/to/.github npm run bundle-pool
```

### Package

```bash
npm run package
```

> **Note:** `package.json` references `icon.png` (128×128 PNG required by marketplace).
> Export `diagrams/icon.svg` as `icon.png` before packaging.

### Publish

```bash
vsce login junai-labs
npm run publish
```

---

## License

MIT © junai Labs — Agent Pipeline: VS Code extension that installs drop-in agentic pipelines into any project. Deterministic. Auditable. Autonomous.
