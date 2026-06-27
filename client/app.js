import sodium from "libsodium-wrappers";
let ws;
let myUsername = null;
let peerUsername = null;

let peers = {};

// ==================== MESSAGE ROUTING ====================
let messageRouter = null;
let relayForwarder = null;
function createPeer(username, isCaller) {
  const pc = new RTCPeerConnection();
  const peer = {
    pc,
    dc: null,
    connected: false,
    session: {
      ready: false,
      sendKey: null,
      recvKey: null,
      sendCounter: 0n,
      recvMaxCounter: -1n
    },
    hs: {
      myEph: null,
      peerEphPub: null,
      nonceLocal: null,
      nonceRemote: null,
      complete: false
    },
    peerIdentityPubBytes: null
  };

  peers[username] = peer;

  if (isCaller) {
    const channel = pc.createDataChannel("chat");
    peer.dc = channel;
    setupDataChannel(username, peer, channel);
  } else {
    pc.ondatachannel = (event) => {
      const channel = event.channel;
      peer.dc = channel;
      setupDataChannel(username, peer, channel);
    };
  }

  pc.onicecandidate = (event) => {
    if (event.candidate) {
      ws.send(JSON.stringify({
        type: "ice",
        to: username,
        candidate: event.candidate
      }));
    }
  };

  return pc;
}
// function setupDataChannel(username, dc) {

//   dc.onopen = () => {

//     log("Connected to " + username);

//   };

//   dc.onmessage = (event) => {

//     log(username + ": " + event.data);

//   };

//   dc.onclose = () => {

//     log("Disconnected from " + username);

//     delete peers[username];

//   };
// }


// ---- Crypto state ----
let myIdentity = null; // { pubB64, privB64, pubBytes, privBytes }

function log(s) {
  document.getElementById("log").textContent += s + "\n";
}
function setStatus(s) {
  document.getElementById("status").textContent = s;
}
function wsSend(obj) {
  ws.send(JSON.stringify(obj));
}

function b64enc(u8) {
  return sodium.to_base64(u8, sodium.base64_variants.ORIGINAL);
}
function b64dec(str) {
  return sodium.from_base64(str, sodium.base64_variants.ORIGINAL);
}

async function loadOrCreateIdentity(username) {
  // One identity per (browser + username) for demo.
  const key = "p2p_identity_" + username;
  const stored = localStorage.getItem(key);
  if (stored) {
    const obj = JSON.parse(stored);
    const pubBytes = b64dec(obj.pubB64);
    const privBytes = b64dec(obj.privB64);
    return { ...obj, pubBytes, privBytes };
  }

  const kp = sodium.crypto_sign_keypair(); // Ed25519
  const pubB64 = b64enc(kp.publicKey);
  const privB64 = b64enc(kp.privateKey);
  const obj = { pubB64, privB64 };
  localStorage.setItem(key, JSON.stringify(obj));
  return { ...obj, pubBytes: kp.publicKey, privBytes: kp.privateKey };
}

// ---- WebRTC ----
function setupDataChannel(username, peer, channel) {
  channel.binaryType = "arraybuffer";

  channel.onopen = async () => {
    log("DataChannel OPEN (P2P ready) to " + username);
    peer.connected = true;
    updateConnectedPeers();
    await startHandshake(username);
  };

  channel.onmessage = async (ev) => {
    const data = ev.data;
    if (typeof data === "string") {
      try {
        const msg = JSON.parse(data);
        
        // ========== MESSAGE ROUTING HANDLER ==========
        if (msg.type === "routed_message") {
          await handleRoutedMessage(msg.payload);
          return;
        }
        
        // Handle handshake messages
        await onHandshakeMessage(msg, username);
      } catch (e) {
        log(username + ": " + data);
      }
      return;
    }

    const bytes = new Uint8Array(data);
    await onEncryptedPacket(bytes, username);
  };

  channel.onclose = () => {
    log("Disconnected from " + username);
    delete peers[username];
    updateConnectedPeers();
  };
}

