import {
    coordinate as coordinateCore,
    executeWorker,
    synthesizeFindings,
    synthesizeResults,
    type CoordinationRequest,
    type CoordinationResult,
    type CoordinatorFinding,
    type CoordinatorSynthesisResult,
    type CoordinatorTaskSpec,
    type TaskNode,
    type TaskResult,
    type TaskStatus,
    type WorkerSpec,
    type WorkerType,
    TaskGraph,
} from 'fann-core';
import { requireFeature } from './featureFlags';

export {
    executeWorker,
    synthesizeFindings,
    synthesizeResults,
    TaskGraph,
    type CoordinationRequest,
    type CoordinationResult,
    type CoordinatorFinding,
    type CoordinatorSynthesisResult,
    type CoordinatorTaskSpec,
    type TaskNode,
    type TaskResult,
    type TaskStatus,
    type WorkerSpec,
    type WorkerType,
};

/**
 * Backward-compatible wrapper preserving existing feature-gated behavior.
 */
export async function coordinate(
    request: CoordinationRequest,
    workspaceRoot: string,
): Promise<CoordinationResult> {
    requireFeature('coordinator');
    return coordinateCore(request, workspaceRoot);
}
