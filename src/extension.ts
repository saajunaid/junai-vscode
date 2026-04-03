import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { spawnSync } from 'child_process';

// ─────────────────────────────────────────────────────────────
// Managed section in copilot-instructions.md
// ─────────────────────────────────────────────────────────────
const JUNAI_SECTION_START = '<!-- junai:start — managed by junai extension, do not edit this section -->';
const JUNAI_SECTION_END   = '<!-- junai:end -->';
const COPILOT_RUNTIME_DIR = '.github';
const CLAUDE_RUNTIME_DIR = '.claude';
const CODEX_RUNTIME_DIR = '.codex';
const COPILOT_RUNTIME_DIR = '.github';
const CLAUDE_RUNTIME_DIR = '.claude';
const CODEX_RUNTIME_DIR = '.codex';

function junaiManagedSection(): string {
    return [
        JUNAI_SECTION_START,
        '',
        '## junai Agent Pipeline',
        '',
        '> junai system documentation (agents, pipeline flow, MCP tools, routing conventions) is',
        '> automatically provided by `.github/instructions/junai-system.instructions.md`.',
        '>',
        '> Project-specific config: `.github/project-config.md` | Pipeline state: `.github/pipeline-state.json`',
        '>',
        '> Start with `@Orchestrator` in Copilot Chat.',
        '',
        JUNAI_SECTION_END,
    ].join('\n');
}

/**
 * Ensure copilot-instructions.md exists and contains the junai managed section.
 * - If the file doesn't exist, creates it with a template header + managed section.
 * - If the file exists but has no managed section, appends the section.
 * - If the file exists and already has a managed section, replaces it with the latest.
 * Never touches content outside the managed section delimiters.
 */
function ensureCopilotInstructionsSection(githubDir: string): void {
    const filePath = path.join(githubDir, 'copilot-instructions.md');
    const section  = junaiManagedSection();

    if (!fs.existsSync(filePath)) {
        // First-time creation: clean template + managed section
        const template = [
            '# Project Instructions',
            '',
            '<!-- Add your project\'s context, conventions, and institutional knowledge below. -->',
            '',
            '---',
            '',
            section,
            '',
        ].join('\n');
        fs.writeFileSync(filePath, template, 'utf8');
        return;
    }

    const content = fs.readFileSync(filePath, 'utf8');
    const startIdx = content.indexOf(JUNAI_SECTION_START);
    const endIdx   = content.indexOf(JUNAI_SECTION_END);

    if (startIdx !== -1 && endIdx !== -1) {
        // Replace existing managed section
        const before = content.slice(0, startIdx);
        const after  = content.slice(endIdx + JUNAI_SECTION_END.length);
        fs.writeFileSync(filePath, before + section + after, 'utf8');
    } else {
        // Append managed section to end of existing file
        const separator = content.endsWith('\n') ? '\n' : '\n\n';
        fs.writeFileSync(filePath, content + separator + section + '\n', 'utf8');
    }
}

/**
 * Remove only the junai managed section from copilot-instructions.md.
 * Leaves the rest of the file intact. Does nothing if no managed section found.
 */
function removeCopilotInstructionsSection(githubDir: string): void {
    const filePath = path.join(githubDir, 'copilot-instructions.md');
    if (!fs.existsSync(filePath)) { return; }

    const content  = fs.readFileSync(filePath, 'utf8');
    const startIdx = content.indexOf(JUNAI_SECTION_START);
    const endIdx   = content.indexOf(JUNAI_SECTION_END);

    if (startIdx === -1 || endIdx === -1) { return; }

    const before = content.slice(0, startIdx);
    const after  = content.slice(endIdx + JUNAI_SECTION_END.length);
    // Clean up double blank lines left by removal
    const cleaned = (before + after).replace(/\n{3,}/g, '\n\n').trimEnd() + '\n';
    fs.writeFileSync(filePath, cleaned, 'utf8');
}

