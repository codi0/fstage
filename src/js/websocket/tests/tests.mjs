import { createWebsocket } from '../index.mjs';
import { createRunner, assert, assertEqual } from '../../../../tests/runner.mjs';


function sleep(ms) {
	return new Promise(function(resolve) { setTimeout(resolve, ms); });
}


function installMockWebSocket() {
	const originalWs = globalThis.WebSocket;

	class MockWebSocket {
		static instances = [];

		constructor(url, protocols) {
			this.url = url;
			this.protocols = protocols;
			this.sent = [];
			this.handlers = {};
			MockWebSocket.instances.push(this);
		}

		addEventListener(type, fn) {
			this.handlers[type] = this.handlers[type] || [];
			this.handlers[type].push(fn);
		}

		emit(type, event) {
			event = event || {};
			const list = this.handlers[type] || [];
			for (var i = 0; i < list.length; i++) list[i](event);
		}

		send(data) {
			this.sent.push(data);
		}

		close(code, reason) {
			this.emit('close', { code: code || 1000, reason: reason || '' });
		}
	}

	globalThis.WebSocket = MockWebSocket;

	return {
		MockWebSocket: MockWebSocket,
		restore: function() {
			globalThis.WebSocket = originalWs;
		}
	};
}


export async function runTests() {
	const runner = createRunner('websocket');
	const { suite, test, summary } = runner;

	await suite('createWebsocket()', async () => {

		await test('flushes queued messages on open', () => {
			const mock = installMockWebSocket();
			try {
				const ws = createWebsocket('http://example.com', { open: false });
				ws.send('queued');
				ws.open();
				const conn = mock.MockWebSocket.instances[0];
				conn.emit('open', {});
				assertEqual(conn.sent.length, 1);
				assertEqual(conn.sent[0], 'queued');
			} finally {
				mock.restore();
			}
		});

		await test('calls all raw message listeners', () => {
			const mock = installMockWebSocket();
			try {
				const ws = createWebsocket('http://example.com', { open: true });
				const conn = mock.MockWebSocket.instances[0];
				conn.emit('open', {});
				let a = 0, b = 0;
				ws.on('message', function() { a++; });
				ws.on('message', function() { b++; });
				conn.emit('message', { data: JSON.stringify({ event: 'noop' }) });
				assertEqual(a, 1);
				assertEqual(b, 1);
			} finally {
				mock.restore();
			}
		});

		await test('unsubscribe sends unsubscribe event to server', () => {
			const mock = installMockWebSocket();
			try {
				const ws = createWebsocket('http://example.com', { open: true });
				const conn = mock.MockWebSocket.instances[0];
				conn.emit('open', {});

				const listener = function() {};
				ws.subscribe('tasks', listener);
				ws.unsubscribe('tasks', listener);

				const events = conn.sent.map(function(payload) {
					return JSON.parse(payload).event;
				});

				assert(events.includes('subscribe'));
				assert(events.includes('unsubscribe'));
			} finally {
				mock.restore();
			}
		});

		await test('retries reset after a successful reconnect', async () => {
			const mock = installMockWebSocket();
			try {
				createWebsocket('http://example.com', {
					open: true,
					wait: 1,
					retries: 1,
				});
				const ws1 = mock.MockWebSocket.instances[0];
				ws1.emit('open', {});
				ws1.emit('close', { code: 1011 });
				await sleep(5);

				const ws2 = mock.MockWebSocket.instances[1];
				ws2.emit('open', {});
				ws2.emit('close', { code: 1011 });
				await sleep(5);

				assert(mock.MockWebSocket.instances.length >= 3, 'expected a second reconnect attempt after successful open');
			} finally {
				mock.restore();
			}
		});

	});

	return summary();
}
