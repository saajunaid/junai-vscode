import * as vscode from 'vscode';

// ─────────────────────────────────────────────────────────────
// Risk tiers
// ─────────────────────────────────────────────────────────────

export type RiskTier = 'low' | 'medium' | 'high';

export interface ActionClassification {
    action: string;
    tier: RiskTier;
    description: string;
}

/**
 * Static risk classification table.
 * Agents and the autopilot watcher use this to decide behaviour:
 *   low    → proceed silently
 *   medium → proceed but log prominently
 *   high   → require explicit user approval (even in autopilot)
 */
const ACTION_CLASSIFICATIONS: ActionClassification[] = [
    // Low — read-only, reversible, or minimal impact
    { action: 'read_file',           tier: 'low',    description: 'Read a file' },
    { action: 'search_workspace',    tier: 'low',    description: 'Search workspace content' },
    { action: 'git_status',          tier: 'low',    description: 'Check git status' },
    { action: 'run_tests',           tier: 'low',    description: 'Execute test suite' },
    { action: 'lint_check',          tier: 'low',    description: 'Run linter' },

    // Medium — modifies files but is recoverable
    { action: 'edit_file',           tier: 'medium', description: 'Edit a file' },
    { action: 'create_file',         tier: 'medium', description: 'Create a new file' },
    { action: 'git_commit',          tier: 'medium', description: 'Commit staged changes' },
    { action: 'install_dependency',  tier: 'medium', description: 'Install a package dependency' },
    { action: 'run_build',           tier: 'medium', description: 'Run build command' },

    // High — destructive, external, or hard to reverse
    { action: 'delete_file',         tier: 'high',   description: 'Delete a file' },
    { action: 'git_push',            tier: 'high',   description: 'Push commits to remote' },
    { action: 'git_force_push',      tier: 'high',   description: 'Force-push to remote' },
    { action: 'git_reset_hard',      tier: 'high',   description: 'Hard reset git history' },
    { action: 'drop_table',          tier: 'high',   description: 'Drop a database table' },
    { action: 'run_destructive_cmd', tier: 'high',   description: 'Run a potentially destructive shell command' },
    { action: 'publish_package',     tier: 'high',   description: 'Publish a package to registry' },
    { action: 'send_external_msg',   tier: 'high',   description: 'Send message to external service (PR comment, Slack, etc.)' },
];

const classificationMap = new Map(ACTION_CLASSIFICATIONS.map(c => [c.action, c]));

// ─────────────────────────────────────────────────────────────
// Protected paths
// ─────────────────────────────────────────────────────────────

/**
 * Glob patterns for files that should always require explicit approval
 * before modification, regardless of the action's base risk tier.
 * Matched against workspace-relative paths.
 */
const PROTECTED_PATH_PATTERNS: string[] = [
    '.github/pipeline-state.json',
    '.env',
    '.env.*',
    '**/secrets/**',
    '**/credentials/**',
    'package.json',
    'package-lock.json',
    'tsconfig.json',
    '.github/project-config.md',
];

/**
 * Check if a file path matches any protected pattern.
 * Uses simple glob matching (VS Code's minimatch is available via the API).
 */
export function isProtectedPath(relativePath: string): boolean {
    // Normalize separators
    const normalized = relativePath.replace(/\\/g, '/');
    for (const pattern of PROTECTED_PATH_PATTERNS) {
        if (matchGlob(normalized, pattern)) {
            return true;
        }
    }
    return false;
}

/**
 * Simple glob matcher supporting * and ** patterns.
 * For production use, consider importing minimatch — but for the initial
 * set of patterns (no complex negations), this covers the cases.
 */
function matchGlob(filePath: string, pattern: string): boolean {
    // Exact match
    if (filePath === pattern) { return true; }

    // Convert glob to regex
    const regexStr = pattern
        .replace(/\./g, '\\.')
        .replace(/\*\*/g, '⦿')
        .replace(/\*/g, '[^/]*')
        .replace(/⦿/g, '.*');
    return new RegExp(`^${regexStr}$`).test(filePath);
}

// ─────────────────────────────────────────────────────────────
// Permission checks
// ─────────────────────────────────────────────────────────────

export interface PermissionResult {
    allowed: boolean;
    tier: RiskTier;
    reason: string;
    requiresApproval: boolean;
}

/**
 * Evaluate whether an action should be allowed in the current pipeline mode.
 *
 * @param action    - The action identifier (must match a key in ACTION_CLASSIFICATIONS)
 * @param mode      - Current pipeline mode ('supervised' | 'assisted' | 'autopilot')
 * @param filePath  - Optional workspace-relative path for file operations
 *
 * Behaviour by mode:
 *   supervised → everything requires approval (medium + high block, low proceeds)
 *   assisted   → low + medium proceed, high requires approval
 *   autopilot  → low + medium proceed, high requires approval
 *
 * Protected paths escalate any action to high tier.
 */
export function checkPermission(
    action: string,
    mode: string,
    filePath?: string,
): PermissionResult {
    const classification = classificationMap.get(action);
    let tier: RiskTier = classification?.tier ?? 'medium';

    // Escalate if targeting a protected path
    if (filePath && isProtectedPath(filePath)) {
        tier = 'high';
    }

    switch (mode) {
        case 'supervised':
            return {
                allowed: tier === 'low',
                tier,
                reason: tier === 'low'
                    ? 'Low-risk action — proceeding'
                    : `Supervised mode — ${tier}-risk action requires manual approval`,
                requiresApproval: tier !== 'low',
            };

        case 'assisted':
        case 'autopilot':
            return {
                allowed: tier !== 'high',
                tier,
                reason: tier === 'high'
                    ? `High-risk action requires explicit approval even in ${mode} mode`
                    : `${tier}-risk action — proceeding in ${mode} mode`,
                requiresApproval: tier === 'high',
            };

        default:
            // Unknown mode — treat as supervised (safest default)
            return {
                allowed: tier === 'low',
                tier,
                reason: `Unknown mode "${mode}" — defaulting to supervised behaviour`,
                requiresApproval: tier !== 'low',
            };
    }
}

/**
 * Get the classification for a specific action.
 * Returns undefined if the action is not in the static table.
 */
export function getActionClassification(action: string): ActionClassification | undefined {
    return classificationMap.get(action);
}

/**
 * Get all action classifications — useful for status display / documentation.
 */
export function getAllClassifications(): readonly ActionClassification[] {
    return ACTION_CLASSIFICATIONS;
}
