import { MessageType } from "../types/MessageType";

export class BootstrapPacket<T> {

    constructor(

        public readonly type: MessageType,

        public readonly payload: T

    ) {}

    /**
     * Serialize packet.
     */
    public toJSON(): object {

        return {

            type: this.type,

            payload: this.payload

        };

    }

    /**
     * Deserialize packet.
     */
    public static fromJSON<T>(
        json: string
    ): BootstrapPacket<T> {

        const packet = JSON.parse(json);

        return new BootstrapPacket<T>(

            packet.type,

            packet.payload

        );

    }

}