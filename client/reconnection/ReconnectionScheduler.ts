export class ReconnectionScheduler {

    private timer?: ReturnType<typeof setTimeout>;

    private running = false;

    /**
     * Wait for the specified delay.
     */
    public wait(
        delay: number
    ): Promise<void> {

        if (delay < 0) {

            throw new Error(
                "Invalid delay."
            );

        }

        this.running = true;

        return new Promise(

            (resolve) => {

                this.timer = setTimeout(

                    () => {

                        this.running = false;

                        resolve();

                    },

                    delay

                );

            }

        );

    }

    /**
     * Cancel the scheduled reconnection.
     */
    public cancel(): void {

        if (this.timer) {

            clearTimeout(
                this.timer
            );

        }

        this.running = false;

    }

    /**
     * Check whether scheduler is active.
     */
    public isRunning(): boolean {

        return this.running;

    }

}