import { PeerId } from "../identity/valueObjects/PeerID";
import { Identity } from "../identity/Identity";
import { BootstrapClient } from "../bootstrap/bootstrapClient";

import { ApplicationContext } from "./ApplicationContext";
import { EventBus } from "./EventBus";
import { PublicKey } from "../identity/valueObjects/PublicKey";
import { NodeCoordinate } from "../peerDiscovery/NodeCoordinate";
import { SelectedNeighbor, SmallWorldTopology } from "../peerDiscovery/SmallWorldTopology";

export class PeerDiscoveryController {

    constructor(

        private readonly bootstrapClient: BootstrapClient,

        private readonly eventBus: EventBus,

        private readonly context: ApplicationContext

    ) {}

    /**
     * Start peer discovery.
     */
    public async start(): Promise<void> {

        await this.refreshPeers();

    }

    /**
     * Refresh online peer list.
     */
    public async refreshPeers(): Promise<void> {

        const peers =

            (await this.bootstrapClient.getOnlinePeers()) as any[];

        const identity = this.context.getIdentity();

        if (!identity) {
            return;
        }

        const localPeerId = identity.getPeerId().toString();

        const filteredPeers = peers.filter(
            (peer: any) =>
                peer.peerId !== localPeerId
        );

        this.context.setOnlinePeers(

            filteredPeers

        );

        const localCoordinate = this.context.getLocalCoordinate();
        let selectedNeighbors: SelectedNeighbor[] = [];
        if (localCoordinate !== undefined) {
            const candidates = await Promise.all(filteredPeers.map(async (peer: any) => {
                if (typeof peer?.peerId !== "string" || typeof peer?.publicKey !== "string") return undefined;
                try {
                    const key = PublicKey.fromBase64(peer.publicKey);
                    const verifiedPeerId = await PeerId.fromPublicKey(key.bytes);
                    if (verifiedPeerId.toString() !== peer.peerId) return undefined;
                    return {
                        peerId: peer.peerId,
                        coordinate: await NodeCoordinate.fromPublicKey(key)
                    };
                } catch {
                    return undefined;
                }
            }));
            selectedNeighbors = SmallWorldTopology.selectNeighbors(
                localPeerId,
                localCoordinate,
                candidates.filter((peer): peer is { peerId: string; coordinate: number } => !!peer)
            );
        }
        this.eventBus.emit("SMALL_WORLD_NEIGHBORS_SELECTED", selectedNeighbors);
        for (const neighbor of selectedNeighbors) {
            this.eventBus.emit("CONNECT_TO_PEER", PeerId.fromString(neighbor.peerId));
        }

        this.eventBus.emit(

            "PEER_LIST_UPDATED",

            filteredPeers

        );

    }

    /**
     * Find peer by PeerId.
     */
    public findPeer(

        peerId: PeerId

    ): any | undefined {

        const peerIdString = peerId.toString();

        return this.context
            .getOnlinePeers()
            .find(

                (peer: any) =>
                    peer.peerId === peerIdString

            );

    }

    /**
     * Register events.
     */
    public register(): void {

        this.eventBus.on(

            "BOOTSTRAP_CONNECTED",

            async () => {

                await this.refreshPeers();

            }

        );

        this.eventBus.on(

            "LOGIN_SUCCESS",

            async () => {

                await this.refreshPeers();

            }

        );

        this.eventBus.on(

            "PEER_LIST",

            async () => {

                await this.refreshPeers();

            }

        );

        this.eventBus.on(

            "PEER_JOINED",

            async () => {

                await this.refreshPeers();

            }

        );

        this.eventBus.on(

            "PEER_LEFT",

            async () => {

                await this.refreshPeers();

            }

        );

        this.eventBus.on(

            "PEER_REGISTERED",

            async () => {

                await this.refreshPeers();

            }

        );

        this.eventBus.on(

            "PEER_DISCONNECTED",

            async () => {

                await this.refreshPeers();

            }

        );

        this.eventBus.on(

            "REFRESH_PEERS",

            async () => {

                await this.refreshPeers();

            }

        );

    }

}
