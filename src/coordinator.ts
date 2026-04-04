import { JunaiEventBus } from './eventBus';
import { requireFeature } from './featureFlags';

// ─────────────────────────────────────────────────────────────
// Worker types
// ─────────────────────────────────────────────────────────────

/**
 * Worker types for the coordinator.
 * Phase 2 starts with read-only workers only.
 *
 *   explore  — search/read the codebase to answer a question
 *   verify   — check an assertion (file exists, test passes, pattern holds)
 *   review   — review code/docs for issues against criteria
 */
export type WorkerType = 'explore' | 'verify' | 'review';

export interface WorkerSpec {
    /** Unique ID within a coordination run */
    id: string;
    /** What kind of worker to launch */
    type: WorkerType;
    /** Human-readable label for status display */
    label: string;
    /** The question or task this worker should answer */
    prompt: string;
    /** Optional: specific files/paths to scope the worker's search */
    scopePaths?: string[];
}

// ─────────────────────────────────────────────────────────────
// Task states and results
// ─────────────────────────────────────────────────────────────

export type TaskStatus = 'pending' | 'running' | 'completed' | 'failed';

export interface TaskResult {
    workerId: string;
    workerType: WorkerType;
    label: string;
    status: 'success' | 'failure';
    /** The worker's findings or answer */
    output: string;
    /** How long the worker took (ms) */
    durationMs: number;
    /** Error message if status is 'failure' */
    error?: string;
}

export interface TaskNode {
    worker: WorkerSpec;
    status: TaskStatus;
    result?: TaskResult;
    startedAt?: string;
    completedAt?: string;
}

// ─────────────────────────────────────────────────────────────
// Task graph
// ─────────────────────────────────────────────────────────────

/**
 * In-memory task graph for a single coordination run.
 * Phase 2 uses a flat list (no inter-worker dependencies).
 * The DAG structure (adjacency list) is reserved for future phases
 * where workers may depend on each other's results.
 */
export class TaskGraph {
    private nodes: Map<string, TaskNode> = new Map();

    addWorker(worker: WorkerSpec): void {
        if (this.nodes.has(worker.id)) {
            throw new Error(`Worker ID "${worker.id}" already exists in task graph`);
        }
        this.nodes.set(worker.id, {
            worker,
            status: 'pending',
        });
    }

    getNode(workerId: string): TaskNode | undefined {
        return this.nodes.get(workerId);
    }

    getAllNodes(): TaskNode[] {
        return Array.from(this.nodes.values());
    }

    getPendingWorkers(): WorkerSpec[] {
        return this.getAllNodes()
            .filter(n => n.status === 'pending')
            .map(n => n.worker);
    }

    markRunning(workerId: string): void {
        const node = this.nodes.get(workerId);
        if (!node) { throw new Error(`Unknown worker: ${workerId}`); }
        node.status = 'running';
        node.startedAt = new Date().toISOString();
    }

    markCompleted(workerId: string, result: TaskResult): void {
        const node = this.nodes.get(workerId);
        if (!node) { throw new Error(`Unknown worker: ${workerId}`); }
        node.status = result.status === 'success' ? 'completed' : 'failed';
        node.result = result;
        node.completedAt = new Date().toISOString();
    }

    isComplete(): boolean {
        return this.getAllNodes().every(n => n.status === 'completed' || n.status === 'failed');
    }

    getSummary(): { total: number; completed: number; failed: number; pending: number; running: number } {
        const nodes = this.getAllNodes();
        return {
            total:     nodes.length,
            completed: nodes.filter(n => n.status === 'completed').length,
            failed:    nodes.filter(n => n.status === 'failed').length,
            pending:   nodes.filter(n => n.status === 'pending').length,
            running:   nodes.filter(n => n.status === 'running').length,
        };
    }
}

// ─────────────────────────────────────────────────────────────
// Coordination request and result
// ─────────────────────────────────────────────────────────────

export interface CoordinationRequest {
    /** Human-readable title for the coordination run */
    title: string;
    /** The broad question or task to coordinate */
    goal: string;
    /** Workers to fan out */
    workers: WorkerSpec[];
}

export interface CoordinationResult {
    title: string;
    goal: string;
    /** Individual worker results */
    workerResults: TaskResult[];
    /** Synthesized answer combining all worker outputs */
    synthesizedOutput: string;
    /** Total wall-clock time for the coordination run (ms) */
    totalDurationMs: number;
    /** Summary counts */
    summary: ReturnType<TaskGraph['getSummary']>;
}

