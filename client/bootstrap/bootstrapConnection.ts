import { BootstrapState } from "./bootstrapState";
import { ConnectionState } from "./types/ConnectionState";

export class BootstrapConnection {

    constructor(
        private readonly state: BootstrapState
    ) {}

    /**
     * Connect to Bootstrap Server.
     */
    public connect(
        url: string,
        onMessage: (message: string) => void,
        onOpen: () => void,
        onClose: () => void,
        onError: (event: Event) => void
    ): Promise<void> {

        return new Promise((resolve, reject) => {
            this.state.setState(
                ConnectionState.CONNECTING
            );

            const socket = new WebSocket(url);

            socket.onopen = () => {

                this.state.setSocket(socket);

                this.state.setState(
                    ConnectionState.CONNECTED
                );

                onOpen();
                resolve();

            };

            socket.onmessage = (event) => {
                try {
                    onMessage(event.data as string);
                } catch (error) {
                    console.error("Failed to process bootstrap message.", error);
                }
            };

            socket.onclose = () => {

                this.state.setState(
                    ConnectionState.DISCONNECTED
                );

                onClose();

                if (this.state.getState() !== ConnectionState.CONNECTED) {
                    reject(new Error("Bootstrap connection closed before opening."));
                }

            };

            socket.onerror = (event) => {

                onError(event);
                reject(new Error("Bootstrap connection error."));

            };
        });

    }

    /**
     * Disconnect.
     */
    public disconnect(): void {

        const socket =
            this.state.getSocket();

        if (!socket) {
            return;
        }

        socket.close();

    }

    /**
     * Send packet.
     */
    public send(
        packet: unknown
    ): void {

        const socket =
            this.state.getSocket();

        if (!socket) {

            throw new Error(
                "Bootstrap not connected."
            );

        }
        if (socket.readyState !== WebSocket.OPEN) {
        throw new Error("Bootstrap socket is not open.");
    }

    socket.send(JSON.stringify(packet));

    }

}