// ─────────────────────────────────────────────────────────────
// Activate
// ─────────────────────────────────────────────────────────────
export function activate(context: vscode.ExtensionContext) {
    context.subscriptions.push(
        vscode.commands.registerCommand('junai.init',            () => cmdInit(context)),
        vscode.commands.registerCommand('junai.selectProfile',   (opts?: { targetFolder?: string; silent?: boolean }) => cmdSelectProfile(context, opts)),
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

    // Check the user's preferred auto-init behaviour
    const autoMode = vscode.workspace.getConfiguration('junai').get<string>('autoInitializeOnActivation', 'prompt');
    if (autoMode === 'never') { return; }   // user opted out entirely
    if (autoMode === 'always') {
        // Silently initialize without any dialog — cmdInit({ silent: true }) guards against re-init
        void cmdInit(context, { silent: true });
        return;
    }

    // 'prompt' mode — default: show info message once per workspace
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

export function deactruntime bundles into workspace .github/.claude/.codex

// ─────────────────────────────────────────────────────────────
// junai.init — copy runtime bundles into workspace .github/.claude/.codex
// ─────────────────────────────────────────────────────────────
async function cmdInit(context: vscode.ExtensionContext, opts?: { silent?: boolean }) {
    const silent = opts?.silent ?? false;
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
        if (!silent) {
            vscode.window.showErrorMessage('junai: No workspace folder open. Open a project folder first.');
        }
        return;
    }

    // Multi-root: let user pick folder (silent mode always uses first folder)
    let targetFolder: string;
    if (workspaceFolders.length === 1 || silent) {
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
        targetFolder = picked.fsPath;COPILOT_RUNTIME_DIR
    }

    const githubDir = path.join(targetFolder, COPILOT_RUNTIME_DIR);
    const poolDir   = path.join(context.extensionPath, 'pool');
    const agentsDir = path.join(githubDir, 'agents');

    // Already initialised?
    if (fs.existsSync(agentsDir)) {
        if (silent) { return; }  // auto-init never re-initializes an existing project
        const choice = await vscode.window.showWarningMessage(
            'junai pipeline is already initialised in this project. Your project-config.md will be backed up before overwriting.',
            { modal: true },
            'Overwrite', 'Cancel'
        );
        if (choice !== 'Overwrite') { return; }
        // Backup project-config.md so the user can recover their customisations
        backupProjectConfig(githubDir);
    }

    // Read the configured default mode
    const cfg  = vscode.workspace.getConfiguration('junai');
    const mode = cfg.get<string>('defaultMode', 'supervised');

    await vscode.window.withProgress(
        {
            location: vscode.ProgressLocation.Notification,
            title: 'junai',
            cancellable: false,
        },installRuntimeBundles(poolDir, targetFolde
        async (progress) => {
            progress.report({ message: 'Copying agent pool…' });
            installRuntimeBundles(poolDir, targetFolder);

            progress.report({ message: 'Setting up copilot-instructions.md…' });
            ensureCopilotInstructionsSection(githubDir);

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

    await promptProfileSelectionAfterInit(context, targetFolder);

    if (silent) {
        vscode.window.showInformationMessage(
            `✅ junai agent pipeline auto-initialized (mode: ${mode}).`
        );
        return;
    }

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

// Friendly one-line descriptions shown in the profile picker alongside the profile name.
// Keys match the ### profilename headings in project-config.md.
const PROFILE_DESCRIPTIONS: Record<string, string> = {
    'streamlit-mssql-enterprise':        'Streamlit dashboard + SQL Server — enterprise internal tools',
    'streamlit-postgres-analytics':      'Streamlit dashboard + PostgreSQL — analytics and BI apps',
    'fastapi-postgres-service':          'FastAPI REST service + PostgreSQL — cloud microservices',
    'fastapi-mssql-internal-api':        'FastAPI REST service + SQL Server — internal corporate APIs',
    'react-node-saas':                   'React + Node.js — SaaS products and customer-facing apps',
    'nextjs-postgres-saas':              'Next.js + PostgreSQL — full-stack SaaS with SSR',
    'data-pipeline-python-mssql':        'Python ETL pipeline + SQL Server — data engineering',
    'data-pipeline-python-snowflake':    'Python data pipeline + Snowflake — cloud data warehouse',
    'ml-training-python-pytorch':        'PyTorch ML training — GPU workloads and model development',
    'mcp-server-python':                 'Python MCP server — Model Context Protocol tooling',
    'vscode-extension-typescript':       'VS Code extension — TypeScript, vsce, activation events',
    'telecom-appointment-intelligence':  'FastAPI + React + MSSQL + Redis + Ollama — full-stack AI system',
    'org1-telecom-ops':                  'Org1 — telecoms operations, full brand colour palette included',
    'org2-finance-ops':                  'Org2 — finance operations team profile',
    'org3-healthcare-ops':               'Org3 — healthcare operations team profile',
};

async function cmdSelectProfile(
    context: vscode.ExtensionContext,
    opts?: { targetFolder?: string; silent?: boolean }
): Promise<void> {
    const silent = opts?.silent ?? false;
    const targetFolder = opts?.targetFolder ?? await pickTargetFolder();
    if (!targetFolder) { return; }

    const projectConfigPath = path.join(targetFolder, '.github', 'project-config.md');
    if (!fs.existsSync(projectConfigPath)) {
        const initialize = await vscode.window.showInformationMessage(
            'junai: project-config.md not found. Initialize pipeline resources first?',
            'Initialize Now', 'Cancel'
        );
        if (initialize !== 'Initialize Now') { return; }
        await vscode.commands.executeCommand('junai.init');
        if (!fs.existsSync(projectConfigPath)) { return; }
    }

    const raw = fs.readFileSync(projectConfigPath, 'utf8');
    const profiles = extractProfileNames(raw);
    if (profiles.length === 0) {
        if (!silent) {
            vscode.window.showWarningMessage(
                'junai: No named profiles found in .github/project-config.md. Add profile definitions first.'
            );
        }
        return;
    }

    const options: vscode.QuickPickItem[] = profiles.map((name) => ({
        label: name,
        description: PROFILE_DESCRIPTIONS[name] ?? `Set active profile to ${name}`,
    }));
    options.push({
        label: 'manual (blank profile)',
        description: 'Clear profile — fill placeholder values manually in Step 2',
    });

    const picked = await vscode.window.showQuickPick(options, {
        placeHolder: 'Select a project profile for .github/project-config.md',
    });
    if (!picked) { return; }

    const selectedProfile = picked.label === 'manual (blank profile)' ? '' : picked.label;
    const updated = setProfileValue(raw, selectedProfile);
    if (updated === raw) {
        if (!silent) {
            vscode.window.showWarningMessage('junai: Could not locate the profile row in project-config.md.');
        }
        return;
    }

    fs.writeFileSync(projectConfigPath, updated, 'utf8');
    if (!silent) {
        const finalLabel = selectedProfile || '(blank/manual)';
        vscode.window.showInformationMessage(`junai: project profile set to ${finalLabel}.`);
    }

    const storageKey = `junai.profilePrompted.${targetFolder}`;
    await context.workspaceState.update(storageKey, true);
}

async function promptProfileSelectionAfterInit(
    context: vscode.ExtensionContext,
    targetFolder: string
): Promise<void> {
    const storageKey = `junai.profilePrompted.${targetFolder}`;
    if (context.workspaceState.get<boolean>(storageKey)) { return; }

    const projectConfigPath = path.join(targetFolder, '.github', 'project-config.md');
    if (!fs.existsSync(projectConfigPath)) { return; }

    const raw = fs.readFileSync(projectConfigPath, 'utf8');
    const profiles = extractProfileNames(raw);
    if (profiles.length === 0) { return; }
    if (currentProfileValue(raw).length > 0) {
        await context.workspaceState.update(storageKey, true);
        return;
    }

    const choice = await vscode.window.showInformationMessage(
        'junai: Select a predefined profile now? This pre-fills project context for all agents.',
        'Select Profile',
        'Later'
    );
    if (choice === 'Select Profile') {
        await cmdSelectProfile(context, { targetFolder });
    } else {
        await context.workspaceState.update(storageKey, true);
    }
}

async function pickTargetFolder(): Promise<string | null> {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
        vscode.window.showErrorMessage('junai: No workspace folder open. Open a project folder first.');
        return null;
    }

    if (workspaceFolders.length === 1) {
        return workspaceFolders[0].uri.fsPath;
    }

    const picked = await vscode.window.showQuickPick(
        workspaceFolders.map((f) => ({
            label: f.name,
            description: f.uri.fsPath,
            fsPath: f.uri.fsPath,
        })),
        { placeHolder: 'Select workspace folder' }
    );
    if (!picked) { return null; }
    return picked.fsPath;
}

function extractProfileNames(markdown: string): string[] {
    const sanitized = markdown.replace(/<!--[\s\S]*?-->/g, '');
    const matches = sanitized.matchAll(/^###\s+([a-z0-9][a-z0-9-]*)\s*$/gim);
    const names = Array.from(matches, (m) => m[1].trim());
    return [...new Set(names)];
}

function currentProfileValue(markdown: string): string {
    const row = markdown.match(/^\|\s*\*\*profile\*\*\s*\|\s*(.*?)\s*\|\s*$/im);
    if (!row || row.length < 2) { return ''; }
    return row[1].replace(/`/g, '').trim();
}

function setProfileValue(markdown: string, profile: string): string {
    const formatted = profile ? `\`${profile}\`` : '``';
    return markdown.replace(
        /^\|\s*\*\*profile\*\*\s*\|\s*.*?\s*\|\s*$/im,
        `| **profile** | ${formatted} |`
    );
}

// Backup project-config.md to project-config.bak.<timestamp>.md before an interactive overwrite.
// Returns true if a backup was written, false if the source did not exist.
function backupProjectConfig(githubDir: string): boolean {
    const src = path.join(githubDir, 'project-config.md');
    if (!fs.existsSync(src)) { return false; }
    const ts   = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const dest = path.join(githubDir, `project-config.bak.${ts}.md`);
    fs.copyFileSync(src, dest);
    return true;
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
    } runtime folders, .claude runtime folders, .codex runtime folder

    const confirmed = await vscode.window.showWarningMessage(
        'This will delete the junai agent pool (.github runtime folders, .claude runtime folders, .codex runtime folders, pipeline-state.json) and remove the MCP entry from .vscode/mcp.json. Your own code and commits are NOT affected.',
        { modal: true },
        'Remove junai from this project',
        'Cancel',
    );
    if (confirmed !== 'Remove junai from this proCOPILOT_RUNTIME_DIR);
    const claudeDir    = path.join(targetFolder, CLAUDE_RUNTIME_DIR);
    const codexDir     = path.join(targetFolder, CODEX_RUNTIME_DIR);

    // Pool directories installed by init
    const poolDirs = [
        'agents', 'skills', 'prompts', 'instructions',
        'agent-docs', 'plans', 'handoffs', 'tools', 'diagrams',
    ];
    for (const dir of poolDirs) {
        const p = path.join(githubDir, dir);
        if (fs.existsSync(p)) { fs.rmSync(p, { recursive: true, force: true }); }
    }

    for (const dir of ['agents', 'skills', 'rules']) {
        const p = path.join(claudeDir, dir);
        if (fs.existsSync(p)) { fs.rmSync(p, { recursive: true, force: true }); }
    }

    const codexSkills = path.join(codexDir, 'skills');
    if (fs.existsSync(codexSkills)) { fs.rmSync(codexSkills, { recursive: true, force: true }); }

    // Root files installed by init (except copilot-instructions.md — only strip managed section)
    for (const file of ['pipeline-state.json', 'project-config.md', '.junai-pool-version']) {
        const p = path.join(githubDir, file);
        if (fs.existsSync(p)) { fs.rmSync(p, { force: true }); }
    }
    removeCopilotInstructionsSection(githubDir);
    removeDirIfEmpty(claudeDir);
    removeDirIfEmpty(codex'rules']) {
        const p = path.join(claudeDir, dir);
        if (fs.existsSync(p)) { fs.rmSync(p, { recursive: true, force: true }); }
    }

    const codexSkills = path.join(codexDir, 'skills');
    if (fs.existsSync(codexSkills)) { fs.rmSync(codexSkills, { recursive: true, force: true }); }

    // Root files installed by init (except copilot-instructions.md — only strip managed section)
    for (const file of ['pipeline-state.json', 'project-config.md', '.junai-pool-version']) {
        const p = path.join(githubDir, file);
        if (fs.existsSync(p)) { fs.rmSync(p, { force: true }); }
    }
    removeCopilotInstructionsSection(githubDir);
    removeDirIfEmpty(claudeDir);
    removeDirIfEmpty(codexDir);

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
COPILOT_RUNTIME_DIR);
    const claudeDir = path.join(workspaceFolders[0].uri.fsPath, CLAUDE_RUNTIME_DIR);
    const codexDir  = path.join(workspaceFolders[0].uri.fsPath, CODEX_RUNTIME_DIR
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

    const githubDir = path.join(workspaceFolders[0].uri.fsPath, COPILOT_RUNTIME_DIR);
    const claudeDir = path.join(workspaceFolders[0].uri.fsPath, CLAUDE_RUNTIME_DIR);
    const codexDir  = path.join(workspaceFolders[0].uri.fsPath, CODEX_RUNTIME_DIR);
    const agentsDir = path.join(githubDir, 'agents');
    if (!fs.existsSync(agentsDir)) {
        if (!silent) { vscode.window.showErrorMessage('junai: Pipeline not initialized in this project. Run Initialize first.'); }
        return;
    }

    if (!silent) {
        const confirmed = await vscode.window.showInformationMessage(
            'Update agent pool with latest files from this extension version? ' +
            'Your copilot-instructions.md content is preserved (only the junai section is refreshed).',
            { modal: true },
            'Update',
            'Cancel',
        );
        if (const runtimes: RuntimeBundleSpec[] = [
                {
                    poolRoot: path.join(poolDir, COPILOT_RUNTIME_DIR),
                    workspaceRoot: githubDir,
                    cleanDirs: ['agents', 'skills', 'prompts', 'instructions', 'tools', 'diagrams'],
                    mergeDirs: ['agent-docs', 'plans', 'handoffs'],
                    rootFiles: ['project-config.md'],
                    userOwnedFiles: USER_OWNED,
                },
                {
                    poolRoot: path.join(poolDir, CLAUDE_RUNTIME_DIR),
                    workspaceRoot: claudeDir,
                    cleanDirs: ['agents', 'skills', 'rules'],
                    mergeDirs: [],
                    rootFiles: [],
                    userOwnedFiles: new Set(),
                },
                {
                    poolRoot: path.join(poolDir, CODEX_RUNTIME_DIR),
                    workspaceRoot: codexDir,
                    cleanDirs: ['skills'],
                    mergeDirs: [],
                    rootFiles: [],
                    userOwnedFiles: new Set(),
                },
            ];

            for (const runtime of runtimes) {
                const counts = updateRuntimeBundle(runtime
                },
                {
                    poolRoot: path.join(poolDir, CLAUDE_RUNTIME_DIR),
                    workspaceRoot: claudeDir,
                    cleanDirs: ['agents', 'skills', 'rules'],
                    mergeDirs: [],
                    rootFiles: [],
                    userOwnedFiles: new Set(),
                },
                {
                    poolRoot: path.join(poolDir, CODEX_RUNTIME_DIR),
                    workspaceRoot: codexDir,
                    cleanDirs: ['skills'],
                    mergeDirs: [],
                    rootFiles: [],
                    userOwnedFiles: new Set(),
                },
            ];

            for (const runtime of runtimes) {
                const counts = updateRuntimeBundle(runtime);
                updated += counts.updated;
                skipped += counts.skipped;
            }

            // Refresh only the managed section in copilot-instructions.md
            ensureCopilotInstructionsSection(githubDir);

            // Write pool version marker so activation check knows workspace is current
            writeWorkspacePoolVersion(context, githubDir);

            // Apply workspace settings fixes (idempotent — only sets if not already present)
            scaffoldMcpConfig(workspaceFolders[0].uri.fsPath);
            scaffoldVscodeSettings(workspaceFolders[0].uri.fsPath);

type RuntimeBundleSpec = {
    poolRoot: string;
    workspaceRoot: string;
    cleanDirs: string[];
    mergeDirs: string[];
    rootFiles: string[];
    userOwnedFiles: Set<string>;
};

function installRuntimeBundles(poolDir: string, targetFolder: string): void {
    const runtimes = [
        { poolRoot: path.join(poolDir, COPILOT_RUNTIME_DIR), workspaceRoot: path.join(targetFolder, COPILOT_RUNTIME_DIR) },
        { poolRoot: path.join(poolDir, CLAUDE_RUNTIME_DIR), workspaceRoot: path.join(targetFolder, CLAUDE_RUNTIME_DIR) },
        { poolRoot: path.join(poolDir, CODEX_RUNTIME_DIR), workspaceRoot: path.join(targetFolder, CODEX_RUNTIME_DIR) },
    ];

    for (const runtime of runtimes) {
        if (!fs.existsSync(runtime.poolRoot)) { continue; }
        copyDirSync(runtime.poolRoot, runtime.workspaceRoot);
    }
}

function updateRuntimeBundle(spec: RuntimeBundleSpec): { updated: number; skipped: number } {
    let updated = 0;
    let skipped = 0;
    if (!fs.existsSync(spec.poolRoot)) { return { updated, skipped }; }

    for (const dir of [...spec.cleanDirs, ...spec.mergeDirs]) {
        const nested = path.join(spec.workspaceRoot, dir, dir);
        if (fs.existsSync(nested)) {
            fs.rmSync(nested, { recursive: true, force: true });
        }
    }

    for (const dir of spec.cleanDirs) {
        const src = path.join(spec.poolRoot, dir);
        const dest = path.join(spec.workspaceRoot, dir);
        if (!fs.existsSync(src)) { continue; }
        if (fs.existsSync(dest)) {
            fs.rmSync(dest, { recursive: true, force: true });
        }
        const counts = mergeDirSync(src, dest, spec.userOwnedFiles);
        updated += counts.updated;
        skipped += counts.skipped;
    }

    for (const dir of spec.mergeDirs) {
        const src = path.join(spec.poolRoot, dir);
        const dest = path.join(spec.workspaceRoot, dir);
        if (!fs.existsSync(src)) { continue; }
        const counts = mergeDirSync(src, dest, spec.userOwnedFiles);
        updated += counts.updated;
        skipped += counts.skipped;
    }

    for (const file of spec.rootFiles) {
        const src = path.join(spec.poolRoot, file);
        const dest = path.join(spec.workspaceRoot, file);
        if (!fs.existsSync(src)) { continue; }
        fs.mkdirSync(spec.workspaceRoot, { recursive: true });
        if (spec.userOwnedFiles.has(file) && fs.existsSync(dest)) {
            skipped++;
            continue;
        }
        fs.copyFileSync(src, dest);
        updated++;
    }

    return { updated, skipped };
}

function removeDirIfEmpty(dirPath: string): void {
    if (!fs.existsSync(dirPath)) { return; }
    if (fs.readdirSync(dirPath).length === 0) {
        fs.rmSync(dirPath, { recursive: true, force: true });
    }
}
            // Auto-commit pool files so they never appear as uncommitted noise in the user's working tree
            progress.report({ message: 'Committing pool update…' });
            git.result = gitCommitPoolUpdate(workspaceFolders[0].uri.fsPath, readBundledPoolVersion(context) ?? undefined);

            progress.report({ message: 'Done.' });
        }
    );

    const poolVer = readBundledPoolVersion(context) ?? 'latest';
    let msg = silent
        ? `junai: Agent pool auto-updated to v${poolVer} — ${updated} files refreshed.`
        : `✅ junai pool updated — ${updated} files refreshed, ${skipped} user-owned files preserved.`;
    if (git.result === 'committed')               { msg += ' Pool changes committed to git.'; }
    else if (git.result === 'skipped-in-progress') { msg += ' (git commit skipped — repo has an in-progress operation; commit manually)'; }
    else if (git.result === 'skipped-detached')    { msg += ' (git commit skipped — detached HEAD)'; }
    else if (git.result === 'error')               { msg += ' (git commit failed — commit manually if needed)'; }
    // 'nothing-to-commit' and 'skipped-no-repo' are silent (no message suffix)
    vscode.window.showInformationMessage(msg);
}
// ─────────────────────────────────────────────────────────────
const SKIP = new Set(['.git', 'node_modules', '__pycache__', '.DS_Store']);
type RuntimeBundleSpec = {
    poolRoot: string;
    workspaceRoot: string;
    cleanDirs: string[];
    mergeDirs: string[];
    rootFiles: string[];
    userOwnedFiles: Set<string>;
};

function installRuntimeBundles(poolDir: string, targetFolder: string): void {
    const runtimes = [
        { poolRoot: path.join(poolDir, COPILOT_RUNTIME_DIR), workspaceRoot: path.join(targetFolder, COPILOT_RUNTIME_DIR) },
        { poolRoot: path.join(poolDir, CLAUDE_RUNTIME_DIR), workspaceRoot: path.join(targetFolder, CLAUDE_RUNTIME_DIR) },
        { poolRoot: path.join(poolDir, CODEX_RUNTIME_DIR), workspaceRoot: path.join(targetFolder, CODEX_RUNTIME_DIR) },
    ];

    for (const runtime of runtimes) {
        if (!fs.existsSync(runtime.poolRoot)) { continue; }
        copyDirSync(runtime.poolRoot, runtime.workspaceRoot);
    }
}

function updateRuntimeBundle(spec: RuntimeBundleSpec): { updated: number; skipped: number } {
    let updated = 0;
    let skipped = 0;
    if (!fs.existsSync(spec.poolRoot)) { return { updated, skipped }; }

    for (const dir of [...spec.cleanDirs, ...spec.mergeDirs]) {
        const nested = path.join(spec.workspaceRoot, dir, dir);
        if (fs.existsSync(nested)) {
            fs.rmSync(nested, { recursive: true, force: true });
        }
    }

    for (const dir of spec.cleanDirs) {
        const src = path.join(spec.poolRoot, dir);
        const dest = path.join(spec.workspaceRoot, dir);
        if (!fs.existsSync(src)) { continue; }
        if (fs.existsSync(dest)) {
            fs.rmSync(dest, { recursive: true, force: true });
        }
        const counts = mergeDirSync(src, dest, spec.userOwnedFiles);
        updated += counts.updated;
        skipped += counts.skipped;
    }

    for (const dir of spec.mergeDirs) {
        const src = path.join(spec.poolRoot, dir);
        const dest = path.join(spec.workspaceRoot, dir);
        if (!fs.existsSync(src)) { continue; }
        const counts = mergeDirSync(src, dest, spec.userOwnedFiles);
        updated += counts.updated;
        skipped += counts.skipped;
    }

    for (const file of spec.rootFiles) {
        const src = path.join(spec.poolRoot, file);
        const dest = path.join(spec.workspaceRoot, file);
        if (!fs.existsSync(src)) { continue; }
        fs.mkdirSync(spec.workspaceRoot, { recursive: true });
        if (spec.userOwnedFiles.has(file) && fs.existsSync(dest)) {
            skipped++;
            continue;
        }
        fs.copyFileSync(src, dest);
        updated++;
    }

    return { updated, skipped };
}

function removeDirIfEmpty(dirPath: string): void {
    if (!fs.existsSync(dirPath)) { return; }
    if (fs.readdirSync(dirPath).length === 0) {
        fs.rmSync(dirPath, { recursive: true, force: true });
    }
}

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
    // Guard: skip any subfolder whose name matches its immediate parent
    // (e.g. skills/skills, prompts/prompts — accidental nesting from errant syncs)
    const parentName = path.basename(dest);
    for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
        if (SKIP.has(entry.name)) { continue; }
        if (entry.isDirectory() && entry.name === parentName) { continue; }
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
        // Use `uv run` with the PEP 723 inline script header in server.py.
        // uv reads the `# dependencies = ["fastmcp"]` comment and auto-creates an isolated
        // environment on first run — no manual pip install or per-project venv needed.
        // Users only need `uv` installed once globally (https://docs.astral.sh/uv/).
        // ${workspaceFolder} is resolved by VS Code at MCP startup time.
        config.servers['junai'] = {
            type: 'stdio',
            command: 'uv',
            args: ['run', '${workspaceFolder}/.github/tools/mcp-server/server.py'],
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
    channel.appendLine('Paste this output as coCOPILOT_RUNTIME_DIR);
    const claudeDir = path.join(workspaceRoot, CLAUDE_RUNTIME_DIR);
    const codexDir = path.join(workspaceRoot, CODEX_RUNTIME_DIR);
    const relGithub = path.relative(gitRoot, githubDir).split(path.sep).join('/');
    const stagePaths = [
        ...['agents', 'tools', 'skills', 'instructions', 'prompts', 'diagrams', 'handoffs', 'agent-docs', 'plans'].map(d => `${relGithub}/${d}`),
        `${relGithub}/copilot-instructions.md`,
        `${relGithub}/.junai-pool-version`,
    ];

    if (fs.existsSync(claudeDir)) {
        const relClaude = path.relative(gitRoot, claudeDir).split(path.sep).join('/');
        stagePaths.push(`${relClaude}/agents`, `${relClaude}/skills`, `${relClaude}/rules`);
    }
    if (fs.existsSync(codexDir)) {
        const relCodex = path.relative(gitRoot, codexDir).split(path.sep).join('/');
        stagePaths.push(`${relCodex}/skills`);
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

    // Pool files are bundled with the extension — always auto-update silently.
    // No user action required for either a fresh stamp (null) or an older stamp.
    vscode.commands.executeCommand('junai.update', { silent: true });
}

// ─────────────────────────────────────────────────────────────
// Auto-commit pool update to git after cmdUpdate writes pool files.
// Returns a status so the caller can surface appropriate messaging.
// Edge cases handled:
//   • git not installed / not a git repo  → 'skipped-no-repo'
//   • in-progress operation (rebase/merge/cherry-pick/bisect) → 'skipped-in-progress'
//   • detached HEAD                        → 'skipped-detached'
//   • no actual changes staged             → 'nothing-to-commit'
//   • missing author identity              → retry with embedded identity
//   • workspace nested inside git root     → uses `git rev-parse --show-toplevel`
//   • Windows path separators             → args array (no shell, no injection risk)
// ─────────────────────────────────────────────────────────────
type GitCommitResult = 'committed' | 'nothing-to-commit' | 'skipped-no-repo' | 'skipped-in-progress' | 'skipped-detached' | 'error';

function gitCommitPoolUpdate(workspaceRoot: string, poolVersion: string | undefined): GitCommitResult {
    const label = poolVersion ? `v${poolVersion}` : 'latest';

    function run(args: string[], cwd: string, extraEnv?: Record<string, string>): { ok: boolean; out: string } {
        const env = extraEnv ? { ...process.env, ...extraEnv } : undefined;
        const r = spawnSync('git', args, { cwd, encoding: 'utf8', env });
        return { ok: r.status === 0 && !r.error, out: ((r.stdout as string) ?? '').trim() };
    }

    // 1. Verify git is available and the workspace is inside a git repo
    if (!run(['rev-parse', '--git-dir'], workspaceRoot).ok) { return 'skipped-no-repo'; }

    // 2. Locate .git dir and check for in-progress operations
    const gitDirResult = run(['rev-parse', '--git-dir'], workspaceRoot);
    const gitDir = path.isAbsolute(gitDirResult.out)
        ? gitDirResult.out
        : path.join(workspaceRoot, gitDirResult.out);

    const inProgressMarkers = ['rebase-merge', 'rebase-apply', 'MERGE_HEAD', 'CHERRY_PICK_HEAD', 'BISECT_LOG'];
    if (inProgressMarkers.some(m => fs.existsSync(path.join(gitDir, m)))) {
        return 'skipped-in-progress';
    }

    // 3. Guard: detached HEAD (commit would create an unreachable commit)
    if (!run(['symbolic-ref', 'HEAD'], workspaceRoot).ok) { return 'skipped-detached'; }

    // 4. Use git root (workspace folder may be nested inside the repo)
    const rootResult = run(['rev-parse', '--show-toplevel'], workspaceRoot);
    if (!rootResult.ok) { return 'skipped-no-repo'; }
    const gitRoot = rootResult.out;

    // 5. Stage pool dirs using paths relative to git root
    //    Uses args array (not shell string) — safe from injection and Windows path issues
    const githubDir = path.join(workspaceRoot, COPILOT_RUNTIME_DIR);
    const claudeDir = path.join(workspaceRoot, CLAUDE_RUNTIME_DIR);
    const codexDir = path.join(workspaceRoot, CODEX_RUNTIME_DIR);
    const relGithub = path.relative(gitRoot, githubDir).split(path.sep).join('/');
    const stagePaths = [
        ...['agents', 'tools', 'skills', 'instructions', 'prompts', 'diagrams', 'handoffs', 'agent-docs', 'plans'].map(d => `${relGithub}/${d}`),
        `${relGithub}/copilot-instructions.md`,
        `${relGithub}/.junai-pool-version`,
    ];

    if (fs.existsSync(claudeDir)) {
        const relClaude = path.relative(gitRoot, claudeDir).split(path.sep).join('/');
        stagePaths.push(`${relClaude}/agents`, `${relClaude}/skills`, `${relClaude}/rules`);
    }
    if (fs.existsSync(codexDir)) {
        const relCodex = path.relative(gitRoot, codexDir).split(path.sep).join('/');
        stagePaths.push(`${relCodex}/skills`);
    }
    run(['add', '--', ...stagePaths], gitRoot);

    // 6. Check whether anything was actually staged (exit 0 = no changes)
    if (run(['diff', '--cached', '--quiet'], gitRoot).ok) { return 'nothing-to-commit'; }

    // 7. Commit — try repo identity first, fall back to embedded author if unconfigured
    const commitMsg = `chore(junai): update pool to ${label}`;
    const commitArgs = ['commit', '-m', commitMsg];
    if (run(commitArgs, gitRoot).ok) { return 'committed'; }

    // Retry: user has no global git author configured (common on fresh machines)
    const fallbackEnv = { GIT_AUTHOR_NAME: 'junai', GIT_AUTHOR_EMAIL: 'junai-bot@localhost', GIT_COMMITTER_NAME: 'junai', GIT_COMMITTER_EMAIL: 'junai-bot@localhost' };
    return run(commitArgs, gitRoot, fallbackEnv).ok ? 'committed' : 'error';
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
