import { PeerId } from "../../identity/valueObjects/PeerID";

export class HeartbeatPacket {

    constructor(

        private readonly senderId: PeerId,

        private readonly sequenceNumber: number,

        private readonly timestamp: number,

        private readonly nonce: string

    ) {}

    /**
     * Get sender ID.
     */
    public getSenderId(): PeerId {

        return this.senderId;

    }

    /**
     * Get sequence number.
     */
    public getSequenceNumber(): number {

        return this.sequenceNumber;

    }

    /**
     * Get timestamp.
     */
    public getTimestamp(): number {

        return this.timestamp;

    }

    /**
     * Get nonce.
     */
    public getNonce(): string {

        return this.nonce;

    }

    /**
     * Serialize packet.
     */
    public toJSON(): object {

        return {

            senderId:
                this.senderId.toString(),

            sequenceNumber:
                this.sequenceNumber,

            timestamp:
                this.timestamp,

            nonce:
                this.nonce

        };

    }

    /**
     * Deserialize packet.
     */
    public static fromJSON(
        object: any
    ): HeartbeatPacket {

        if (

            !object ||

            typeof object.senderId !== "string" ||

            typeof object.sequenceNumber !== "number" ||

            typeof object.timestamp !== "number" ||

            typeof object.nonce !== "string"

        ) {

            throw new Error(

                "Invalid heartbeat packet."

            );

        }

        return new HeartbeatPacket(

            PeerId.fromString(
                object.senderId
            ),

            object.sequenceNumber,

            object.timestamp,

            object.nonce

        );

    }

}