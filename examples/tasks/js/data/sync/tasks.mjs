import { defaultRegistry } from '@fstage/registry';

const registry    = defaultRegistry();
const store       = registry.get('store');
const syncManager = registry.get('syncManager');
const config      = registry.get('config') || {};

// All writes go through store.$set/merge/del → $operation mutate → syncManager.
// Never bypass this chain — it keeps in-memory store and IDB in sync.
store.$operation('tasks', {

	ttl:        5 * 60 * 1000,
	optimistic: true,

	fetch(ctx) {
		return syncManager.read('tasks', {
			default: {},
			refresh: ctx.refresh,
			signal:  ctx.signal,
			remote:  config.api && config.api.tasks && {
				key:      'tasks',
				uri:      config.api.tasks,
				dataPath: 'records',
				keyPath:  'id',
			},
		});
	},

	mutate(ctx) {
		// ctx.path may be a leaf ('tasks.abc.priority') or a record path ('tasks.abc').
		// Remote always wants the full record — read from in-memory store (already
		// updated synchronously) rather than IDB (async, not yet flushed).
		const parts    = ctx.path.split('.');
		const recordId = parts[1];
		const recPath  = recordId ? 'tasks.' + recordId : ctx.path;
		const remote   = config.api && config.api.tasks && {
			key:      'tasks',
			uri:      config.api.tasks,
			dataPath: 'record',
		};

		// Record delete: local record is already gone, so send explicit delete.
		if (ctx.action === 'remove' && parts.length === 2 && recordId) {
			return syncManager.write(recPath, undefined, {
				skipLocal: true,
				delete:    true,
				id:        recordId,
				remote:    remote,
			});
		}

		const rec = store.$get(recPath);

		if (!rec) return;

		// skipLocal: $operation already wrote locally — avoid double-write
		// and the re-triggering of mutate that would cause.
		return syncManager.write(recPath, rec, {
			skipLocal: true,
			remote:    remote,
			idPath: 'data.id',
		});
	},

	onError(err, ctx) {
		console.error('[tasks] mutation failed', ctx.path, err);
	},

});
