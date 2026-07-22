import WebSocket from 'ws';

const ws = new WebSocket('ws://localhost:8080');

ws.on('open', () => {
  console.log('open');
  const packet = {
    type: 'REGISTER',
    payload: {
      peerId: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      username: 'alice',
      publicKey: 'AAA='
    }
  };
  console.log('sending', packet);
  ws.send(JSON.stringify(packet));
});

ws.on('message', (msg) => {
  console.log('message', msg.toString());
  ws.close();
});

ws.on('error', (err) => {
  console.error('error', err);
});

ws.on('close', () => {
  console.log('closed');
});
