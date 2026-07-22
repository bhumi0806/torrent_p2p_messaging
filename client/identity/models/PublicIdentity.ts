import { PeerId } from "../valueObjects/PeerID";
import { Username } from "../valueObjects/UserName";
import { PublicKey } from "../valueObjects/PublicKey";

/**
 * Safe representation of a peer that can be shared over the network.
 */
export class PublicIdentity {
    static fromStorage(peerId: any, userName: any, publicKey: any): PublicIdentity {
        throw new Error("Method not implemented.");
    }
    [x: string]: any;

    public readonly peerId: PeerId;
    public readonly username: Username;
    public readonly publicKey: PublicKey;

    constructor(
        peerId: PeerId,
        username: Username,
        publicKey: PublicKey
    ) {

        this.peerId = peerId;
        this.username = username;
        this.publicKey = publicKey;

        Object.freeze(this);
    }
}