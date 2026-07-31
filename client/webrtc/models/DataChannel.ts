import { PeerId } from "../../identity/valueObjects/PeerID";

export class DataChannel {

    constructor(

        private readonly peerId: PeerId,

        private readonly channel: RTCDataChannel

    ) {}

    /**
     * Get peer id.
     */
    public getPeerId(): PeerId {

        return this.peerId;

    }

    /**
     * Get RTCDataChannel.
     */
    public getChannel(): RTCDataChannel {

        return this.channel;

    }

    /**
     * Check whether channel is open.
     */
    public isOpen(): boolean {

        return this.channel.readyState === "open";

    }

    /**
     * Send data.
     */
    public send(
        data: string | ArrayBuffer | Blob
    ): void {

        if (!this.isOpen()) {

            throw new Error(
                "DataChannel is not open."
            );

        }

        if (typeof data === "string") {
            this.channel.send(data);
            return;
        }

        if (data instanceof Blob) {
            this.channel.send(data);
            return;
        }

        this.channel.send(data);

    }

    public waitUntilOpen(
        timeoutMs: number = 10000
    ): Promise<void> {

        if (this.isOpen()) {
            return Promise.resolve();
        }

        return new Promise((resolve, reject) => {
            const timeout = window.setTimeout(
                () => {
                    cleanup();
                    reject(
                        new Error("DataChannel did not open in time.")
                    );
                },
                timeoutMs
            );

            const handleOpen = () => {
                cleanup();
                resolve();
            };

            const handleClose = () => {
                cleanup();
                reject(
                    new Error("DataChannel closed before it opened.")
                );
            };

            const cleanup = () => {
                window.clearTimeout(timeout);
                this.channel.removeEventListener(
                    "open",
                    handleOpen
                );
                this.channel.removeEventListener(
                    "close",
                    handleClose
                );
                this.channel.removeEventListener(
                    "error",
                    handleClose
                );
            };

            this.channel.addEventListener(
                "open",
                handleOpen
            );
            this.channel.addEventListener(
                "close",
                handleClose
            );
            this.channel.addEventListener(
                "error",
                handleClose
            );
        });

    }

    /**
     * Close channel.
     */
    public close(): void {

        this.channel.close();

    }

}
