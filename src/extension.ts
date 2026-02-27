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
        vscode.commands.registerCommand('junai.update',          (opts?: { silent?: boolean }) => cmdUpdate(context, opts)),
        vscode.commands.registerCommand('junai.probeAutopilot',  () => cmdProbeAutopilot()),
    );

    // Start autopilot watcher — fires when pipeline-state.json routing_decision appears in autopilot
    startAutopilotWatcher(context);

    // MCP server is registered via .vscode/mcp.json (written by junai.init → scaffoldMcpConfig).
    // No dynamic registerMcpServerDefinitionProvider needed — the mcp.json key "junai" must match
    // the tool prefix in agent frontmatter (e.g. junai/notify_orchestrator).

    // Welcome prompt — show once per workspace when the agent pool is not yet installed
    promptWelcomeIfNeeded(context);

    // Auto-update nudge — notify when workspace pool is behind the installed extension
    checkPoolUpdate(context);
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
            scaffoldVscodeSettings(targetFolder);

            // Write pool version marker so activation check knows workspace is current
            writeWorkspacePoolVersion(context, githubDir);

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
    for (const file of ['pipeline-state.json', 'copilot-instructions.md', 'project-config.md', '.junai-pool-version']) {
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
            }
            // Also clean up legacy key name
            if (cfg.servers && cfg.servers['junai-pipeline']) {
                delete cfg.servers['junai-pipeline'];
            }
            fs.writeFileSync(mcpFile, JSON.stringify(cfg, null, 2), 'utf8');
        } catch { /* leave mcp.json untouched if unreadable */ }
    }

    vscode.window.showInformationMessage('junai: Agent pool removed from this project. Re-run Initialize to restore it.');
}

// ─────────────────────────────────────────────────────────────
// junai.update — overwrite pool files with latest from extension bundle
// ─────────────────────────────────────────────────────────────────────────────
async function cmdUpdate(context: vscode.ExtensionContext, opts?: { silent?: boolean }) {
    const silent = opts?.silent ?? false;
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
        if (!silent) { vscode.window.showErrorMessage('junai: No workspace folder open.'); }
        return;
    }

    const githubDir = path.join(workspaceFolders[0].uri.fsPath, '.github');
    const agentsDir = path.join(githubDir, 'agents');
    if (!fs.existsSync(agentsDir)) {
        if (!silent) { vscode.window.showErrorMessage('junai: Pipeline not initialized in this project. Run Initialize first.'); }
        return;
    }

    if (!silent) {
        const confirmed = await vscode.window.showInformationMessage(
            'Update agent pool with latest files from this extension version? ' +
            'Your pipeline-state.json and project-config.md will NOT be touched.',
            { modal: true },
            'Update',
            'Cancel',
        );
        if (confirmed !== 'Update') { return; }
    }

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

            // Write pool version marker so activation check knows workspace is current
            writeWorkspacePoolVersion(context, githubDir);

            // Apply workspace settings fixes (idempotent — only sets if not already present)
            scaffoldMcpConfig(workspaceFolders[0].uri.fsPath);
            scaffoldVscodeSettings(workspaceFolders[0].uri.fsPath);

            progress.report({ message: 'Done.' });
        }
    );

    vscode.window.showInformationMessage(
        silent
            ? `junai: Agent pool auto-updated to v${readBundledPoolVersion(context) ?? 'latest'} — ${updated} files refreshed.`
            : `✅ junai pool updated — ${updated} files refreshed, ${skipped} user-owned files preserved.`
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

    // Migrate: remove legacy "junai-pipeline" key if present (renamed to "junai" in v0.3)
    if (config.servers['junai-pipeline']) {
        delete config.servers['junai-pipeline'];
    }

    // Only write if no junai entry already exists — never overwrite a user's custom config
    if (!config.servers['junai']) {
        // Use the local server.py that ships with the pool (deployed to .github/tools/mcp-server/).
        // This avoids the uvx-based PyPI approach (junai-mcp v0.1.x), which ran pipeline_runner
        // via subprocess using the uvx-isolated Python — that env lacks pydantic and all
        // workspace deps, so the subprocess always failed silently.
        // The local server.py uses direct in-process imports, so no subprocess or dep issues.
        // ${workspaceFolder} is resolved by VS Code at MCP startup time.
        const pythonBin = process.platform === 'win32'
            ? '${workspaceFolder}/.venv/Scripts/python.exe'
            : '${workspaceFolder}/.venv/bin/python';
        config.servers['junai'] = {
            type: 'stdio',
            command: pythonBin,
            args: ['${workspaceFolder}/.github/tools/mcp-server/server.py'],
        };
        fs.writeFileSync(mcpFile, JSON.stringify(config, null, 2), 'utf8');
    }
}

