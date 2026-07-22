import { PeerId } from "../../identity/valueObjects/PeerID";
import { PublicKey } from "../../identity/valueObjects/PublicKey";

export class Peer {

    constructor(

        private readonly peerId: PeerId,

        private readonly userName: string,

        private readonly publicKey: PublicKey

    ) {}

    public getPeerId(): PeerId {

        return this.peerId;

    }

    public getUserName(): string {

        return this.userName;

    }

    public getPublicKey(): PublicKey {

        return this.publicKey;

    }

}