import * as vscode from 'vscode';
import type { JunaiEvent, JunaiEventBus } from './eventBus';
import {
    type ProactiveNotice,
    type ProactivePolicyOptions,
    createProactivePolicyState,
    evaluateProactiveEvent,
} from 'fann-core';

const DEFAULT_STATUS_DURATION_MS = 6_000;
const MAX_NOTICE_MESSAGE_CHARS = 220;

function nowIso(): string {
    return new Date().toISOString();
}

function truncateMessage(value: string, maxChars: number): string {
    if (value.length <= maxChars) {
        return value;
    }
    return `${value.slice(0, maxChars - 1)}…`;
}

function formatSurfaceMessage(notice: ProactiveNotice): string {
    const composed = notice.detail
        ? `${notice.title} — ${notice.detail}`
        : notice.title;
    return truncateMessage(composed, MAX_NOTICE_MESSAGE_CHARS);
}

export class ProactiveAssistantService implements vscode.Disposable {
    private readonly policyState = createProactivePolicyState();
    private readonly statusBarItem: vscode.StatusBarItem;
    private readonly policyOptions?: Partial<ProactivePolicyOptions>;
    private unsubscribe: (() => void) | null = null;
    private statusHideTimer: ReturnType<typeof setTimeout> | undefined;

    constructor(
        private readonly eventBus: JunaiEventBus,
        private readonly outputChannel?: vscode.OutputChannel,
        options?: Partial<ProactivePolicyOptions>,
    ) {
        this.policyOptions = options;
        this.statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 10);
        this.statusBarItem.hide();

        this.unsubscribe = this.eventBus.onAny((event) => {
            this.onEvent(event);
        });

        this.log('KAIROS-lite proactive assistant enabled (low-noise mode).');
    }

    private onEvent(event: JunaiEvent): void {
        const decision = evaluateProactiveEvent(event, this.policyState, this.policyOptions);

        if (!decision.notice || !decision.surface) {
            if (decision.suppressedReason === 'deduped') {
                this.log(`suppressed duplicate notice for event ${event.type}`);
            }
            return;
        }

        const notice = decision.notice;
        const downgradeLabel = decision.downgradedFromPopup
            ? ' (popup cooldown downgrade)'
            : decision.downgradedFromStatus
                ? ' (status cooldown downgrade)'
                : '';
        this.log(`surface=${decision.surface}${downgradeLabel} | ${notice.title}`);

        if (decision.surface === 'popup') {
            this.showPopupNotice(notice);
            return;
        }

        if (decision.surface === 'status') {
            this.showStatusNotice(notice);
            return;
        }

        // surface=log -> intentionally quiet, output channel only
        if (notice.detail) {
            this.log(notice.detail);
        }
    }

    private showPopupNotice(notice: ProactiveNotice): void {
        const message = formatSurfaceMessage(notice);
        if (notice.severity === 'warning' || notice.severity === 'error') {
            void vscode.window.showWarningMessage(message);
            return;
        }

        void vscode.window.showInformationMessage(message);
    }

    private showStatusNotice(notice: ProactiveNotice): void {
        const message = formatSurfaceMessage(notice);
        this.statusBarItem.text = `$(bell) ${truncateMessage(notice.title, 80)}`;
        this.statusBarItem.tooltip = message;
        this.statusBarItem.show();

        if (this.statusHideTimer) {
            clearTimeout(this.statusHideTimer);
        }

        const statusDurationMs = this.policyOptions?.statusDurationMs ?? DEFAULT_STATUS_DURATION_MS;
        this.statusHideTimer = setTimeout(() => {
            this.statusBarItem.hide();
            this.statusHideTimer = undefined;
        }, statusDurationMs);
    }

    private log(message: string): void {
        if (!this.outputChannel) {
            return;
        }
        this.outputChannel.appendLine(`[${nowIso()}] ${message}`);
    }

    dispose(): void {
        if (this.statusHideTimer) {
            clearTimeout(this.statusHideTimer);
            this.statusHideTimer = undefined;
        }

        this.statusBarItem.dispose();

        if (this.unsubscribe) {
            this.unsubscribe();
            this.unsubscribe = null;
        }
    }
}

export function createProactiveAssistantService(
    eventBus: JunaiEventBus,
    outputChannel?: vscode.OutputChannel,
    options?: Partial<ProactivePolicyOptions>,
): ProactiveAssistantService {
    return new ProactiveAssistantService(eventBus, outputChannel, options);
}

export type {
    ProactiveDecision,
    ProactiveNotice,
    ProactiveNoticeKind,
    ProactivePolicyOptions,
    ProactivePolicyState,
    ProactiveSurface,
} from 'fann-core';

export {
    createProactivePolicyState,
    evaluateProactiveEvent,
} from 'fann-core';
