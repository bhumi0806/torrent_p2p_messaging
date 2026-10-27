export interface PeerInfo {

    peerId: string;

    username: string;

    publicKey: string;

    coordinate?: number;

}

export type PeerListPayload = PeerInfo[];
