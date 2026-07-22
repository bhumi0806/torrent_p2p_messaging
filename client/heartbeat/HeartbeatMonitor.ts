import { PeerId } from "../identity/valueObjects/PeerID";

import { PeerStatus } from "./types/PeerStatus";

export class HeartbeatMonitor {

    public static readonly HEARTBEAT_TIMEOUT =
        15000;

    private readonly lastHeartbeat =
        new Map<string, number>();

    private readonly peerStatus =
        new Map<string, PeerStatus>();

    /**
     * Update heartbeat timestamp.
     */
    public updateHeartbeat(
        peerId: PeerId
    ): void {

        this.lastHeartbeat.set(
            peerId.toString(),
            Date.now()
        );

        this.peerStatus.set(
            peerId.toString(),
            PeerStatus.ALIVE
        );

    }

    /**
     * Check whether peer is alive.
     */
    public isAlive(
        peerId: PeerId
    ): boolean {

        const lastSeen =
            this.lastHeartbeat.get(
                peerId.toString()
            );

        if (lastSeen === undefined) {

            return false;

        }

        return (

            Date.now() - lastSeen <=

            HeartbeatMonitor.HEARTBEAT_TIMEOUT

        );

    }

    /**
     * Refresh peer statuses.
     */
    public refreshStatuses(): void {

        const now = Date.now();

        for (

            const [peerId, lastSeen]

            of this.lastHeartbeat

        ) {

            if (

                now - lastSeen >

                HeartbeatMonitor.HEARTBEAT_TIMEOUT

            ) {

                this.peerStatus.set(

                    peerId,

                    PeerStatus.UNRESPONSIVE

                );

            }

            else {

                this.peerStatus.set(

                    peerId,

                    PeerStatus.ALIVE

                );

            }

        }

    }

    /**
     * Get peer status.
     */
    public getStatus(
        peerId: PeerId
    ): PeerStatus {

        return (

            this.peerStatus.get(
                peerId.toString()
            )

            ??

            PeerStatus.DISCONNECTED

        );

    }

    /**
     * Remove peer.
     */
    public removePeer(
        peerId: PeerId
    ): void {

        this.lastHeartbeat.delete(

            peerId.toString()

        );

        this.peerStatus.delete(

            peerId.toString()

        );

    }

    /**
     * Get all peer statuses.
     */
    public getStatuses():
        Map<string, PeerStatus> {

        return new Map(
            this.peerStatus
        );

    }

}