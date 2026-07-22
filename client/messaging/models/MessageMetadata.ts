import { PeerId } from "../../identity/valueObjects/PeerID";
import { DeliveryStatus } from "../types/DeliveryStatus";
import { MessageType } from "../types/MessageType";

export class MessageMetadata {

    constructor(

        private readonly messageId: string,

        private readonly senderId: PeerId,

        private readonly receiverId: PeerId,

        private readonly messageType: MessageType,

        private readonly timestamp: number,

        private deliveryStatus: DeliveryStatus

    ) {}

    /**
     * Get message id.
     */
    public getMessageId(): string {

        return this.messageId;

    }

    /**
     * Get sender.
     */
    public getSenderId(): PeerId {

        return this.senderId;

    }

    /**
     * Get receiver.
     */
    public getReceiverId(): PeerId {

        return this.receiverId;

    }

    /**
     * Get message type.
     */
    public getMessageType(): MessageType {

        return this.messageType;

    }

    /**
     * Get timestamp.
     */
    public getTimestamp(): number {

        return this.timestamp;

    }

    /**
     * Get delivery status.
     */
    public getDeliveryStatus(): DeliveryStatus {

        return this.deliveryStatus;

    }

    /**
     * Update delivery status.
     */
    public setDeliveryStatus(
        status: DeliveryStatus
    ): void {

        this.deliveryStatus = status;

    }

}