function updateConnectedPeers() {
  const list = document.getElementById("connectedPeers");
  if (!list) return;

  list.innerHTML = "";
  for (const username in peers) {
    const peer = peers[username];
    if (peer && (peer.connected || (peer.dc && peer.dc.readyState === "open"))) {
      const item = document.createElement("li");
      item.textContent = username + " (connected)";
      item.style.marginBottom = "6px";
      item.style.padding = "4px 8px";
      item.style.borderRadius = "4px";
      item.style.background = "#e6f7ff";
      item.style.color = "#004a75";
      list.appendChild(item);
    }
  }

  if (!list.hasChildNodes()) {
    const item = document.createElement("li");
    item.textContent = "No connected peers.";
    item.style.color = "#666";
    list.appendChild(item);
  }
}

async function startAsCaller() {

  const pc =
    createPeer(peerUsername, true);

  const offer =
    await pc.createOffer();

  await pc.setLocalDescription(offer);

  ws.send(JSON.stringify({

    type: "offer",
    to: peerUsername,
    sdp: offer

  }));
}


async function onOffer(from, sdp) {
  const pc = createPeer(from, false);
  await pc.setRemoteDescription(sdp);

  const answer =
    await pc.createAnswer();

  await pc.setLocalDescription(answer);

  ws.send(JSON.stringify({

    type: "answer",
    to: from,
    sdp: answer

  }));
}


async function onAnswer(from, sdp) {
  const peer = peers[from];
  if (!peer) return;
  await peer.pc.setRemoteDescription(sdp);
}


async function onIce(from, candidate) {

  const pc =
    peers[from].pc;

  await pc.addIceCandidate(candidate);
}


async function onSignalMessage(msg) {
  if (msg.type === "login_ok") {
    log("Logged in as " + msg.username);
  } else if (msg.type === "lookup_result") {
    // optional usage if you decide to lookup keys
    log("Lookup: " + msg.username + " online=" + msg.online);
  } else if (msg.type === "user_list") {
    updateUserList(msg.users);
  } else if (msg.type === "offer") {
    log("Got offer from " + msg.from);
    await onOffer(msg.from, msg.sdp);
  } else if (msg.type === "answer") {
    log("Got answer from " + msg.from);
    await onAnswer(msg.from, msg.sdp);
  } else if (msg.type === "ice") {
  await onIce(msg.from, msg.candidate);
  } else if (msg.type === "error") {
    log("ERROR: " + msg.message);
  } else {
    log("Unknown signal msg: " + JSON.stringify(msg));
  }
}

function updateUserList(users) {
  const list = document.getElementById("userList");
  const connectSelected = document.getElementById("connectSelected");
  const peerInput = document.getElementById("peer");
  if (!list) return;

  list.innerHTML = "";

  users.forEach((u) => {
    if (u === myUsername) return;

    const opt = document.createElement("option");
    opt.value = u;
    opt.textContent = u;

    list.appendChild(opt);
  });

  if (list.options.length > 0) {
    list.selectedIndex = 0;
    if (peerInput) peerInput.value = list.value;
    if (connectSelected) connectSelected.disabled = false;
  } else {
    if (connectSelected) connectSelected.disabled = true;
  }
}

// ---- Handshake (over DataChannel) ----
//
// We do an authenticated ephemeral DH:
// Identity keys: Ed25519 (crypto_sign)
// Ephemeral DH: X25519 (crypto_kx_keypair)
// Signature binds ephemeral pubkey to identity.
//
// Message types:
// 1) hs_hello: {t, fromUser, ik_pub_b64, eph_pub_b64, nonce_b64, sig_b64}
// 2) hs_ack:   {t, fromUser, ik_pub_b64, eph_pub_b64, nonce_b64, sig_b64}
//
// Sig covers: eph_pub || peer_ik_pub || nonce
//

