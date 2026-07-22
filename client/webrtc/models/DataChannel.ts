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

    /**
     * Close channel.
     */
    public close(): void {

        this.channel.close();

    }

}