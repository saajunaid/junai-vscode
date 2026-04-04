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
