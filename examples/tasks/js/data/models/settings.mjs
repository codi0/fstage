import { defaultRegistry } from '@fstage/registry';

const registry = defaultRegistry();
const store = registry.get('store');
const models = registry.get('models');

models.set('settings', {
	setTheme(theme) {
		store.$merge('settings', { theme: theme });
	},
});
