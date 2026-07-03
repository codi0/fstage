# WebSocket

`@fstage/websocket` is a small browser WebSocket helper. It opens a connection, reconnects after unexpected closes, queues sends while disconnected, and supports JSON event and channel helpers.

Use it when your app needs a simple client-side realtime connection without bringing in a larger protocol layer.

---

## createWebsocket(url, opts?)

```js
import { createWebsocket } from '@fstage/websocket';

const socket = createWebsocket('https://example.com/realtime', {
  retries: 20,
  wait:    1000,
});
```

`http://` and `https://` URLs are converted to `ws://` and `wss://`. The connection opens immediately unless `open: false` is passed.

| Option | Default | Description |
|--------|---------|-------------|
| `protocols` | `[]` | WebSocket subprotocols passed to `new WebSocket()`. |
| `retries` | `50` | Maximum reconnect attempts after an unexpected close. |
| `wait` | `2000` | Delay between reconnect attempts in ms. |
| `open` | `true` | Open immediately. Set `false` to call `socket.open()` later. |

All methods return the socket API for chaining.

---

## Raw socket events

```js
socket
  .on('open', function(e) { ... })
  .on('message', function(e) { ... })
  .on('error', function(e) { ... })
  .on('close', function(e) { ... });

socket.off('message', listener);
```

`close(1000)` is treated as intentional and does not reconnect. Other close codes reconnect until `retries` is reached.

---

## Sending

```js
socket.send('raw text');

socket.send({ type: 'ping' }, { encode: true });

socket.trigger('refresh', { id: 'tasks' });
```

- `send(data)` sends raw data when connected.
- `send(data, { encode: true })` sends `JSON.stringify(data)`.
- Sends made while disconnected are queued and flushed after reconnect.
- `trigger(event, data)` sends `{ event, data }` as JSON.

---

## Custom events

Incoming JSON messages with an `event` property are dispatched to matching listeners:

```js
socket.on('refresh', function(data, rawEvent) {
  console.log(data);
});
```

For this to work, the server should send JSON like:

```json
{ "event": "refresh", "data": { "id": "tasks" } }
```

---

## Channels

```js
socket.subscribe('tasks', function(data) {
  console.log('published task data', data);
});

socket.publish('tasks', { id: 'abc', title: 'Write docs' });

socket.unsubscribe('tasks', listener);
```

`subscribe(channel, listener)` listens for incoming `publish` events for that channel and sends `{ event: 'subscribe', channel }` to the server. `publish(channel, data)` sends `{ event: 'publish', channel, data }`.

---

## Cleanup

```js
socket.close();
```

The helper also closes on `beforeunload` when that browser event is available. For component-owned sockets, call `close()` from lifecycle cleanup so reconnect timers do not outlive the component.
