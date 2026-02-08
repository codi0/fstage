export function createGestureHandler(opts = {}) {
	const { container, store, storeKey, env, animator } = opts;
	
	if (!container || !store || !storeKey || !animator) {
		throw new Error('createGestureHandler requires container, store, storeKey, and animator');
	}

	let isActive = false;
	let gestureDetector = null;

	// Only setup if gestures are enabled
	const caps = env?.getPolicy ? env.getPolicy('caps') : {};
	
	if (!caps.swipeBack) {
		return { destroy: () => {} };
	}

	gestureDetector = new GestureDetector(container, {
		onProgress: (data) => {
			if (isActive) return;

			const entering = container.children[container.children.length - 2];
			const leaving = container.lastElementChild;

			if (entering && leaving) {
				isActive = true;
				animator.gestureTransition(entering, leaving, data.progress);
			}
		},

		onEnd: async (data) => {
			if (!isActive) return;

			const entering = container.children[container.children.length - 2];
			const leaving = container.lastElementChild;
			const policy = env?.getPolicy ? env.getPolicy() : {};
			const motion = policy.motion || {};

			if (data.shouldComplete) {
				// Complete gesture animation
				await animator.finishGesture(entering, leaving, true, {
					duration: motion.durationNormal || 220,
					easing: motion.easing || 'ease'
				});

				animator.cleanup(entering, leaving);

				// Emit intent via state change
				const current = store.get(storeKey);
				store.set(storeKey, {
					...current,
					actionType: 'gesture',
					direction: 'back',
					// Trigger router back by changing to previous route
					// This is handled by router's own history management
				});
				
				// Actually go back in history
				// This is the one allowed "escape hatch" - gestures trigger browser back
				history.back();
			} else {
				// Cancel gesture
				await animator.finishGesture(entering, leaving, false, {
					duration: motion.durationNormal || 220,
					easing: motion.easing || 'ease'
				});

				animator.cleanup(entering, leaving);
			}

			isActive = false;
		}
	});

	return {
		destroy: () => {
			if (gestureDetector) {
				gestureDetector.destroy();
			}
		}
	};
}

class GestureDetector {
	constructor(element, callbacks = {}) {
		this.el = element;
		this.callbacks = callbacks;
		this.startX = 0;
		this.startY = 0;
		this.currentX = 0;
		this.currentY = 0;
		this.startTime = 0;
		this.tracking = false;
		this.direction = null;
		this.threshold = 10;

		this.onTouchStart = this.onTouchStart.bind(this);
		this.onTouchMove = this.onTouchMove.bind(this);
		this.onTouchEnd = this.onTouchEnd.bind(this);

		element.addEventListener('touchstart', this.onTouchStart, { passive: true });
		element.addEventListener('touchmove', this.onTouchMove, { passive: false });
		element.addEventListener('touchend', this.onTouchEnd);
		element.addEventListener('touchcancel', this.onTouchEnd);
	}

	onTouchStart(e) {
		const touch = e.touches[0];
		this.startX = touch.clientX;
		this.startY = touch.clientY;
		this.currentX = touch.clientX;
		this.currentY = touch.clientY;
		this.startTime = Date.now();
		this.tracking = true;
		this.direction = null;
	}

	onTouchMove(e) {
		if (!this.tracking) return;

		const touch = e.touches[0];
		this.currentX = touch.clientX;
		this.currentY = touch.clientY;

		const deltaX = this.currentX - this.startX;
		const deltaY = this.currentY - this.startY;

		// Determine direction once
		if (!this.direction && (Math.abs(deltaX) > this.threshold || Math.abs(deltaY) > this.threshold)) {
			this.direction = Math.abs(deltaX) > Math.abs(deltaY) ? 'horizontal' : 'vertical';
		}

		// Horizontal swipe
		if (this.direction === 'horizontal' && deltaX > 0) {
			// Only from left edge
			if (this.startX < 20) {
				e.preventDefault();
				
				if (this.callbacks.onProgress) {
					const progress = Math.min(deltaX / window.innerWidth, 1);
					this.callbacks.onProgress({
						progress,
						deltaX,
						deltaY
					});
				}
			}
		}
	}

	onTouchEnd(e) {
		if (!this.tracking) return;

		const deltaX = this.currentX - this.startX;
		const deltaY = this.currentY - this.startY;
		const deltaTime = Date.now() - this.startTime;
		const velocity = Math.abs(deltaX) / deltaTime;

		this.tracking = false;

		// Swipe from left edge
		if (this.direction === 'horizontal' && deltaX > 0 && this.startX < 20) {
			const threshold = window.innerWidth * 0.3;
			const shouldComplete = deltaX > threshold || velocity > 0.5;

			if (this.callbacks.onEnd) {
				this.callbacks.onEnd({
					shouldComplete,
					deltaX,
					deltaY,
					velocity
				});
			}
		}
	}

	destroy() {
		this.el.removeEventListener('touchstart', this.onTouchStart);
		this.el.removeEventListener('touchmove', this.onTouchMove);
		this.el.removeEventListener('touchend', this.onTouchEnd);
		this.el.removeEventListener('touchcancel', this.onTouchEnd);
	}
}