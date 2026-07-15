// P2P networking via PeerJS (public cloud broker — works from static hosting).
// Host is authoritative for ball, score, clock, phase. Cars are client-authoritative.
//
// Messages:
//  client → host : hello {name, custom}, car {s}, chat {n}, touch {impact}
//  host → client : welcome {id, team, players, state}, join {player}, leave {id},
//                  state {b, cars, sc, ck, ph}, goal {team, scorer}, count {n},
//                  end {winner}, chat {from, n}, demo {id}

const PREFIX = 'chezburger-derby-v1-';

export function makeCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let c = '';
  for (let i = 0; i < 4; i++) c += chars[(Math.random() * chars.length) | 0];
  return c;
}

export class Net {
  constructor() {
    this.peer = null;
    this.isHost = false;
    this.code = null;
    this.conns = new Map();      // peerId -> DataConnection (host side)
    this.hostConn = null;        // client side
    this.myId = null;
    this.onEvent = () => {};     // (type, data, fromId)
    this.nextPlayerNum = 1;
  }

  _newPeer(id) {
    return new Peer(id, { debug: 1 });
  }

  host(code, onReady, onError) {
    this.isHost = true;
    this.code = code;
    this.myId = 'host';
    this.peer = this._newPeer(PREFIX + code);
    this.peer.on('open', () => onReady(code));
    this.peer.on('error', (e) => onError(e.type === 'unavailable-id'
      ? 'Room code already in use — try again.' : 'Network error: ' + e.type));
    this.peer.on('connection', (conn) => {
      conn.on('open', () => {
        this.conns.set(conn.peer, conn);
        conn.on('data', (msg) => this.onEvent(msg.t, msg, conn.peer));
        conn.on('close', () => {
          this.conns.delete(conn.peer);
          this.onEvent('leave', { id: conn.peer }, conn.peer);
        });
      });
    });
  }

  join(code, onReady, onError) {
    this.isHost = false;
    this.code = code;
    this.peer = this._newPeer(undefined);
    this.peer.on('error', (e) => onError(e.type === 'peer-unavailable'
      ? 'Room not found — check the code.' : 'Network error: ' + e.type));
    this.peer.on('open', (id) => {
      this.myId = id;
      const conn = this.peer.connect(PREFIX + code, { reliable: false });
      this.hostConn = conn;
      conn.on('open', () => onReady());
      conn.on('data', (msg) => this.onEvent(msg.t, msg, 'host'));
      conn.on('close', () => this.onEvent('hostLeft', {}, 'host'));
    });
  }

  // host: send to all clients (optionally excluding one)
  broadcast(msg, exceptId = null) {
    for (const [id, c] of this.conns) {
      if (id !== exceptId && c.open) c.send(msg);
    }
  }

  sendTo(id, msg) {
    const c = this.conns.get(id);
    if (c?.open) c.send(msg);
  }

  // client: send to host
  send(msg) {
    if (this.hostConn?.open) this.hostConn.send(msg);
  }

  close() {
    try { this.peer?.destroy(); } catch { /* ignore */ }
    this.peer = null;
    this.conns.clear();
    this.hostConn = null;
  }
}

// pack/unpack a car state compactly
export function packCar(car) {
  const r = (v) => Math.round(v * 100) / 100;
  return [r(car.pos.x), r(car.pos.y), r(car.pos.z),
          r(car.vel.x), r(car.vel.y), r(car.vel.z),
          r(car.yaw), r(car.pitch), r(car.roll),
          car.boosting ? 1 : 0, car.supersonic ? 1 : 0, car.demolished > 0 ? 1 : 0,
          car.flipping > 0 ? 1 : 0];
}
