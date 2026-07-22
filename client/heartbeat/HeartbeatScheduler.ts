import { PeerId } from "../identity/valueObjects/PeerID";

export class HeartbeatScheduler {

    private timer?: ReturnType<typeof setInterval>;

    private running = false;

    constructor(

        private readonly interval: number = 5000

    ) {}

    /**
     * Start heartbeat scheduler.
     */
    public start(

        callback: () => void

    ): void {

        if (this.running) {

            return;

        }

        this.running = true;

        this.timer = setInterval(

            callback,

            this.interval

        );

    }

    /**
     * Stop heartbeat scheduler.
     */
    public stop(): void {

        if (!this.running) {

            return;

        }

        if (this.timer) {

            clearInterval(

                this.timer

            );

        }

        this.running = false;

    }

    /**
     * Restart scheduler.
     */
    public restart(

        callback: () => void

    ): void {

        this.stop();

        this.start(

            callback

        );

    }

    /**
     * Check whether scheduler is running.
     */
    public isRunning(): boolean {

        return this.running;

    }

    /**
     * Get heartbeat interval.
     */
    public getInterval(): number {

        return this.interval;

    }

}