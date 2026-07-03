/**
 * @fstage/plugin — test suite
 */

import { createPluginManager } from '../index.mjs';
import { createRunner, assert, assertEqual, assertRejects } from '../../../../tests/runner.mjs';

function toDataUrl(source) {
	return `data:text/javascript;charset=utf-8,${encodeURIComponent(source)}`;
}

function createManager(overrides={}) {
	const hostLog = [];
	const hostFacade = {
		can(id) { return id === 'host.echo'; },
		capability(id) {
			if(id !== 'host.echo') throw new Error(`Unknown capability: ${id}`);
			return function(value) {
				hostLog.push(value);
				return value;
			};
		},
	};
	const manager = createPluginManager({
		createHostFacade() { return hostFacade; },
		...(overrides || {}),
	});
	return { manager, hostLog };
}

export async function runTests() {
	const runner = createRunner('plugin');
	const { suite, test, summary } = runner;

	await suite('definition + source registration', async () => {
		await test('registers source and exposes normalized manifest', () => {
			const { manager } = createManager();
			const source = manager.registerSource({
				manifest: { id: 'plugin.alpha', name: 'Alpha', dependsOn: ['plugin.beta', 'plugin.beta', ''] },
				moduleUrl: toDataUrl('export default { async activate() {} }'),
				meta: { origin: 'test' },
			});
			assertEqual(source.id, 'plugin.alpha');
			assertEqual(source.manifest.dependsOn, ['plugin.beta']);
			assertEqual(source.meta.origin, 'test');
		});

		await test('rejects modules without default export definition', async () => {
			const { manager } = createManager();
			manager.registerSource({
				manifest: { id: 'plugin.invalid' },
				moduleUrl: toDataUrl('export async function activate() {}'),
			});
			await assertRejects(() => manager.activate('plugin.invalid'), 'Expected invalid module to reject');
		});
	});

	await suite('activation lifecycle', async () => {
		await test('activates, exposes host access, and cleans up on deactivate', async () => {
			const { manager, hostLog } = createManager();
			const log = [];
			manager.registerSource({
				manifest: { id: 'plugin.lifecycle' },
				moduleUrl: toDataUrl(`
					export default {
						async activate(ctx) {
							ctx.handlers.register('plugin.lifecycle.echo', async (payload) => payload.value);
							ctx.contributions.register('plugin.menu', { id: 'plugin.lifecycle.item', label: 'Item' });
							ctx.events.on('app.tick', (event) => globalThis.__pluginLog.push('event:' + event.step));
							ctx.cleanup(() => globalThis.__pluginLog.push('cleanup'));
							if(ctx.can('host.echo')) ctx.host.capability('host.echo')('host:ok');
							globalThis.__pluginLog.push('activate');
						},
						async deactivate() {
							globalThis.__pluginLog.push('deactivate');
						}
					}
				`),
			});
			globalThis.__pluginLog = log;
			try {
				await manager.activate('plugin.lifecycle');
				assertEqual(await manager.callHandler('plugin.lifecycle.echo', { value: 7 }), 7);
				assertEqual(manager.listContributions('plugin.menu').length, 1);
				manager.emit('app.tick', { step: 1 });
				assertEqual(hostLog, ['host:ok']);
				assertEqual(log, ['activate', 'event:1']);

				await manager.deactivate('plugin.lifecycle');
				assertEqual(log, ['activate', 'event:1', 'deactivate', 'cleanup']);
				assertEqual(manager.listContributions('plugin.menu').length, 0);
				await assertRejects(() => manager.callHandler('plugin.lifecycle.echo', {}), 'Expected handler to be removed');
				manager.emit('app.tick', { step: 2 });
				assertEqual(log, ['activate', 'event:1', 'deactivate', 'cleanup']);
			} finally {
				delete globalThis.__pluginLog;
			}
		});

		await test('rolls back partial activation state on failure', async () => {
			const { manager } = createManager();
			const log = [];
			globalThis.__pluginFailLog = log;
			manager.registerSource({
				manifest: { id: 'plugin.fail' },
				moduleUrl: toDataUrl(`
					export default {
						async activate(ctx) {
							ctx.handlers.register('plugin.fail.echo', async () => 'never');
							ctx.contributions.register('plugin.menu', { id: 'plugin.fail.item' });
							ctx.events.on('app.tick', () => globalThis.__pluginFailLog.push('event'));
							ctx.cleanup(() => globalThis.__pluginFailLog.push('cleanup'));
							throw new Error('boom');
						}
					}
				`),
			});
			try {
				await assertRejects(() => manager.activate('plugin.fail'), 'Expected activation failure');
				assertEqual(log, ['cleanup']);
				assert(manager.isActive('plugin.fail') === false, 'Plugin should not remain active');
				assertEqual(manager.listContributions('plugin.menu').length, 0);
				await assertRejects(() => manager.callHandler('plugin.fail.echo', {}), 'Expected failed handler rollback');
				manager.emit('app.tick', {});
				assertEqual(log, ['cleanup']);
			} finally {
				delete globalThis.__pluginFailLog;
			}
		});
	});

	await suite('dependency + access control', async () => {
		await test('activates dependencies first', async () => {
			const { manager } = createManager();
			const order = [];
			globalThis.__pluginOrder = order;
			manager.registerSource({ manifest: { id: 'plugin.dep' }, moduleUrl: toDataUrl(`export default { async activate() { globalThis.__pluginOrder.push('dep'); } }`) });
			manager.registerSource({ manifest: { id: 'plugin.main', dependsOn: ['plugin.dep'] }, moduleUrl: toDataUrl(`export default { async activate() { globalThis.__pluginOrder.push('main'); } }`) });
			try {
				await manager.activate('plugin.main');
				assertEqual(order, ['dep', 'main']);
			} finally {
				delete globalThis.__pluginOrder;
			}
		});

		await test('blocks internal handlers from other plugins but allows host', async () => {
			const { manager } = createManager();
			manager.registerSource({
				manifest: { id: 'plugin.owner' },
				moduleUrl: toDataUrl(`
					export default {
						async activate(ctx) {
							ctx.handlers.register('plugin.internal.secret', async () => 'secret');
						}
					}
				`),
			});
			manager.registerSource({ manifest: { id: 'plugin.caller' }, moduleUrl: toDataUrl('export default { async activate() {} }') });
			await manager.activate('plugin.owner');
			await manager.activate('plugin.caller');
			assertEqual(await manager.callHandler('plugin.internal.secret', {}, 'host'), 'secret');
			await assertRejects(() => manager.callHandler('plugin.internal.secret', {}, 'plugin.caller'), 'Expected internal handler call to be blocked');
		});

		await test('enforces contribution ownership', async () => {
			const { manager } = createManager();
			manager.registerSource({
				manifest: { id: 'plugin.owner' },
				moduleUrl: toDataUrl(`
					export default {
						async activate(ctx) {
							ctx.contributions.register('plugin.menu', { id: 'owned.item', label: 'Owned' });
						}
					}
				`),
			});
			manager.registerSource({
				manifest: { id: 'plugin.thief' },
				moduleUrl: toDataUrl(`
					export default {
						async activate(ctx) {
							ctx.contributions.remove('plugin.menu', 'owned.item');
						}
					}
				`),
			});
			await manager.activate('plugin.owner');
			await assertRejects(() => manager.activate('plugin.thief'), 'Expected ownership enforcement');
			assertEqual(manager.listContributions('plugin.menu').map((item) => item.id), ['owned.item']);
		});
	});

	return summary();
}
