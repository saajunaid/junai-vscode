import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

// ─────────────────────────────────────────────────────────────
// Activate
// ─────────────────────────────────────────────────────────────
export function activate(context: vscode.ExtensionContext) {
    context.subscriptions.push(
        vscode.commands.registerCommand('junai.init',            () => cmdInit(context)),
        vscode.commands.registerCommand('junai.status',          () => cmdStatus()),
        vscode.commands.registerCommand('junai.setMode',         () => cmdSetMode()),
        vscode.commands.registerCommand('junai.remove',          () => cmdRemove()),
        vscode.commands.registerCommand('junai.update',          () => cmdUpdate(context)),
        vscode.commands.registerCommand('junai.probeAutopilot',  () => cmdProbeAutopilot()),
    );

    // Start autopilot watcher — fires when pipeline-state.json routing_decision appears in autopilot
    startAutopilotWatcher(context);

    // Register junai-mcp as an MCP server definition provider (VS Code 1.102+)
    // Uses dynamic check so the extension still works on older VS Code versions.
    const lm = vscode.lm as any;
    if (typeof lm.registerMcpServerDefinitionProvider === 'function') {
        const McpStdio = (vscode as any).McpStdioServerDefinition;
        context.subscriptions.push(
            lm.registerMcpServerDefinitionProvider('junai', {
                provideMcpServerDefinitions: (_token: any) => [
                    new McpStdio('junai MCP Server', 'uvx', ['junai-mcp'])
                ]
            })
        );
    }

    // Welcome prompt — show once per workspace when the agent pool is not yet installed
    promptWelcomeIfNeeded(context);
}

function promptWelcomeIfNeeded(context: vscode.ExtensionContext): void {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) { return; }

    const agentsDir = path.join(workspaceFolders[0].uri.fsPath, '.github', 'agents');
    if (fs.existsSync(agentsDir)) { return; }   // already initialised — stay silent

    // Only prompt once per workspace (suppress if user dismissed before)
    const storageKey = `junai.welcomed.${workspaceFolders[0].uri.fsPath}`;
    if (context.workspaceState.get<boolean>(storageKey)) { return; }

    vscode.window.showInformationMessage(
        'junai: Agent pipeline not yet set up in this project. Run Initialize to install 23 agents, skills, and MCP config.',
        'Initialize Now',
        'Not Now',
    ).then(choice => {
        if (choice === 'Initialize Now') {
            vscode.commands.executeCommand('junai.init');
        } else {
            // Mark as dismissed so we don't prompt again for this workspace
            context.workspaceState.update(storageKey, true);
        }
    });
}

export function deactivate() {}

// ─────────────────────────────────────────────────────────────
// junai.init — copy agent pool into workspace .github/
// ─────────────────────────────────────────────────────────────
async function cmdInit(context: vscode.ExtensionContext) {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
        vscode.window.showErrorMessage('junai: No workspace folder open. Open a project folder first.');
        return;
    }

    // Multi-root: let user pick folder
    let targetFolder: string;
    if (workspaceFolders.length === 1) {
        targetFolder = workspaceFolders[0].uri.fsPath;
    } else {
        const picked = await vscode.window.showQuickPick(
            workspaceFolders.map(f => ({
                label: f.name,
                description: f.uri.fsPath,
                fsPath: f.uri.fsPath,
            })),
            { placeHolder: 'Select the workspace folder to initialize junai in' }
        );
        if (!picked) { return; }
        targetFolder = picked.fsPath;
    }

    const githubDir = path.join(targetFolder, '.github');
    const poolDir   = path.join(context.extensionPath, 'pool');
    const agentsDir = path.join(githubDir, 'agents');

    // Already initialised?
    if (fs.existsSync(agentsDir)) {
        const choice = await vscode.window.showWarningMessage(
            'junai pipeline is already initialised in this project.',
            { modal: true },
            'Overwrite', 'Cancel'
        );
        if (choice !== 'Overwrite') { return; }
    }

    // Read the configured default mode
    const cfg  = vscode.workspace.getConfiguration('junai');
    const mode = cfg.get<string>('defaultMode', 'supervised');

    await vscode.window.withProgress(
        {
            location: vscode.ProgressLocation.Notification,
            title: 'junai',
            cancellable: false,
        },
        async (progress) => {
            progress.report({ message: 'Copying agent pool…' });
            copyDirSync(poolDir, githubDir);

            progress.report({ message: 'Scaffolding pipeline state…' });
            scaffoldPipelineState(githubDir, mode);

            progress.report({ message: 'Configuring MCP server…' });
            scaffoldMcpConfig(targetFolder);

            progress.report({ message: 'Done.' });
        }
    );

    const open = await vscode.window.showInformationMessage(
        `✅ junai agent pipeline installed (mode: ${mode}). MCP server configured in .vscode/mcp.json. Open ARTIFACTS.md to get started.`,
        'Open ARTIFACTS.md', 'Dismiss'
    );
    if (open === 'Open ARTIFACTS.md') {
        const artifactsPath = path.join(githubDir, 'agent-docs', 'ARTIFACTS.md');
        if (fs.existsSync(artifactsPath)) {
            vscode.commands.executeCommand(
                'markdown.showPreview',
                vscode.Uri.file(artifactsPath)
            );
        }
    }
}

