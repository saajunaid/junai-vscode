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
    );
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

            progress.report({ message: 'Done.' });
        }
    );

    const open = await vscode.window.showInformationMessage(
        `✅ junai agent pipeline installed (mode: ${mode}). Open ARTIFACTS.md to get started.`,
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