async function startHandshake(username) {
  const peer = peers[username];
  if (!peer || peer.session.ready) return;

  peer.hs.myEph = sodium.crypto_kx_keypair(); // X25519 eph keys
  peer.hs.nonceLocal = sodium.randombytes_buf(24);

  const msgToSign = sodium.crypto_generichash(32, concatBytes(peer.hs.myEph.publicKey, peer.hs.nonceLocal));
  const sig = sodium.crypto_sign_detached(msgToSign, myIdentity.privBytes);

  const hello = {
    t: "hs_hello",
    fromUser: myUsername,
    ik_pub_b64: myIdentity.pubB64,
    eph_pub_b64: b64enc(peer.hs.myEph.publicKey),
    nonce_b64: b64enc(peer.hs.nonceLocal),
    sig_b64: b64enc(sig)
  };

  peer.dc.send(JSON.stringify(hello));
  log("Handshake: sent hello to " + username);
}

function concatBytes(...arrs) {
  const total = arrs.reduce((s, a) => s + a.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const a of arrs) {
    out.set(a, off);
    off += a.length;
  }
  return out;
}

async function onHandshakeMessage(m, username) {
  if (m.t !== "hs_hello" && m.t !== "hs_ack") return;
  const peer = peers[username];
  if (!peer) return;

  peer.peerIdentityPubBytes = b64dec(m.ik_pub_b64);
  const peerEphPub = b64dec(m.eph_pub_b64);
  const peerNonce = b64dec(m.nonce_b64);
  const sig = b64dec(m.sig_b64);

  const signedHash = sodium.crypto_generichash(32, concatBytes(peerEphPub, peerNonce));
  const ok = sodium.crypto_sign_verify_detached(sig, signedHash, peer.peerIdentityPubBytes);

  if (!ok) {
    log("Handshake FAILED: bad signature from " + username);
    return;
  }

  peer.hs.peerEphPub = peerEphPub;
  peer.hs.nonceRemote = peerNonce;

  if (m.t === "hs_hello") {
    log("Handshake: received hello from " + username + " (signature ok)");

    if (!peer.hs.myEph) {
      peer.hs.myEph = sodium.crypto_kx_keypair();
      peer.hs.nonceLocal = sodium.randombytes_buf(24);
    }

    const ackHash = sodium.crypto_generichash(32, concatBytes(peer.hs.myEph.publicKey, peer.hs.nonceLocal));
    const ackSig = sodium.crypto_sign_detached(ackHash, myIdentity.privBytes);

    const ack = {
      t: "hs_ack",
      fromUser: myUsername,
      ik_pub_b64: myIdentity.pubB64,
      eph_pub_b64: b64enc(peer.hs.myEph.publicKey),
      nonce_b64: b64enc(peer.hs.nonceLocal),
      sig_b64: b64enc(ackSig)
    };

    peer.dc.send(JSON.stringify(ack));
    log("Handshake: sent ack to " + username);
  } else {
    log("Handshake: received ack from " + username + " (signature ok)");
  }

  if (peer.hs.myEph && peer.hs.peerEphPub && peer.hs.nonceLocal && peer.hs.nonceRemote) {
    deriveSessionKeys(username);
  }
}

// ==================== MESSAGE ROUTING HANDLER ====================
async function handleRoutedMessage(incomingMsg) {
  if (!messageRouter) return;

  // Validate and process message
  const result = messageRouter.processMessage(incomingMsg);

  if (!result.processed) {
    log(`[ROUTING] Message rejected: ${result.reason}`);
    return;
  }

  // Message is for us
  if (result.forUs) {
    log(`[ROUTING] Message delivered from ${incomingMsg.from}`);
    log(`  Content: ${incomingMsg.content}`);
    log(`  Path: ${incomingMsg.path.join(" -> ")}`);
    log(`  TTL Remaining: ${messageRouter.getRemainingTtl(incomingMsg)}s`);
    return;
  }

  // Message not for us - relay to other peers
  log(`[ROUTING] Forwarding message to ${incomingMsg.to}`);
  const relayResult = relayForwarder.relayMessage(incomingMsg, Object.keys(peers));
  
  if (relayResult.success && relayResult.relayed.length > 0) {
    log(`[ROUTING] Relayed to ${relayResult.relayed.length} peer(s)`);
  }
}

