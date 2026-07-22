import { PeerId } from "../../identity/valueObjects/PeerID";

import { ReconnectionStatus } from "../types/ReconnectionStatus";

export class ReconnectionState {

    constructor(

        private readonly peerId: PeerId,

        private status: ReconnectionStatus,

        private retryCount: number,

        private lastAttempt: number,

        private readonly maxRetries: number,

        private readonly initialBackoff: number,

        private readonly maxBackoff: number

    ) {}

    /**
     * Get peer ID.
     */
    public getPeerId(): PeerId {

        return this.peerId;

    }

    /**
     * Get current status.
     */
    public getStatus(): ReconnectionStatus {

        return this.status;

    }

    /**
     * Update status.
     */
    public setStatus(
        status: ReconnectionStatus
    ): void {

        this.status = status;

    }

    /**
     * Get retry count.
     */
    public getRetryCount(): number {

        return this.retryCount;

    }

    /**
     * Increment retry count.
     */
    public incrementRetryCount(): void {

        this.retryCount++;

        this.lastAttempt = Date.now();

    }

    /**
     * Reset retry count.
     */
    public resetRetryCount(): void {

        this.retryCount = 0;

        this.lastAttempt = 0;

    }

    /**
     * Get last attempt timestamp.
     */
    public getLastAttempt(): number {

        return this.lastAttempt;

    }

    /**
     * Update last attempt timestamp.
     */
    public updateLastAttempt(): void {

        this.lastAttempt = Date.now();

    }

    /**
     * Get maximum retries.
     */
    public getMaxRetries(): number {

        return this.maxRetries;

    }

    /**
     * Check retry availability.
     */
    public canRetry(): boolean {

        return this.retryCount < this.maxRetries;

    }

    /**
     * Get initial backoff.
     */
    public getInitialBackoff(): number {

        return this.initialBackoff;

    }

    /**
     * Get maximum backoff.
     */
    public getMaxBackoff(): number {

        return this.maxBackoff;

    }

}