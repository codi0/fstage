import { createWebpush } from '../index.mjs';
import { createRunner, assertEqual } from '../../../../tests/runner.mjs';


function withNoPushSupport(fn) {
	const prevPush = globalThis.PushManager;
	try {
		Object.defineProperty(globalThis, 'PushManager', {
			value: undefined,
			configurable: true,
			writable: true
		});
		return fn();
	} finally {
		Object.defineProperty(globalThis, 'PushManager', {
			value: prevPush,
			configurable: true,
			writable: true
		});
	}
}


export async function runTests() {
	const runner = createRunner('webpush');
	const { suite, test, summary } = runner;

	await suite('createWebpush()', async () => {

		await test('subscribe resolves false when push is unsupported', async () => {
			await withNoPushSupport(async function() {
				const api = createWebpush();
				api.init('/push', 'SGVsbG8');
				const res = await api.subscribe('news');
				assertEqual(res, false);
			});
		});

		await test('unsubscribe resolves false when push is unsupported', async () => {
			await withNoPushSupport(async function() {
				const api = createWebpush();
				api.init('/push', 'SGVsbG8');
				const res = await api.unsubscribe('news');
				assertEqual(res, false);
			});
		});

		await test('close resolves false when push is unsupported', async () => {
			await withNoPushSupport(async function() {
				const api = createWebpush();
				api.init('/push', 'SGVsbG8');
				const res = await api.close('news');
				assertEqual(res, false);
			});
		});

	});

	return summary();
}
