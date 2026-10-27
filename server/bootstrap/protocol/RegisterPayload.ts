export interface RegisterPayload {

    peerId: string;

    username: string;

    publicKey: string;

    /** Public-key-derived ring coordinate; kept only for this live session. */
    coordinate?: number;

}