function scaffoldVscodeSettings(targetFolder: string): void {
    // Adds workspace-level file exclusions cosmetically needed on Windows.
    // The MCP server subprocess (Python / fastmcp + rich) opens the Windows NUL
    // device using a relative path (os.devnull = 'nul') while cwd is the workspace
    // root. Windows' ReadDirectoryChangesW watcher emits a phantom change event
    // for "NUL", which VS Code shows as a file in the explorer even though the
    // file doesn't actually exist. Adding NUL to files.exclude suppresses it.
    const vscodedir     = path.join(targetFolder, '.vscode');
    const settingsFile  = path.join(vscodedir, 'settings.json');
    fs.mkdirSync(vscodedir, { recursive: true });

    let settings: Record<string, unknown> = {};
    if (fs.existsSync(settingsFile)) {
        try { settings = JSON.parse(fs.readFileSync(settingsFile, 'utf8')); } catch { settings = {}; }
    }

    const exclude = (settings['files.exclude'] ?? {}) as Record<string, unknown>;
    if (!exclude['NUL']) {
        exclude['NUL'] = true;
        settings['files.exclude'] = exclude;
        fs.writeFileSync(settingsFile, JSON.stringify(settings, null, 4), 'utf8');
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// startAutopilotWatcher — real autopilot invoker
// Watches pipeline-state.json. When pipeline_mode=autopilot AND _routing_decision
// appears (pending, not blocked), opens the target agent chat and sends the
// routing prompt automatically — no user clicks required.
//
// VS Code generates workbench.action.chat.open<AgentName> for every .agent.md
// whose frontmatter name: field matches. Confirmed via probe on VS Code 1.109.5.
// ─────────────────────────────────────────────────────────────────────────────

/** A few agent names use slug form in the open command rather than verbatim name. */
const AGENT_OPEN_OVERRIDES: Record<string, string> = {
    'UI/UX Designer':                'ui-ux-designer',
    'Mermaid Diagram Specialist':    'mermaid-diagram-specialist',
};

function agentOpenCommand(agentName: string): string {
    const suffix = AGENT_OPEN_OVERRIDES[agentName] ?? agentName;
    return `workbench.action.chat.open${suffix}`;
}

async function tryExecuteCommand(
    channel: vscode.OutputChannel,
    command: string,
    ...args: unknown[]
): Promise<boolean> {
    try {
        await vscode.commands.executeCommand(command, ...args);
        return true;
    } catch {
        channel.appendLine(`  ⚠ Command unavailable: ${command}`);
        return false;
    }
}

function startAutopilotWatcher(context: vscode.ExtensionContext): void {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) { return; }

    const stateFilePath = path.join(
        workspaceFolders[0].uri.fsPath, '.github', 'pipeline-state.json'
    );

    const watcher = vscode.workspace.createFileSystemWatcher(
        new vscode.RelativePattern(workspaceFolders[0], '.github/pipeline-state.json')
    );

    const channel = vscode.window.createOutputChannel('junai Autopilot');

    // Track last dispatched decision to deduplicate rapid file-change events
    let lastDispatchedKey = '';

    const checkState = async () => {
        try {
            if (!fs.existsSync(stateFilePath)) { return; }
            const state = JSON.parse(fs.readFileSync(stateFilePath, 'utf8'));

            const mode     = state.pipeline_mode as string | undefined;
            const decision = state._notes?._routing_decision as Record<string, unknown> | undefined;

            if (mode !== 'autopilot' || !decision || decision.blocked) { return; }

            // Deduplicate: same stage + same last_updated = same decision already dispatched
            const dispatchKey = `${decision.next_stage ?? ''}:${state.last_updated ?? ''}`;
            if (dispatchKey === lastDispatchedKey) { return; }
            lastDispatchedKey = dispatchKey;

            const stage       = (decision.next_stage   as string) ?? '?';
            const targetAgent = (decision.target_agent as string) ?? 'None';
            const prompt      = (decision.handoff_prompt as string) ?? (decision.prompt as string) ?? '';

            channel.show(false);
            channel.appendLine(`\n[junai autopilot] 🚀 ${new Date().toISOString()}`);
            channel.appendLine(`  stage        : ${stage}`);
            channel.appendLine(`  target_agent : ${targetAgent}`);
            channel.appendLine(`  prompt       : ${prompt.length} chars`);

            // Pipeline closed — no agent to route to
            if (!targetAgent || targetAgent === 'None') {
                channel.appendLine(`  ✅ Pipeline reached closed state — no further routing needed.`);
                vscode.window.showInformationMessage(
                    `junai autopilot: ✅ Pipeline closed — ${state.feature ?? 'feature'} complete.`,
                    'View Log'
                ).then(c => { if (c === 'View Log') { channel.show(true); } });
                return;
            }

            // Open the agent chat with the routing prompt as the initial query.
            // workbench.action.chat.open<Name> accepts { query } on VS Code ≥1.99
            // (agent-mode). This is more reliable than the old two-step approach of
            // opening the agent and then calling steerWithMessage separately —
            // steerWithMessage routes to a standalone quick-chat overlay, NOT to the
            // agent's own chat panel, so the prompt was landing in the wrong session.
            // The prompt is also copied to clipboard as a safety net in case the
            // { query } arg is accepted but not honoured by a given VS Code build.
            const openCmd = agentOpenCommand(targetAgent);
            const openOk  = await tryExecuteCommand(channel, openCmd, { query: prompt });

            // Always put the prompt in clipboard regardless — user can Ctrl+V if needed
            await vscode.env.clipboard.writeText(prompt);

            if (!openOk) {
                // Agent open command not found — name mismatch or agent not registered
                channel.appendLine(`  ✗ Could not open @${targetAgent} via: ${openCmd}`);
                channel.appendLine(`  → Manual fallback: open @${targetAgent} and paste the routing prompt (Ctrl+V).`);
                vscode.window.showWarningMessage(
                    `junai autopilot: could not auto-open @${targetAgent}. Routing prompt copied to clipboard.`,
                    'View Log'
                ).then(c => { if (c === 'View Log') { channel.show(true); } });
                return;
            }

            channel.appendLine(`  ✓ Opened @${targetAgent} — routing prompt sent as query (also in clipboard)`);
            vscode.window.showInformationMessage(
                `junai autopilot: ✅ @${targetAgent} invoked — stage: ${stage}`,
                'View Log'
            ).then(c => { if (c === 'View Log') { channel.show(true); } });

        } catch {
            // malformed JSON mid-write — ignore, next save will retry
        }
    };

    watcher.onDidChange(() => { void checkState(); });
    watcher.onDidCreate(() => { void checkState(); });
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
    try {
        const lm = vscode.lm as any;
        const lmKeys = Object.keys(lm).filter(k => /chat|agent|send|request|mcp/i.test(k));
        for (const k of lmKeys) {
            channel.appendLine(`  vscode.lm.${k} : ${typeof lm[k]}`);
        }
        if (lmKeys.length === 0) {
            channel.appendLine('  (no matching keys found on vscode.lm)');
        }
    } catch (e: any) {
        channel.appendLine(`  ⚠ Could not enumerate vscode.lm: ${e?.message ?? e}`);
        channel.appendLine('  Add enabledApiProposals=["mcpServerDefinitions"] to package.json and use --enable-proposed-api flag,');
        channel.appendLine('  or run via F5 (Extension Development Host) to access proposed APIs.');
    }

    channel.appendLine('');
    channel.appendLine('Paste this output as context when implementing the real autopilot invoker.');
    vscode.window.showInformationMessage(`junai probe: found ${relevant.length} chat commands. See "junai Autopilot Probe" output channel.`);
}

// ─────────────────────────────────────────────────────────────────────────────
// Pool version helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Version baked into the extension bundle at publish time. */
function readBundledPoolVersion(context: vscode.ExtensionContext): string | null {
    const f = path.join(context.extensionPath, 'pool', 'POOL_VERSION');
    try { return fs.readFileSync(f, 'utf8').trim(); } catch { return null; }
}

/** Version last written into the workspace .github/ directory. */
function readWorkspacePoolVersion(githubDir: string): string | null {
    const f = path.join(githubDir, '.junai-pool-version');
    try { return fs.readFileSync(f, 'utf8').trim(); } catch { return null; }
}

/** Stamp the workspace so future activation checks know it's up to date. */
function writeWorkspacePoolVersion(context: vscode.ExtensionContext, githubDir: string): void {
    const v = readBundledPoolVersion(context);
    if (!v) { return; }
    fs.writeFileSync(path.join(githubDir, '.junai-pool-version'), v, 'utf8');
}

/**
 * On activation, compare bundled pool version against workspace pool version.
 * If bundled > workspace, show a one-click update nudge.
 * Suppressed if workspace isn't initialised yet (no agents/ dir).
 */
function checkPoolUpdate(context: vscode.ExtensionContext): void {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) { return; }

    const githubDir  = path.join(workspaceFolders[0].uri.fsPath, '.github');
    const agentsDir  = path.join(githubDir, 'agents');
    if (!fs.existsSync(agentsDir)) { return; }  // not initialised — welcome prompt handles it

    const bundled   = readBundledPoolVersion(context);
    const workspace = readWorkspacePoolVersion(githubDir);

    if (!bundled) { return; }                    // old bundle without version marker — skip
    if (bundled === workspace) { return; }        // already up to date

    // workspace === null means the project was initialized before version stamping existed.
    // Auto-update silently — no toast required, no user action needed.
    // This covers the reinstall/update case where the stamp was never written.
    if (workspace === null) {
        vscode.commands.executeCommand('junai.update', { silent: true });
        return;
    }

    // Workspace has a version stamp but is behind — nudge the user
    vscode.window.showInformationMessage(
        `junai agent pool update available: v${workspace} → v${bundled}`,
        'Update Now',
        'Later',
    ).then(choice => {
        if (choice === 'Update Now') {
            vscode.commands.executeCommand('junai.update');
        }
    });
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
