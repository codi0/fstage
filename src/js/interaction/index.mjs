// @fstage/interaction
//
// Router:
//   - Owns history
//   - Emits direction via router.after(match, location)
//
// Interaction:
//   - Orchestrates mount / activate / animate / unmount
//   - Never duplicates navigation stack
//   - Never wraps history
//   - Guarantees max 2 mounted screens
//   - Cancels safely under rapid navigation
//   - Direction aware (push / replace / back / forward / init)
//
// Native Feel Guarantees:
//   - Scroll restoration handled via location.state
//   - Direction-sensitive animations
//   - Proper cancellation
//   - No DOM accumulation
//   - Gesture-ready foundation
//

// --------------------------------------------------
// TRANSITION ENGINE (Core)
// --------------------------------------------------

export function createTransitionEngine() {

	let screenHost = null;
	let animator = null;

	let current = null;        // current entry
	let active = null;         // active animation handle
	let transitionId = 0;      // monotonic guard

	function ensureWired() {
		if (!screenHost) {
			throw new Error('TransitionEngine requires screenHost');
		}
	}

	function cancelActive() {
		if (!active) return;
		try { active.cancel?.(); } catch {}
		active = null;
	}

	async function transitionTo(nextEntry, meta) {

		ensureWired();

		meta = meta || {};
		const mode = meta.mode || 'push';
		const id = ++transitionId;

		// cancel running transition
		cancelActive();

		const from = current;
		const to = nextEntry;

		// mount new
		await screenHost.mount(to);

		// activate new immediately (simplifies CSS)
		await screenHost.activate(to);

		// restore scroll if available
		if (to.location?.state?.scroll != null) {
			await screenHost.restore?.(to, { scrollTop: to.location.state.scroll });
		}

		// deactivate previous (lifecycle only)
		if (from) {
			await screenHost.deactivate(from);
		}

		// start animation
		let handle = null;

		if (animator?.start) {
			handle = animator.start({
				type: mode,
				from,
				to,
				interactive: false
			});
		}

		active = {
			cancel() {
				try { handle?.cancel?.(); } catch {}
			}
		};

		// wait animation
		if (handle?.finished) {
			try {
				await handle.finished;
			} catch {}
		}

		// if a newer transition started, abort cleanup
		if (id !== transitionId) return;

		// unmount old
		if (from) {
			await screenHost.unmount(from);
		}

		current = to;
		active = null;
	}

	return {

		setScreenHost(host) {
			screenHost = host;
			return this;
		},

		setAnimator(anim) {
			animator = anim;
			return this;
		},

		transitionTo,

		getCurrent() {
			return current;
		}
	};
}


// --------------------------------------------------
// NAVIGATION ADAPTER (Router Integration)
// --------------------------------------------------

export function createNavigationInteraction(options) {

	options = options || {};

	const router = options.router;
	const engine = options.engine;

	if (!router) throw new Error('NavigationInteraction requires router');
	if (!engine) throw new Error('NavigationInteraction requires engine');

	function deriveMode(location) {
		if (location) {
			if (location.action === 'back') return 'pop';
			if (location.action === 'replace') return 'replace';
			if (location.action === 'init') return 'init';
		}

		return 'push';
	}

	function makeEntry(match, location) {
		return {
			key: location?.state?.__rid || 
			     Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6),
			match,
			location
		};
	}

	function onNavigate(match, location) {

		const mode = deriveMode(location);
		const entry = makeEntry(match, location);

		engine.transitionTo(entry, { mode });
	}

	return {

		start() {
			router.after(onNavigate);
			return this;
		},

		engine() {
			return engine;
		}
	};
}