// ─────────────────────────────────────────────────────────────
// junai.status — show pipeline state in output channel
// ─────────────────────────────────────────────────────────────
async function cmdStatus() {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
        vscode.window.showErrorMessage('junai: No workspace folder open.');
        return;
    }
    const githubDir  = path.join(workspaceFolders[0].uri.fsPath, '.github');
    const stateFile  = path.join(githubDir, 'pipeline-state.json');

    const channel = vscode.window.createOutputChannel('junai Pipeline');
    channel.show(true);

    if (!fs.existsSync(stateFile)) {
        channel.appendLine('⚠  No pipeline-state.json found. Run "junai: Initialize Agent Pipeline" first.');
        return;
    }

    const state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
    channel.appendLine('─── junai Pipeline Status ───────────────────');
    channel.appendLine(`  Mode        : ${state.mode}`);
    channel.appendLine(`  Initialized : ${state.initialized}`);
    channel.appendLine(`  Version     : ${state.version}`);
    channel.appendLine('─────────────────────────────────────────────');
}

// ─────────────────────────────────────────────────────────────
// junai.setMode — quick-pick to change pipeline mode
// ─────────────────────────────────────────────────────────────
async function cmdSetMode() {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
        vscode.window.showErrorMessage('junai: No workspace folder open.');
        return;
    }

    const picked = await vscode.window.showQuickPick(
        [
            {
                label: 'supervised',
                description: 'All gates require manual approval — recommended for production teams',
            },
            {
                label: 'assisted',
                description: 'Manual gates with AI guidance hints',
            },
            {
                label: 'autopilot',
                description: 'All gates auto-satisfied except intent_approved — fully autonomous after kick-off',
            },
        ],
        { placeHolder: 'Select pipeline mode' }
    );
    if (!picked) { return; }

    const stateFile = path.join(
        workspaceFolders[0].uri.fsPath, '.github', 'pipeline-state.json'
    );
    if (!fs.existsSync(stateFile)) {
        vscode.window.showErrorMessage('junai: No pipeline-state.json found. Initialize the pipeline first.');
        return;
    }

    const state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
    state.mode  = picked.label;
    fs.writeFileSync(stateFile, JSON.stringify(state, null, 2), 'utf8');

    vscode.window.showInformationMessage(`junai: Pipeline mode set to "${picked.label}".`);
}

// ─────────────────────────────────────────────────────────────────────────────
// junai.remove — remove agent pool + state from this project
// ─────────────────────────────────────────────────────────────────────────────
async function cmdRemove() {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
        vscode.window.showErrorMessage('junai: No workspace folder open.');
        return;
    }

    const confirmed = await vscode.window.showWarningMessage(
        'This will delete the junai agent pool (.github/agents, skills, prompts, instructions, agent-docs, plans, handoffs, tools, pipeline-state.json) and remove the MCP entry from .vscode/mcp.json. Your own code and commits are NOT affected.',
        { modal: true },
        'Remove junai from this project',
        'Cancel',
    );
    if (confirmed !== 'Remove junai from this project') { return; }

    const targetFolder = workspaceFolders[0].uri.fsPath;
    const githubDir    = path.join(targetFolder, '.github');

    // Pool directories installed by init
    const poolDirs = [
        'agents', 'skills', 'prompts', 'instructions',
        'agent-docs', 'plans', 'handoffs', 'tools',
    ];
    for (const dir of poolDirs) {
        const p = path.join(githubDir, dir);
        if (fs.existsSync(p)) { fs.rmSync(p, { recursive: true, force: true }); }
    }

    // Root files installed by init
    for (const file of ['pipeline-state.json', 'copilot-instructions.md', 'project-config.md']) {
        const p = path.join(githubDir, file);
        if (fs.existsSync(p)) { fs.rmSync(p, { force: true }); }
    }

    // Remove junai entry from .vscode/mcp.json without deleting the whole file
    const mcpFile = path.join(targetFolder, '.vscode', 'mcp.json');
    if (fs.existsSync(mcpFile)) {
        try {
            const cfg = JSON.parse(fs.readFileSync(mcpFile, 'utf8'));
            if (cfg.servers && cfg.servers['junai']) {
                delete cfg.servers['junai'];
                fs.writeFileSync(mcpFile, JSON.stringify(cfg, null, 2), 'utf8');
            }
        } catch { /* leave mcp.json untouched if unreadable */ }
    }

    vscode.window.showInformationMessage('junai: Agent pool removed from this project. Re-run Initialize to restore it.');
}