function deriveSessionKeys(username) {
  const peer = peers[username];
  if (!peer || peer.session.ready) return;

  const iAmClient = myUsername < username;
  let kx;
  if (iAmClient) {
    kx = sodium.crypto_kx_client_session_keys(
      peer.hs.myEph.publicKey,
      peer.hs.myEph.privateKey,
      peer.hs.peerEphPub
    );
  } else {
    kx = sodium.crypto_kx_server_session_keys(
      peer.hs.myEph.publicKey,
      peer.hs.myEph.privateKey,
      peer.hs.peerEphPub
    );
  }

  peer.session.sendKey = kx.sharedTx;
  peer.session.recvKey = kx.sharedRx;
  peer.session.ready = true;
  peer.session.sendCounter = 0n;
  peer.session.recvMaxCounter = -1n;
  log("Handshake COMPLETE with " + username + ". Encryption ON.");
}

// ---- Encrypted messaging ----
// Packet format (binary):
// [0..7]   uint64 counter (little-endian)
// [8..31]  nonce (24 bytes for secretbox) = random or derived
// [32..]   ciphertext = crypto_secretbox_easy(plaintext, nonce, key)
//
// We use secretbox (XSalsa20-Poly1305) for simplicity.
// (It’s secure and easy in libsodium.)

function u64ToLeBytes(xBigInt) {
  const out = new Uint8Array(8);
  let x = xBigInt;
  for (let i = 0; i < 8; i++) {
    out[i] = Number(x & 0xffn);
    x >>= 8n;
  }
  return out;
}

function leBytesToU64(u8) {
  let x = 0n;
  for (let i = 7; i >= 0; i--) {
    x = (x << 8n) | BigInt(u8[i]);
  }
  return x;
}

function encryptMessage(plaintextStr, username) {
  const peer = peers[username];
  if (!peer || !peer.session.ready) return null;

  const pt = sodium.from_string(plaintextStr);
  const nonce = sodium.randombytes_buf(sodium.crypto_secretbox_NONCEBYTES);
  const counter = peer.session.sendCounter;
  peer.session.sendCounter += 1n;

  const ct = sodium.crypto_secretbox_easy(pt, nonce, peer.session.sendKey);
  const counterBytes = u64ToLeBytes(counter);
  return concatBytes(counterBytes, nonce, ct);
}

async function onEncryptedPacket(packetBytes, username) {
  const peer = peers[username];
  if (!peer || !peer.session.ready) {
    log("Got encrypted packet from " + username + " but session not ready yet");
    return;
  }

  if (packetBytes.length < 8 + 24 + 16) {
    log("Bad packet (too small) from " + username);
    return;
  }

  const counterBytes = packetBytes.slice(0, 8);
  const nonce = packetBytes.slice(8, 8 + 24);
  const ct = packetBytes.slice(8 + 24);

  const counter = leBytesToU64(counterBytes);

  if (counter <= peer.session.recvMaxCounter) {
    log("Replay/old packet rejected from " + username + ". counter=" + counter.toString());
    return;
  }

  try {
    const pt = sodium.crypto_secretbox_open_easy(ct, nonce, peer.session.recvKey);
    peer.session.recvMaxCounter = counter;
    const text = sodium.to_string(pt);
    log("RX (decrypted) from " + username + ": " + text);
  } catch (e) {
    log("Decrypt failed from " + username + " (wrong key or tampered packet)");
  }
}

function broadcastMessage(text) {
  for (const username in peers) {
    const peer = peers[username];
    if (!peer || !peer.dc || peer.dc.readyState !== "open") continue;

    if (peer.session.ready) {
      const packet = encryptMessage(text, username);
      if (packet) {
        peer.dc.send(packet.buffer);
        log("TX (encrypted) to " + username + ": " + text);
        continue;
      }
    }

    peer.dc.send(text);
    log("TX (plain) to " + username + ": " + text);
  }
}

