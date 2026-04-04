import { EventEmitter } from 'events';

// ─────────────────────────────────────────────────────────────
// Event types
// ─────────────────────────────────────────────────────────────

export interface PipelineEvent {
    /** ISO 8601 timestamp */
    timestamp: string;
    /** Source component that emitted the event */
    source: string;
}

export interface TaskCompletedEvent extends PipelineEvent {
    type: 'task-completed';
    stage: string;
    agent: string;
    summary: string;
}

export interface TaskBlockedEvent extends PipelineEvent {
    type: 'task-blocked';
    stage: string;
    agent: string;
    reason: string;
}

export interface ApprovalNeededEvent extends PipelineEvent {
    type: 'approval-needed';
    stage: string;
    agent: string;
    action: string;
    riskTier: string;
}

export interface BackgroundResultEvent extends PipelineEvent {
    type: 'background-result';
    taskId: string;
    status: 'success' | 'failure';
    summary: string;
}

export interface MemoryConsolidatedEvent extends PipelineEvent {
    type: 'memory-consolidated';
    itemsPruned: number;
    itemsPromoted: number;
}

export type JunaiEvent =
    | TaskCompletedEvent
    | TaskBlockedEvent
    | ApprovalNeededEvent
    | BackgroundResultEvent
    | MemoryConsolidatedEvent;

export type JunaiEventType = JunaiEvent['type'];

// ─────────────────────────────────────────────────────────────
// Typed event bus
// ─────────────────────────────────────────────────────────────

type EventHandler<T extends JunaiEvent> = (event: T) => void;

// Map event type strings to their corresponding event interfaces
type EventTypeMap = {
    'task-completed': TaskCompletedEvent;
    'task-blocked': TaskBlockedEvent;
    'approval-needed': ApprovalNeededEvent;
    'background-result': BackgroundResultEvent;
    'memory-consolidated': MemoryConsolidatedEvent;
};

/**
 * Typed event bus for junai pipeline events.
 *
 * Usage:
 * ```ts
 * const bus = JunaiEventBus.getInstance();
 *
 * // Subscribe
 * bus.on('task-completed', (event) => {
 *     console.log(`${event.agent} finished ${event.stage}`);
 * });
 *
 * // Emit
 * bus.emit({
 *     type: 'task-completed',
 *     timestamp: new Date().toISOString(),
 *     source: 'autopilot-watcher',
 *     stage: 'implement',
 *     agent: 'Implement',
 *     summary: 'Feature X implemented',
 * });
 * ```
 */
export class JunaiEventBus {
    private static instance: JunaiEventBus | null = null;
    private emitter = new EventEmitter();
    private eventLog: JunaiEvent[] = [];
    private maxLogSize = 100;

    private constructor() {
        // Increase max listeners — multiple consumers per event type is expected
        this.emitter.setMaxListeners(50);
    }

    static getInstance(): JunaiEventBus {
        if (!JunaiEventBus.instance) {
            JunaiEventBus.instance = new JunaiEventBus();
        }
        return JunaiEventBus.instance;
    }

    /**
     * Subscribe to a specific event type.
     * Returns a disposable function to unsubscribe.
     */
    on<K extends JunaiEventType>(
        eventType: K,
        handler: EventHandler<EventTypeMap[K]>,
    ): () => void {
        this.emitter.on(eventType, handler as (...args: any[]) => void);
        return () => {
            this.emitter.off(eventType, handler as (...args: any[]) => void);
        };
    }

    /**
     * Subscribe to ALL event types (useful for logging / status display).
     * Returns a disposable function to unsubscribe.
     */
    onAny(handler: (event: JunaiEvent) => void): () => void {
        const wrapper = (event: JunaiEvent) => handler(event);
        this.emitter.on('*', wrapper);
        return () => {
            this.emitter.off('*', wrapper);
        };
    }

    /**
     * Emit an event. Dispatches to type-specific listeners AND the wildcard '*' listener.
     */
    emit(event: JunaiEvent): void {
        // Add to rolling log
        this.eventLog.push(event);
        if (this.eventLog.length > this.maxLogSize) {
            this.eventLog.shift();
        }

        // Type-specific dispatch
        this.emitter.emit(event.type, event);
        // Wildcard dispatch
        this.emitter.emit('*', event);
    }

    /**
     * Get recent events (most recent first).
     */
    getRecentEvents(count: number = 10): readonly JunaiEvent[] {
        return this.eventLog.slice(-count).reverse();
    }

    /**
     * Clear all listeners and the event log.
     * Call during extension deactivation.
     */
    dispose(): void {
        this.emitter.removeAllListeners();
        this.eventLog = [];
        JunaiEventBus.instance = null;
    }
}
