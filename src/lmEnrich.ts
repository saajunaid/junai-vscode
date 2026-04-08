import * as vscode from 'vscode';
import type { DeepPlanRequest, DeepPlanResult, WorkspaceScanResult } from './deepPlan';
import { scanResultToContextLines } from './deepPlan';

/**
 * Attempt to enrich a deep plan using the user's available language model
 * via the vscode.lm API. Returns the enriched markdown or null if no model
 * is available or the user hasn't configured one.
 *
 * This uses whatever model the user already has (Copilot, local, Azure, etc.)
 * — no separate API key required.
 */
export async function enrichPlanWithLM(
    request: DeepPlanRequest,
    result: DeepPlanResult,
    scan: WorkspaceScanResult | undefined,
    baseMarkdown: string,
): Promise<string | null> {
    let models: vscode.LanguageModelChat[];
    try {
        models = await vscode.lm.selectChatModels({ family: 'gpt-4o' });
        if (models.length === 0) {
            models = await vscode.lm.selectChatModels();
        }
    } catch {
        return null; // vscode.lm not available
    }

    if (models.length === 0) {
        return null;
    }

    const model = models[0];

    const contextBlock = scan
        ? scanResultToContextLines(scan).join('\n')
        : 'No workspace scan available.';

    const systemPrompt = [
        'You are a senior software architect reviewing and enriching an implementation plan.',
        'The plan was generated algorithmically from user inputs and a workspace scan.',
        'Your job is to make the plan MORE SPECIFIC and ACTIONABLE for this particular codebase.',
        '',
        'Rules:',
        '- Reference actual files, directories, and technologies detected in the workspace context.',
        '- Add concrete implementation steps that reference the real project structure.',
        '- Flag any risks specific to the detected tech stack.',
        '- Keep the same markdown structure — add detail, do not reorganize.',
        '- Do NOT add generic advice. Every sentence must be grounded in the workspace context.',
        '- If the workspace context is too thin to add value, return the original plan unchanged.',
        '- Keep output concise — enriched plan should be 1.5x original length at most.',
    ].join('\n');

    const userPrompt = [
        '## Workspace Context',
        contextBlock,
        '',
        '## Task',
        `Task: ${request.taskSummary}`,
        `Scope: ${request.scope.join(', ') || 'not specified'}`,
        `Constraints: ${request.constraints.join(', ') || 'none'}`,
        '',
        '## Algorithmic Plan (to enrich)',
        baseMarkdown,
    ].join('\n');

    const messages = [
        vscode.LanguageModelChatMessage.User(`${systemPrompt}\n\n---\n\n${userPrompt}`),
    ];

    try {
        const response = await model.sendRequest(messages, {}, new vscode.CancellationTokenSource().token);

        const chunks: string[] = [];
        for await (const chunk of response.text) {
            chunks.push(chunk);
        }
        const enriched = chunks.join('');

        if (enriched.length > 100) {
            return enriched;
        }
        return null;
    } catch {
        return null; // model refused or errored — fall back to algorithmic plan
    }
}
