import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

// ─────────────────────────────────────────────────────────────
// Activate
// ─────────────────────────────────────────────────────────────
export function activate(context: vscode.ExtensionContext) {
    context.subscriptions.push(
        vscode.commands.registerCommand('junai.init',    () => cmdInit(context)),
        vscode.commands.registerCommand('junai.status',  () => cmdStatus()),
        vscode.commands.registerCommand('junai.setMode', () => cmdSetMode()),
        vscode.commands.registerCommand('junai.remove',  () => cmdRemove()),
    );

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

// ─────────────────────────────────────────────────────────────
// junai.remove — remove agent pool + state from this project
// ─────────────────────────────────────────────────────────────
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
// Helpers
// ─────────────────────────────────────────────────────────────
const SKIP = new Set(['.git', 'node_modules', '__pycache__', '.DS_Store']);

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