// ---- UI handlers ----
document.getElementById("loginBtn").onclick = async () => {
  await sodium.ready;

  myUsername = document.getElementById("me").value.trim();
  if (!myUsername) return;

  myIdentity = await loadOrCreateIdentity(myUsername);
  log("Identity pubkey (b64): " + myIdentity.pubB64.slice(0, 16) + "...");

  // ==================== INITIALIZE MESSAGE ROUTING ====================
  messageRouter = new MessageRouter(myUsername);
  relayForwarder = new RelayForwarder(messageRouter, peers, ws);
  log("[ROUTING] Message router initialized");

  ws = new WebSocket("ws://localhost:8000/ws");

  ws.onopen = () => {
    setStatus("signaling connected");
    // We send identity pubkey to server (optional for now, but good practice)
    wsSend({ type: "login", username: myUsername, ik_pub: myIdentity.pubB64 });
    
    // ==================== START CLEANUP INTERVAL ====================
    startRoutingCleanup();
  };

  ws.onmessage = async (ev) => {
    const msg = JSON.parse(ev.data);
    await onSignalMessage(msg);
  };

  ws.onclose = () => setStatus("signaling disconnected");
};



document.getElementById("connectBtn").onclick = async () => {
  peerUsername = document.getElementById("peer").value.trim();
  if (!peerUsername) return;
  await startAsCaller();
};

const userListSelect = document.getElementById("userList");
const connectSelectedButton = document.getElementById("connectSelected");

if (userListSelect) {
  userListSelect.onchange = () => {
    const selectedUser = userListSelect.value;
    const peerInput = document.getElementById("peer");
    if (peerInput) peerInput.value = selectedUser;
    if (connectSelectedButton) connectSelectedButton.disabled = !selectedUser;
  };
}

if (connectSelectedButton) {
  connectSelectedButton.disabled = true;
}

document.getElementById("connectSelected").onclick = async () => {
  const list = document.getElementById("userList");
  peerUsername = list.value;
  if (!peerUsername) return;
  await startAsCaller();
};

document.getElementById("sendBtn").onclick = () => {
  const text = document.getElementById("msg").value;
  broadcastMessage(text);
  log("TX: " + text);
};

// ==================== MESSAGE ROUTING HELPERS ====================

/**
 * Send a message with routing metadata
 */
function sendRoutedMessage(toPeer, content) {
  if (!messageRouter) {
    log("[ERROR] Message router not initialized");
    return;
  }

  // Create routable message
  const msg = messageRouter.createMessage(toPeer, content, {
    ttl: 300,
    encrypted: false
  });

  log(`[ROUTING] Sending message ${msg.id} to ${toPeer}`);

  // Try direct connection first
  if (peers[toPeer] && peers[toPeer].dc && peers[toPeer].dc.readyState === "open") {
    peers[toPeer].dc.send(JSON.stringify({
      type: "routed_message",
      payload: msg
    }));
    log(`[ROUTING] Sent directly to ${toPeer}`);
    return;
  }

  // Try relay through other peers
  log(`[ROUTING] ${toPeer} not directly connected, attempting relay...`);
  const result = relayForwarder.relayMessage(msg, Object.keys(peers));
  if (result.success) {
    log(`[ROUTING] Message forwarded to relay peers`);
  } else {
    log(`[ROUTING] Relay failed: ${result.reason}`);
  }
}

/**
 * Start periodic cleanup of message and relay caches
 */
function startRoutingCleanup() {
  // Cleanup every 60 seconds
  setInterval(() => {
    if (!messageRouter || !relayForwarder) return;

    try {
      // Cleanup message cache (remove messages older than 5 min)
      messageRouter.messageCache.cleanup(300000);

      // Cleanup relay cache (remove entries older than 10 min)
      relayForwarder.cleanup(600000);

      log("[ROUTING] Cache cleanup completed");
    } catch (e) {
      console.error("Cleanup error:", e);
    }
  }, 60000);
}

/**
 * Display routing statistics (for debugging)
 */
function showRoutingStats() {
  if (!messageRouter || !relayForwarder) {
    console.log("Routing not initialized");
    return;
  }

  const stats = {
    username: myUsername,
    cached_messages: messageRouter.messageCache.cache.size,
    relay_cache_size: relayForwarder.relayCache.size,
    connected_peers: Object.keys(peers).filter(p => peers[p].connected).length,
    default_ttl: messageRouter.defaultTtl
  };

  console.table(stats);
  return stats;
}