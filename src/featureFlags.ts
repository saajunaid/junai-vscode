import * as vscode from 'vscode';
import {
    getExperimentalFeatureManifest as getCoreExperimentalFeatureManifest,
    getExperimentalFeatureStatus as getCoreExperimentalFeatureStatus,
    type ExperimentalFeatureDefinition,
    type ExperimentalFeatureStatus,
    type FeatureFlag,
} from 'fann-core';

const CONFIG_SECTION = 'junai.experimental';

export type {
    ExperimentalFeatureDefinition,
    ExperimentalFeatureStatus,
    FeatureFlag,
};

/**
 * Check whether a specific experimental feature is enabled.
 * Reads from VS Code workspace configuration (user/workspace settings).
 */
export function isFeatureEnabled(flag: FeatureFlag): boolean {
    const config = vscode.workspace.getConfiguration(CONFIG_SECTION);
    return config.get<boolean>(flag, false);
}

/**
 * Get all feature flag states as a snapshot.
 * Useful for logging and status display.
 */
export function getAllFlags(): Record<FeatureFlag, boolean> {
    const config = vscode.workspace.getConfiguration(CONFIG_SECTION);
    return {
        coordinator: config.get<boolean>('coordinator', false),
        dream: config.get<boolean>('dream', false),
        deepPlan: config.get<boolean>('deepPlan', false),
        proactive: config.get<boolean>('proactive', false),
    };
}

export function getExperimentalFeatureManifest(): readonly ExperimentalFeatureDefinition[] {
    return getCoreExperimentalFeatureManifest();
}

export function getExperimentalFeatureStatus(): ExperimentalFeatureStatus[] {
    return getCoreExperimentalFeatureStatus(getAllFlags());
}

/**
 * Guard that throws if a feature is not enabled.
 * Use at the top of command handlers gated behind experimental flags.
 */
export function requireFeature(flag: FeatureFlag): void {
    if (!isFeatureEnabled(flag)) {
        const msg = `This feature requires enabling "junai.experimental.${flag}" in settings.`;
        vscode.window.showWarningMessage(msg);
        throw new Error(msg);
    }
}