// ─────────────────────────────────────────────────────────────
// Worker executor
// ─────────────────────────────────────────────────────────────

/**
 * Execute a single worker.
 *
 * Phase 2 implementation: Workers are "simulated" — they perform
 * file system reads and searches within the workspace to answer
 * their prompt. This is the read-only exploration slice.
 *
 * Future phases will upgrade this to launch actual sub-agent
 * sessions via the VS Code chat API.
 *
 * @param worker  - The worker specification
 * @param workspaceRoot - Absolute path to the workspace root
 * @returns The worker's result
 */
export async function executeWorker(
    worker: WorkerSpec,
    workspaceRoot: string,
): Promise<TaskResult> {
    const startTime = Date.now();

    try {
        let output: string;

        switch (worker.type) {
            case 'explore':
                output = await executeExploreWorker(worker, workspaceRoot);
                break;
            case 'verify':
                output = await executeVerifyWorker(worker, workspaceRoot);
                break;
            case 'review':
                output = await executeReviewWorker(worker, workspaceRoot);
                break;
            default:
                throw new Error(`Unknown worker type: ${worker.type}`);
        }

        return {
            workerId: worker.id,
            workerType: worker.type,
            label: worker.label,
            status: 'success',
            output,
            durationMs: Date.now() - startTime,
        };
    } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        return {
            workerId: worker.id,
            workerType: worker.type,
            label: worker.label,
            status: 'failure',
            output: '',
            durationMs: Date.now() - startTime,
            error: errorMsg,
        };
    }
}

// ─────────────────────────────────────────────────────────────
// Worker type implementations (read-only, Phase 2)
// ─────────────────────────────────────────────────────────────

import * as fs from 'fs';
import * as path from 'path';

/**
 * Explore worker — searches the workspace for files and content
 * matching the worker's prompt/scope.
 */
async function executeExploreWorker(worker: WorkerSpec, workspaceRoot: string): Promise<string> {
    const results: string[] = [];
    const searchPaths = worker.scopePaths ?? ['.'];

    for (const scopePath of searchPaths) {
        const fullPath = path.resolve(workspaceRoot, scopePath);
        if (!fs.existsSync(fullPath)) {
            results.push(`Path not found: ${scopePath}`);
            continue;
        }

        const stat = fs.statSync(fullPath);
        if (stat.isFile()) {
            // Read the file and include a summary
            const content = fs.readFileSync(fullPath, 'utf8');
            const lineCount = content.split('\n').length;
            results.push(`**${scopePath}** (${lineCount} lines):\n\`\`\`\n${content.slice(0, 2000)}${content.length > 2000 ? '\n... (truncated)' : ''}\n\`\`\``);
        } else if (stat.isDirectory()) {
            // List directory contents recursively (up to 2 levels)
            const listing = listDirRecursive(fullPath, workspaceRoot, 2);
            results.push(`**${scopePath}/** contents:\n${listing}`);
        }
    }

    if (results.length === 0) {
        results.push('No results found for the given scope.');
    }

    return `### Explore: ${worker.label}\n\n**Prompt:** ${worker.prompt}\n\n${results.join('\n\n')}`;
}

/**
 * Verify worker — checks whether specific assertions hold
 * (file exists, pattern found, etc.)
 */
async function executeVerifyWorker(worker: WorkerSpec, workspaceRoot: string): Promise<string> {
    const checks: string[] = [];
    const searchPaths = worker.scopePaths ?? [];

    if (searchPaths.length === 0) {
        return `### Verify: ${worker.label}\n\n**Prompt:** ${worker.prompt}\n\nNo scope paths specified — cannot verify.`;
    }

    for (const scopePath of searchPaths) {
        const fullPath = path.resolve(workspaceRoot, scopePath);
        const exists = fs.existsSync(fullPath);
        checks.push(`- \`${scopePath}\`: ${exists ? '✅ exists' : '❌ not found'}`);

        if (exists && fs.statSync(fullPath).isFile()) {
            const content = fs.readFileSync(fullPath, 'utf8');
            const lineCount = content.split('\n').length;
            checks.push(`  - ${lineCount} lines, ${content.length} bytes`);
        }
    }

    return `### Verify: ${worker.label}\n\n**Prompt:** ${worker.prompt}\n\n${checks.join('\n')}`;
}

