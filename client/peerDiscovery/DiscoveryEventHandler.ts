import { PeerRegistry } from "./PeerRegistry";
import { Peer } from "./models/Peer";

import { PeerId } from "../identity/valueObjects/PeerID";
import { PublicKey } from "../identity/valueObjects/PublicKey";

export class DiscoveryEventHandler {

    constructor(
        private readonly registry: PeerRegistry
    ) {}

    /**
     * Handle initial peer list.
     */
    public handlePeerList(
        peers: any[]
    ): void {

        this.registry.clear();

        for (const peer of peers) {

            this.registry.add(

                new Peer(

                    PeerId.fromString(
                        peer.peerId
                    ),

                    peer.userName,

                    new PublicKey(
                        Uint8Array.from(
                            Buffer.from(peer.publicKey, "base64")
                        )
                    )

                )

            );

        }

    }

    /**
     * Handle newly joined peer.
     */
    public handlePeerJoined(
        peer: any
    ): void {

        this.registry.add(

            new Peer(

                PeerId.fromString(
                    peer.peerId
                ),

                peer.userName,

                new PublicKey(
                    Uint8Array.from(
                        Buffer.from(peer.publicKey, "base64")
                    )
                )

            )

        );

    }

    /**
     * Handle disconnected peer.
     */
    public handlePeerLeft(
        peerId: string
    ): void {

        this.registry.remove(

            PeerId.fromString(
                peerId
            )

        );

    }

}