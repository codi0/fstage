import { createAnimator } from '../animator/index.mjs';

// ==============================
// INTENT DETECTION
// ==============================

export function detectIntent(prev, next) {
	// Navigation change
	if (!prev || prev.name !== next.name) {
		return {
			type: 'navigation',
			from: prev ? prev.name : null,
			to: next.name,
			direction: next.direction || 'forward',
			action: next.action || 'trigger'
		};
	}

	return null;
}

// ==============================
// BEHAVIOR RESOLUTION
// ==============================

export function resolveBehavior(intent, policy = {}) {
	if (intent && intent.type === 'navigation') {
		const nav = policy.navigation || {};
		const motion = policy.motion || {};
		const model = nav.model || 'default';
		const os = policy.platform?.os || '';

		// Stack model (mobile)
		if (model === 'stack') {
			if (os === 'ios') {
				return {
					type: 'transition',
					name: intent.direction === 'back' ? 'slide-right' : 'slide-left',
					duration: motion.durationNormal || 220,
					easing: motion.easing || 'cubic-bezier(0.25,1,0.5,1)'
				};
			}
			
			if (os === 'android') {
				return {
					type: 'transition',
					name: 'fade',
					duration: motion.durationNormal || 200,
					easing: motion.easing || 'cubic-bezier(0.4,0.0,0.2,1)'
				};
			}
		}

		// Default
		return {
			type: 'transition',
			name: 'fade',
			duration: motion.durationNormal || 150,
			easing: motion.easing || 'ease'
		};
	}

	return null;
}

// ==============================
// INTERACTION OBSERVER
// ==============================

export function createInteraction(key, opts = {}) {
	const store = opts.store;
	const executor = opts.executor;
	const env = opts.env || {};

	if (!store || !executor) {
		throw new Error('createInteraction requires store and executor');
	}

	let prev = store.get(key);

	// Subscribe to state changes
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

// ==============================
// BASIC EXECUTOR FACTORY
// ==============================

export function createExecutor(container) {
	const animator = createAnimator(container);

	return async function execute(spec) {
		animator.cancel();

		const entering = container.lastElementChild;
		const leaving = container.children[container.children.length - 2];

		if (spec.name === 'slide-left' || spec.name === 'slide-right') {
			const direction = spec.name === 'slide-left' ? 'left' : 'right';
			await animator.slide(entering, leaving, direction, spec);
		} else if (spec.name === 'fade') {
			await animator.fade(entering, leaving, spec);
		}

		animator.cleanup(entering, leaving);
	};
}

// ==============================
// PRE-BUILT BEHAVIORS
// Behavior signature: (animator, element, spec) => Promise
// ==============================

export const Behaviors = {
	
	// Slide transitions
	slideDown: (animator, el, spec) => {
		return animator.slide(el, null, 'down', spec);
	},
	
	slideUp: (animator, el, spec) => {
		return animator.slide(el, null, 'up', spec);
	},
	
	slideLeft: (animator, el, spec) => {
		return animator.slide(el, null, 'left', spec);
	},
	
	slideRight: (animator, el, spec) => {
		return animator.slide(el, null, 'right', spec);
	},
	
	// Fade
	fadeIn: (animator, el, spec) => {
		if (el) el.style.opacity = '0';
		return animator.fade(el, null, spec);
	},
	
	fadeOut: (animator, el, spec) => {
		return animator.fade(null, el, spec);
	},
	
	// Scale
	scaleIn: (animator, el, spec) => {
		return animator.scale(el, null, spec);
	},
	
	scaleOut: (animator, el, spec) => {
		return animator.scale(null, el, spec);
	},
	
	// Height transitions (for expand/collapse)
	expand: (animator, el, spec) => {
		return animator.height(el, true, spec);
	},
	
	collapse: (animator, el, spec) => {
		return animator.height(el, false, spec);
	},
	
	// Shake (error feedback)
	shake: (animator, el, spec) => {
		return animator.shake(el, spec);
	},
	
	// Pulse (attention)
	pulse: (animator, el, spec) => {
		return animator.pulse(el, spec);
	}
};