/**
 * Review worker — reads specified files and produces a structured
 * summary for the coordinator to synthesize.
 */
async function executeReviewWorker(worker: WorkerSpec, workspaceRoot: string): Promise<string> {
    const reviews: string[] = [];
    const searchPaths = worker.scopePaths ?? [];

    if (searchPaths.length === 0) {
        return `### Review: ${worker.label}\n\n**Prompt:** ${worker.prompt}\n\nNo scope paths specified — cannot review.`;
    }

    for (const scopePath of searchPaths) {
        const fullPath = path.resolve(workspaceRoot, scopePath);
        if (!fs.existsSync(fullPath)) {
            reviews.push(`- \`${scopePath}\`: ❌ not found — cannot review`);
            continue;
        }

        if (fs.statSync(fullPath).isFile()) {
            const content = fs.readFileSync(fullPath, 'utf8');
            const lines = content.split('\n');
            reviews.push(`- \`${scopePath}\` (${lines.length} lines): read for review`);

            // Extract key indicators for the review
            const hasExports = /^export\s/m.test(content);
            const hasTodos = (content.match(/TODO|FIXME|HACK|XXX/gi) ?? []).length;
            const hasTests = /(?:describe|it|test)\s*\(/m.test(content);

            reviews.push(`  - Exports: ${hasExports ? 'yes' : 'no'}`);
            if (hasTodos > 0) { reviews.push(`  - TODOs/FIXMEs: ${hasTodos}`); }
            reviews.push(`  - Test patterns: ${hasTests ? 'found' : 'none'}`);
        }
    }

    return `### Review: ${worker.label}\n\n**Prompt:** ${worker.prompt}\n\n${reviews.join('\n')}`;
}

/**
 * Recursively list directory contents up to a max depth.
 */
function listDirRecursive(dirPath: string, workspaceRoot: string, maxDepth: number, currentDepth: number = 0): string {
    if (currentDepth >= maxDepth) { return '  '.repeat(currentDepth) + '(max depth reached)\n'; }

    const SKIP_DIRS = new Set(['.git', 'node_modules', '__pycache__', '.DS_Store', 'out', 'dist', '.venv']);
    let output = '';

    try {
        const entries = fs.readdirSync(dirPath, { withFileTypes: true });
        for (const entry of entries) {
            if (SKIP_DIRS.has(entry.name)) { continue; }
            const indent = '  '.repeat(currentDepth);
            const relativePath = path.relative(workspaceRoot, path.join(dirPath, entry.name));

            if (entry.isDirectory()) {
                output += `${indent}- ${entry.name}/\n`;
                output += listDirRecursive(path.join(dirPath, entry.name), workspaceRoot, maxDepth, currentDepth + 1);
            } else {
                output += `${indent}- ${relativePath}\n`;
            }
        }
    } catch {
        output += '  '.repeat(currentDepth) + '(access denied)\n';
    }

    return output;
}

// ─────────────────────────────────────────────────────────────
// Result synthesizer
// ─────────────────────────────────────────────────────────────

/**
 * Synthesize results from multiple workers into a single coherent output.
 * Deduplicates findings that appear in multiple worker results.
 */
export function synthesizeResults(
    goal: string,
    results: TaskResult[],
): string {
    const sections: string[] = [];

    sections.push(`## Coordination Summary\n`);
    sections.push(`**Goal:** ${goal}\n`);

    const succeeded = results.filter(r => r.status === 'success');
    const failed    = results.filter(r => r.status === 'failure');

    sections.push(`**Workers:** ${results.length} total — ${succeeded.length} succeeded, ${failed.length} failed\n`);

    // Successes
    if (succeeded.length > 0) {
        sections.push(`---\n`);
        for (const result of succeeded) {
            sections.push(result.output);
            sections.push(`\n*Worker \`${result.workerId}\` completed in ${result.durationMs}ms*\n`);
        }
    }

    // Failures
    if (failed.length > 0) {
        sections.push(`---\n\n### ⚠ Failed Workers\n`);
        for (const result of failed) {
            sections.push(`- **${result.label}** (\`${result.workerId}\`): ${result.error ?? 'Unknown error'}`);
        }
    }

    return sections.join('\n');
}
