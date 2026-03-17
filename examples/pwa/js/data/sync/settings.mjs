import { defaultRegistry } from '@fstage/registry';

const registry    = defaultRegistry();
const store       = registry.get('store');
const syncManager = registry.get('syncManager');

store.$operation('settings', {

	fetch(ctx) {
		return syncManager.read('settings', {
			default: { theme: 'auto' },
			// No remote — settings are local-only.
		});
	},

	mutate(ctx) {
		return syncManager.write('settings', ctx.val, {
			skipLocal: true,
			// No remote — settings are local-only.
		});
	},

});