// ─────────────────────────────────────────────────────────────
// junai.update — overwrite pool files with latest from extension bundle
// ─────────────────────────────────────────────────────────────────────────────
async function cmdUpdate(context: vscode.ExtensionContext) {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
        vscode.window.showErrorMessage('junai: No workspace folder open.');
        return;
    }

    const githubDir = path.join(workspaceFolders[0].uri.fsPath, '.github');
    const agentsDir = path.join(githubDir, 'agents');
    if (!fs.existsSync(agentsDir)) {
        vscode.window.showErrorMessage('junai: Pipeline not initialized in this project. Run Initialize first.');
        return;
    }

    const confirmed = await vscode.window.showInformationMessage(
        'Update agent pool with latest files from this extension version? ' +
        'Your pipeline-state.json and project-config.md will NOT be touched.',
        { modal: true },
        'Update',
        'Cancel',
    );
    if (confirmed !== 'Update') { return; }

    const poolDir = path.join(context.extensionPath, 'pool');

    // Files that belong to the user — never overwrite
    const USER_OWNED = new Set(['pipeline-state.json', 'project-config.md']);

    let updated = 0;
    let skipped = 0;

    await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: 'junai', cancellable: false },
        async (progress) => {
            progress.report({ message: 'Updating agent pool…' });

            const poolDirs = ['agents', 'skills', 'prompts', 'instructions', 'agent-docs', 'plans', 'handoffs', 'tools'];
            for (const dir of poolDirs) {
                const src  = path.join(poolDir, dir);
                const dest = path.join(githubDir, dir);
                if (!fs.existsSync(src)) { continue; }
                const counts = mergeDirSync(src, dest, USER_OWNED);
                updated += counts.updated;
                skipped += counts.skipped;
            }

            // Update root pool files (not user-owned ones)
            for (const file of ['copilot-instructions.md']) {
                const src  = path.join(poolDir, file);
                const dest = path.join(githubDir, file);
                if (fs.existsSync(src) && !USER_OWNED.has(file)) {
                    fs.copyFileSync(src, dest);
                    updated++;
                }
            }

            progress.report({ message: 'Done.' });
        }
    );

    vscode.window.showInformationMessage(
        `✅ junai pool updated — ${updated} files refreshed, ${skipped} user-owned files preserved.`
    );
}
// ─────────────────────────────────────────────────────────────
const SKIP = new Set(['.git', 'node_modules', '__pycache__', '.DS_Store']);

// copyDirSync — full overwrite, used by init
function copyDirSync(src: string, dest: string): void {
    if (!fs.existsSync(src)) { return; }
    fs.mkdirSync(dest, { recursive: true });
    for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
        if (SKIP.has(entry.name)) { continue; }
        const srcPath  = path.join(src, entry.name);
        const destPath = path.join(dest, entry.name);
        if (entry.isDirectory()) {
            copyDirSync(srcPath, destPath);
        } else {
            fs.copyFileSync(srcPath, destPath);
        }
    }
}

// mergeDirSync — overwrites existing files, skips user-owned filenames, used by update
function mergeDirSync(src: string, dest: string, userOwned: Set<string>): { updated: number; skipped: number } {
    let updated = 0; let skipped = 0;
    if (!fs.existsSync(src)) { return { updated, skipped }; }
    fs.mkdirSync(dest, { recursive: true });
    for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
        if (SKIP.has(entry.name)) { continue; }
        const srcPath  = path.join(src, entry.name);
        const destPath = path.join(dest, entry.name);
        if (entry.isDirectory()) {
            const sub = mergeDirSync(srcPath, destPath, userOwned);
            updated += sub.updated; skipped += sub.skipped;
        } else if (userOwned.has(entry.name)) {
            skipped++;
        } else {
            fs.copyFileSync(srcPath, destPath);
            updated++;
        }
    }
    return { updated, skipped };
}

