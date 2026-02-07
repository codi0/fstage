function detectIntent(prev, next) {

	// Navigation change
	if (!prev || prev.name !== next.name) {

		return {
			type: 'navigation',
			from: prev ? prev.name : null,
			to: next.name,
			direction: next.direction || 'forward',
			actionType: next.actionType || 'trigger'
		};

	}

	return null;

}

function resolveBehavior(intent, policy = {}) {
	
	if (intent && intent.type === 'navigation') {

		const nav = policy.navigation || {};
		const model = nav.model || 'default';

		// Cupertino-style behaviour
		if (model === 'cupertino') {

			return {
				type: 'transition',
				name: intent.direction === 'back' ? 'slide-right' : 'slide-left',
				duration: nav.durationNormal || 220
			};

		}

		// Material-style behaviour
		if (model === 'material') {

			return {
				type: 'transition',
				name: 'fade',
				duration: nav.durationNormal || 200
			};

		}

		// Default minimal behaviour
		return {
			type: 'transition',
			name: 'fade',
			duration: 150
		};
		
	}
	
	return null;

}

export function createInteraction(opts = {}) {

	const key = opts.key || 'route';
	const store = opts.store;
	const executor = opts.executor;
	const env = opts.env || {};

	let prev = store.get(key);

	// ==============================
	// Subscribe to state changes
	// ==============================

	return store.onChange(key, function(e) {

		const intent = detectIntent(prev, e.val);

		if (!intent) {
			prev = e.val;
			return;
		}

		const policy = env.getPolicy ? env.getPolicy() : {};

		const behavior = resolveBehavior(intent, policy);

		if (behavior) {
			executor(behavior);
		}

		prev = e.val;
	});

}

export function createExecutor(el) {

	return function(spec) {

		const entering = el.lastElementChild;
		const leaving = el.children[el.children.length - 2];

		if (entering) {
			entering.setAttribute('data-nav-state', 'entering');
			entering.setAttribute('data-nav-transition', spec.name);
		}

		if (leaving) {
			leaving.setAttribute('data-nav-state', 'leaving');
			leaving.setAttribute('data-nav-transition', spec.name);
		}

		const token = Symbol();
		el._navToken = token;

		setTimeout(() => {

			if (el._navToken !== token) return;

			const entering = el.lastElementChild;
			const leaving = el.children[el.children.length - 2];

			if (entering) {
				entering.removeAttribute('data-nav-state');
				entering.removeAttribute('data-nav-transition');
			}

			if (leaving) {
				leaving.remove();
			}

		}, spec.duration);

	};

}