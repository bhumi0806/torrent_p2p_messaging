import { PeerConnection } from "./models/PeerConnection";
import { DataChannel } from "./models/DataChannel";

export class DataChannelManager {

    /**
     * Create outgoing DataChannel.
     */
    public createDataChannel(
        peerConnection: PeerConnection,
        label: string = "bleep"
    ): DataChannel {

        const rtcChannel =
            peerConnection
                .getConnection()
                .createDataChannel(label);

        return new DataChannel(

            peerConnection.getPeerId(),

            rtcChannel

        );

    }

    /**
     * Listen for incoming DataChannel.
     */
    public registerIncomingChannelHandler(
        peerConnection: PeerConnection,
        callback: (channel: DataChannel) => void
    ): void {

        peerConnection
            .getConnection()
            .ondatachannel = (event) => {

                callback(

                    new DataChannel(

                        peerConnection.getPeerId(),

                        event.channel

                    )

                );

            };

    }

    /**
     * Register open event.
     */
    public registerOpenHandler(
        channel: DataChannel,
        callback: () => void
    ): void {

        channel
            .getChannel()
            .onopen = callback;

    }

    /**
     * Register message event.
     */
    public registerMessageHandler(
        channel: DataChannel,
        callback: (message: MessageEvent) => void
    ): void {

        channel
            .getChannel()
            .onmessage = callback;

    }

    /**
     * Register close event.
     */
    public registerCloseHandler(
        channel: DataChannel,
        callback: () => void
    ): void {

        channel
            .getChannel()
            .onclose = callback;

    }

    /**
     * Close DataChannel.
     */
    public close(
        channel: DataChannel
    ): void {

        channel.close();

    }

}