function scaffoldMcpConfig(targetFolder: string): void {
    const vscodedir = path.join(targetFolder, '.vscode');
    const mcpFile   = path.join(vscodedir, 'mcp.json');
    fs.mkdirSync(vscodedir, { recursive: true });

    let config: { servers?: Record<string, unknown> } = {};
    if (fs.existsSync(mcpFile)) {
        try { config = JSON.parse(fs.readFileSync(mcpFile, 'utf8')); } catch { config = {}; }
    }
    if (!config.servers) { config.servers = {}; }

    // Only write if no junai entry already exists — never overwrite a user's custom config
    if (!config.servers['junai']) {
        config.servers['junai'] = {
            type: 'stdio',
            command: 'uvx',
            args: ['junai-mcp'],
        };
        fs.writeFileSync(mcpFile, JSON.stringify(config, null, 2), 'utf8');
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// startAutopilotWatcher — DRY RUN PROBE
// Watches pipeline-state.json. When pipeline_mode=autopilot AND _routing_decision
// appears (pending + not blocked), fires a toast and logs to the output channel.
// This proves the detection layer works before we wire up the real invocation.
// ─────────────────────────────────────────────────────────────────────────────
function startAutopilotWatcher(context: vscode.ExtensionContext): void {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) { return; }

    const stateFile = vscode.Uri.file(
        path.join(workspaceFolders[0].uri.fsPath, '.github', 'pipeline-state.json')
    );

    const watcher = vscode.workspace.createFileSystemWatcher(
        new vscode.RelativePattern(workspaceFolders[0], '.github/pipeline-state.json')
    );

    const channel = vscode.window.createOutputChannel('junai Autopilot');

    const checkState = () => {
        try {
            if (!fs.existsSync(stateFile.fsPath)) { return; }
            const raw  = fs.readFileSync(stateFile.fsPath, 'utf8');
            const state = JSON.parse(raw);

            const mode     = state.pipeline_mode as string | undefined;
            const decision = state._notes?._routing_decision as Record<string, unknown> | undefined;

            if (mode === 'autopilot' && decision && !decision.blocked) {
                const target = (decision.next_stage as string) ?? '?';
                const agent  = (decision.agent      as string) ?? '?';
                channel.show(false);
                channel.appendLine(`[junai autopilot] 🚦 Routing decision detected`);
                channel.appendLine(`  next_stage : ${target}`);
                channel.appendLine(`  agent      : ${agent}`);
                channel.appendLine(`  mode       : ${mode}`);
                channel.appendLine(`  prompt_len : ${String((decision.prompt as string ?? '').length)} chars`);
                channel.appendLine(`───────────────────────────────────────────────────`);
                channel.appendLine(`  [DRY RUN] Would invoke @${agent} here. Run junai.probeAutopilot`);
                channel.appendLine(`  to see which VS Code chat commands are available.`);

                vscode.window.showInformationMessage(
                    `junai autopilot: routing to @${agent} (${target}). [DRY RUN — watcher fired]`,
                    'View Log'
                ).then(c => { if (c === 'View Log') { channel.show(true); } });
            }
        } catch {
            // malformed JSON mid-write — ignore
        }
    };

    watcher.onDidChange(checkState);
    watcher.onDidCreate(checkState);
    context.subscriptions.push(watcher, channel);
}

// ─────────────────────────────────────────────────────────────────────────────
// cmdProbeAutopilot — enumerate all available VS Code chat / copilot commands
// Run this command from the Command Palette to see exactly what's available
// for the real autopilot invocation implementation.
// ─────────────────────────────────────────────────────────────────────────────
async function cmdProbeAutopilot(): Promise<void> {
    const channel = vscode.window.createOutputChannel('junai Autopilot Probe');
    channel.show(true);
    channel.appendLine('=== junai Autopilot Command Probe ===');
    channel.appendLine(`VS Code version : ${vscode.version}`);
    channel.appendLine('');

    const allCommands = await vscode.commands.getCommands(true);
    const relevant = allCommands
        .filter(c => /chat|copilot|agent|handoff|send|message/i.test(c))
        .sort();

    channel.appendLine(`Found ${relevant.length} chat/copilot/agent commands:`);
    channel.appendLine('');
    for (const cmd of relevant) {
        channel.appendLine(`  ${cmd}`);
    }

    channel.appendLine('');
    channel.appendLine('--- lm API surface (1.102 probe) ---');
    const lm = vscode.lm as any;
    const lmKeys = Object.keys(lm).filter(k => /chat|agent|send|request|mcp/i.test(k));
    for (const k of lmKeys) {
        channel.appendLine(`  vscode.lm.${k} : ${typeof lm[k]}`);
    }

    channel.appendLine('');
    channel.appendLine('Paste this output as context when implementing the real autopilot invoker.');
    vscode.window.showInformationMessage(`junai probe: found ${relevant.length} chat commands. See "junai Autopilot Probe" output channel.`);
}

function scaffoldPipelineState(githubDir: string, mode: string): void {
    const stateFile = path.join(githubDir, 'pipeline-state.json');
    if (!fs.existsSync(stateFile)) {
        const state = {
            version:     '1.0.0',
            initialized: new Date().toISOString(),
            mode,
            stages:    {},
            artefacts: {},
        };
        fs.writeFileSync(stateFile, JSON.stringify(state, null, 2), 'utf8');
    }
}
