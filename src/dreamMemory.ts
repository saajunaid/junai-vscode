import * as vscode from 'vscode';
import type { JunaiEventBus } from './eventBus';
import {
    createDreamMemoryEngine,
    readDreamMemorySummary as readDreamMemorySummaryCore,
    type DreamCoordinatorRun,
    type DreamMemorySummary,
    type MemoryConsolidationResult,
} from 'fann-core';

export type {
    DreamCoordinatorRun,
    DreamMemorySummary,
    DreamWorkerResult,
    MemoryConflict,
    MemoryConsolidationResult,
    MemoryFactRecord,
    MemorySignalKind,
} from 'fann-core';

export class DreamMemoryService implements vscode.Disposable {
    private readonly engine;

    constructor(
        workspaceRoot: string,
        eventBus: JunaiEventBus,
        private readonly outputChannel?: vscode.OutputChannel,
    ) {
        this.engine = createDreamMemoryEngine({
            workspaceRoot,
            eventBus,
            onLog: (message: string) => {
                if (!this.outputChannel) {
                    return;
                }
                this.outputChannel.appendLine(message);
            },
        });
    }

    recordCoordinatorRun(run: DreamCoordinatorRun): MemoryConsolidationResult | null {
        return this.engine.recordCoordinatorRun(run);
    }

    dispose(): void {
        this.engine.dispose();
    }
}

export function createDreamMemoryService(
    workspaceRoot: string,
    eventBus: JunaiEventBus,
    outputChannel?: vscode.OutputChannel,
): DreamMemoryService {
    return new DreamMemoryService(workspaceRoot, eventBus, outputChannel);
}

export function readDreamMemorySummary(workspaceRoot: string): DreamMemorySummary | null {
    return readDreamMemorySummaryCore(workspaceRoot);
}
