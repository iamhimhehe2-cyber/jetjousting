// Network module for Jet Jousting — wraps PeerJS for P2P WebRTC play
// One player hosts (creates room code), the other joins with that code.

const PEER_ID_PREFIX = 'jetjousting-';

export class NetworkManager {
    constructor() {
        this.peer = null;
        this.conn = null;
        this.isHost = false;
        this.roomCode = null;
        this.connected = false;
        this.remoteReady = false;

        // Callbacks set by the game
        this.onConnected = null;       // () => void — both sides linked
        this.onRemoteState = null;     // (state) => void — received opponent frame data
        this.onRemoteHit = null;       // (damage) => void — received damage event
        this.onRemoteReady = null;     // () => void — opponent clicked Ready
        this.onDisconnected = null;    // () => void — connection dropped
        this.onError = null;           // (msg) => void — user-facing error string
    }

    // ─── HOST: Create a room ───────────────────────────────────────────────────
    createRoom() {
        return new Promise((resolve, reject) => {
            const code = this._generateCode();
            this.roomCode = code;
            this.isHost = true;

            this.peer = new Peer(PEER_ID_PREFIX + code, {
                debug: 0
            });

            this.peer.on('open', (id) => {
                console.log('[Net] Room open, code:', code);
                resolve(code);
            });

            this.peer.on('error', (err) => {
                const msg = err.type === 'unavailable-id'
                    ? 'Room code already taken. Try again.'
                    : 'Network error: ' + err.message;
                if (this.onError) this.onError(msg);
                reject(msg);
            });

            // Wait for guest to connect
            this.peer.on('connection', (conn) => {
                this.conn = conn;
                this._setupConnection(conn);
            });
        });
    }

    // ─── GUEST: Join a room ────────────────────────────────────────────────────
    joinRoom(code) {
        return new Promise((resolve, reject) => {
            const cleanCode = code.trim().toUpperCase();
            this.roomCode = cleanCode;
            this.isHost = false;

            this.peer = new Peer(undefined, { debug: 0 });

            this.peer.on('open', () => {
                const conn = this.peer.connect(PEER_ID_PREFIX + cleanCode, {
                    reliable: false,        // Unreliable = low latency for state frames
                    serialization: 'json'
                });
                this.conn = conn;
                this._setupConnection(conn);
                resolve(cleanCode);
            });

            this.peer.on('error', (err) => {
                const msg = err.type === 'peer-unavailable'
                    ? 'Room not found. Check the code and try again.'
                    : 'Connection error: ' + err.message;
                if (this.onError) this.onError(msg);
                reject(msg);
            });
        });
    }

    // ─── Send player state every frame ────────────────────────────────────────
    sendState(playerState) {
        if (!this.connected || !this.conn || !this.conn.open) return;
        this.conn.send({ type: 'state', ...playerState });
    }

    // ─── Send a damage hit event ───────────────────────────────────────────────
    sendHit(damage) {
        if (!this.connected || !this.conn || !this.conn.open) return;
        this.conn.send({ type: 'hit', damage });
    }

    // ─── Signal that this player is ready to start ────────────────────────────
    sendReady() {
        if (!this.connected || !this.conn || !this.conn.open) return;
        this.conn.send({ type: 'ready' });
    }

    // ─── Disconnect cleanly ────────────────────────────────────────────────────
    disconnect() {
        if (this.conn) this.conn.close();
        if (this.peer) this.peer.destroy();
        this.conn = null;
        this.peer = null;
        this.connected = false;
        this.remoteReady = false;
    }

    // ─── Internal ─────────────────────────────────────────────────────────────
    _setupConnection(conn) {
        conn.on('open', () => {
            this.connected = true;
            console.log('[Net] Connection established');
            if (this.onConnected) this.onConnected();
        });

        conn.on('data', (data) => {
            if (!data || !data.type) return;

            switch (data.type) {
                case 'state':
                    if (this.onRemoteState) this.onRemoteState(data);
                    break;
                case 'hit':
                    if (this.onRemoteHit) this.onRemoteHit(data.damage);
                    break;
                case 'ready':
                    this.remoteReady = true;
                    if (this.onRemoteReady) this.onRemoteReady();
                    break;
                default:
                    break;
            }
        });

        conn.on('close', () => {
            this.connected = false;
            console.log('[Net] Connection closed');
            if (this.onDisconnected) this.onDisconnected();
        });

        conn.on('error', (err) => {
            console.error('[Net] Connection error:', err);
            if (this.onError) this.onError('Connection dropped: ' + err.message);
        });
    }

    _generateCode() {
        const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
        let code = '';
        for (let i = 0; i < 6; i++) {
            code += chars[Math.floor(Math.random() * chars.length)];
        }
        return code;
    }
}
