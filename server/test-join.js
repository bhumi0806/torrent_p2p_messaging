import WebSocket from 'ws';

function makeClient(id, username) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket('ws://localhost:8080');
    ws.on('open', () => {
      console.log(`${username} open`);
      ws.send(JSON.stringify({ type: 'REGISTER', payload: { peerId: id, username, publicKey: 'AAA=' } }));
    });
    ws.on('message', (msg) => {
      console.log(`${username} message`, msg.toString());
    });
    ws.on('error', (err) => {
      console.error(`${username} error`, err);
      reject(err);
    });
    ws.on('close', () => console.log(`${username} closed`));
    resolve(ws);
  });
}

(async () => {
  const alice = await makeClient('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 'alice');
  setTimeout(async () => {
    const bob = await makeClient('bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', 'bob');
    setTimeout(() => {
      alice.close();
      bob.close();
    }, 3000);
  }, 1000);
})();
