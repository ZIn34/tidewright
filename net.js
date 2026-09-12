// Tidewright - serverless peer-to-peer link (WebRTC data channel) and codecs.
//
// There is no signaling server. The host makes an offer code, sends it to a
// friend as a link; the friend's page answers with a reply code that the host
// pastes back. After that the two phones talk directly. Codes are deflated
// and base64url-encoded so they fit in a message.
(function (root) {
  'use strict';

  // ---------- codec: string <-> compact url-safe code ----------
  const te = new TextEncoder(), td = new TextDecoder();
  function b64u(bytes) {
    let s = '';
    for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
    return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  function unb64u(str) {
    str = str.replace(/-/g, '+').replace(/_/g, '/');
    while (str.length % 4) str += '=';
    const s = atob(str);
    const out = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
    return out;
  }
  async function pump(stream) {
    const reader = stream.getReader();
    const chunks = [];
    let len = 0;
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      chunks.push(value); len += value.length;
    }
    const out = new Uint8Array(len);
    let o = 0;
    chunks.forEach(c => { out.set(c, o); o += c.length; });
    return out;
  }
  const canZip = typeof CompressionStream !== 'undefined';
  // Pack a string into a code. Prefix 'z' = deflated, 'p' = plain.
  async function pack(str) {
    const bytes = te.encode(str);
    if (canZip) {
      try {
        const cs = new CompressionStream('deflate-raw');
        const w = cs.writable.getWriter();
        w.write(bytes); w.close();
        return 'z' + b64u(await pump(cs.readable));
      } catch (e) { /* fall through */ }
    }
    return 'p' + b64u(bytes);
  }
  async function unpack(code) {
    if (!code || code.length < 2) throw new Error('empty code');
    const kind = code[0], body = unb64u(code.slice(1));
    if (kind === 'p') return td.decode(body);
    if (kind === 'z') {
      if (typeof DecompressionStream === 'undefined') throw new Error('This browser cannot read compressed codes.');
      const ds = new DecompressionStream('deflate-raw');
      const w = ds.writable.getWriter();
      w.write(body); w.close();
      return td.decode(await pump(ds.readable));
    }
    throw new Error('unknown code');
  }

  // ---------- action log <-> bytes ----------
  // Actions are [tick, code, x, y, player]. Ticks are stored as deltas.
  function encodeActions(actions) {
    const out = [];
    let last = 0;
    const varint = v => { while (v >= 128) { out.push((v & 127) | 128); v >>>= 7; } out.push(v); };
    actions.forEach(a => {
      varint(a[0] - last); last = a[0];
      out.push((a[1] & 15) | ((a[4] & 15) << 4));
      out.push(a[2] & 255); out.push(a[3] & 255);
    });
    return b64u(Uint8Array.from(out));
  }
  function decodeActions(str) {
    const b = unb64u(str);
    const acts = [];
    let i = 0, last = 0;
    while (i < b.length) {
      let v = 0, shift = 0;
      for (;;) { const c = b[i++]; v |= (c & 127) << shift; if (c < 128) break; shift += 7; }
      last += v;
      const cp = b[i++], x = b[i++], y = b[i++];
      acts.push([last, cp & 15, x, y, cp >> 4]);
    }
    return acts;
  }

  // ---------- peer link ----------
  const ICE = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }];

  class Peer {
    constructor() {
      this.pc = new RTCPeerConnection({ iceServers: ICE });
      this.channel = null;
      this.onMessage = null;
      this.onOpen = null;
      this.onClose = null;
      this.open = false;
      this.pc.onconnectionstatechange = () => {
        const s = this.pc.connectionState;
        if ((s === 'failed' || s === 'disconnected' || s === 'closed') && this.open) { this.open = false; if (this.onClose) this.onClose(s); }
      };
    }
    _wire(ch) {
      this.channel = ch;
      ch.onopen = () => { this.open = true; if (this.onOpen) this.onOpen(); };
      ch.onclose = () => { if (this.open) { this.open = false; if (this.onClose) this.onClose('closed'); } };
      ch.onmessage = e => { if (this.onMessage) { try { this.onMessage(JSON.parse(e.data)); } catch (err) { /* ignore junk */ } } };
    }
    // Wait until ICE gathering is done (or a timeout) so the code carries every candidate.
    _gathered() {
      return new Promise(resolve => {
        if (this.pc.iceGatheringState === 'complete') return resolve();
        const t = setTimeout(resolve, 4000);
        this.pc.onicegatheringstatechange = () => {
          if (this.pc.iceGatheringState === 'complete') { clearTimeout(t); resolve(); }
        };
      });
    }
    async createOffer() {
      this._wire(this.pc.createDataChannel('tw', { ordered: true }));
      await this.pc.setLocalDescription(await this.pc.createOffer());
      await this._gathered();
      return pack(JSON.stringify({ t: 'o', s: this.pc.localDescription.sdp }));
    }
    async acceptOffer(code) {
      const msg = JSON.parse(await unpack(code));
      if (msg.t !== 'o') throw new Error('That is not an invite code.');
      this.pc.ondatachannel = e => this._wire(e.channel);
      await this.pc.setRemoteDescription({ type: 'offer', sdp: msg.s });
      await this.pc.setLocalDescription(await this.pc.createAnswer());
      await this._gathered();
      return pack(JSON.stringify({ t: 'a', s: this.pc.localDescription.sdp }));
    }
    async acceptAnswer(code) {
      const msg = JSON.parse(await unpack(code));
      if (msg.t !== 'a') throw new Error('That is not a reply code.');
      await this.pc.setRemoteDescription({ type: 'answer', sdp: msg.s });
    }
    send(obj) {
      if (this.channel && this.channel.readyState === 'open') this.channel.send(JSON.stringify(obj));
    }
    close() {
      try { if (this.channel) this.channel.close(); } catch (e) { /* ignore */ }
      try { this.pc.close(); } catch (e) { /* ignore */ }
      this.open = false;
    }
  }

  // ---------- rooms through the public PeerJS signaling service ----------
  // Same data-channel transport, but the meeting point is a short room code
  // registered with PeerJS's free cloud server (loaded from cdnjs when online).
  function idFor(code) { return 'tw1-' + code; }
  function roomsAvailable() { return api.hasWebRTC && typeof root.Peer === 'function'; }
  class Link {
    constructor(conn, peer) {
      this.conn = conn; this.peer = peer;
      this.open = !!conn.open;
      this.onMessage = null; this.onOpen = null; this.onClose = null;
      conn.on('open', () => { this.open = true; if (this.onOpen) this.onOpen(); });
      conn.on('data', d => { if (!this.onMessage) return; try { this.onMessage(typeof d === 'string' ? JSON.parse(d) : d); } catch (e) { /* ignore junk */ } });
      const closed = why => { if (this.open) { this.open = false; if (this.onClose) this.onClose(why); } };
      conn.on('close', () => closed('closed'));
      conn.on('error', () => closed('error'));
      if (peer) peer.on('error', e => { if (this.open) closed(e && e.type || 'error'); });
    }
    send(obj) { if (this.conn.open) this.conn.send(obj); }
    close() {
      try { this.conn.close(); } catch (e) { /* ignore */ }
      try { if (this.peer) this.peer.destroy(); } catch (e) { /* ignore */ }
      this.open = false;
    }
  }
  // Register a room. Resolves {code, close} once the service has accepted the id;
  // onLink fires when a friend connects. A null code picks a random 4-digit one.
  function hostRoom(code, onLink, timeoutMs) {
    return new Promise((resolve, reject) => {
      const useCode = code || String(1000 + Math.floor(Math.random() * 9000));
      const peer = new root.Peer(idFor(useCode), { debug: 0 });
      let settled = false;
      const fail = err => { if (settled) return; settled = true; try { peer.destroy(); } catch (e) { /* ignore */ } reject(err); };
      peer.on('open', () => { settled = true; resolve({ code: useCode, peer, close: () => { try { peer.destroy(); } catch (e) { /* ignore */ } } }); });
      peer.on('connection', conn => { onLink(new Link(conn, null)); });
      peer.on('error', err => fail(err));
      setTimeout(() => fail(new Error('timeout')), timeoutMs || 8000);
    });
  }
  async function hostRoomAny(onLink) {
    let last = null;
    for (let i = 0; i < 4; i++) {
      try { return await hostRoom(null, onLink); }
      catch (e) { last = e; if (!(e && e.type === 'unavailable-id')) throw e; }
    }
    throw last;
  }
  // Connect to a room by code. Resolves an open Link or rejects (no such room, no service).
  function joinRoom(code, timeoutMs) {
    return new Promise((resolve, reject) => {
      const peer = new root.Peer({ debug: 0 });
      let settled = false;
      const fail = err => { if (settled) return; settled = true; try { peer.destroy(); } catch (e) { /* ignore */ } reject(err); };
      peer.on('open', () => {
        const conn = peer.connect(idFor(code), { reliable: true, serialization: 'json' });
        const link = new Link(conn, peer);
        conn.on('open', () => { if (settled) return; settled = true; resolve(link); });
      });
      peer.on('error', err => fail(err));
      setTimeout(() => fail(new Error('timeout')), timeoutMs || 9000);
    });
  }

  const api = { pack, unpack, encodeActions, decodeActions, Peer, hasWebRTC: typeof RTCPeerConnection !== 'undefined', roomsAvailable, hostRoom, hostRoomAny, joinRoom, idFor };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Tidewright = Object.assign(root.Tidewright || {}, api);
})(typeof window !== 'undefined' ? window : globalThis);
