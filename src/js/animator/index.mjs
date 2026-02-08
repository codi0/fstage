export function createAnimator(el) {
	return new Animator(el);
}

class Animator {
	constructor(element) {
		this.el = element;
		this.currentAnimation = null;
	}

	/**
	 * Slide transition
	 * @param {Element} entering - Element entering viewport
	 * @param {Element} leaving - Element leaving viewport  
	 * @param {string} direction - 'left'|'right'|'up'|'down'
	 * @param {Object} config - { duration, easing }
	 */
	async slide(entering, leaving, direction = 'left', config = {}) {
		const { duration = 220, easing = 'ease' } = config;
		
		const transforms = {
			'left': { enter: '100%', leave: '-20%' },
			'right': { enter: '-20%', leave: '100%' },
			'up': { enter: '100%', leave: '-20%', axis: 'Y' },
			'down': { enter: '-20%', leave: '100%', axis: 'Y' }
		};
		
		const t = transforms[direction] || transforms.left;
		const axis = t.axis || 'X';
		const isForward = direction === 'left' || direction === 'down';
		
		const animations = [];

		if (entering) {
			this._prepareElement(entering);
			
			const enterAnim = entering.animate([
				{ 
					transform: `translate${axis}(${isForward ? t.enter : t.leave})`,
					opacity: isForward ? 1 : 0
				},
				{ 
					transform: `translate${axis}(0)`,
					opacity: 1
				}
			], {
				duration,
				easing,
				fill: 'forwards'
			});
			
			animations.push(enterAnim);
		}

		if (leaving) {
			const leaveAnim = leaving.animate([
				{ 
					transform: `translate${axis}(0)`,
					opacity: 1
				},
				{ 
					transform: `translate${axis}(${isForward ? t.leave : t.enter})`,
					opacity: isForward ? 1 : 0
				}
			], {
				duration,
				easing,
				fill: 'forwards'
			});
			
			animations.push(leaveAnim);
		}

		this.currentAnimation = Promise.all(animations.map(a => a.finished));
		await this.currentAnimation;
	}

	/**
	 * Fade transition
	 * @param {Element} entering - Element fading in
	 * @param {Element} leaving - Element fading out
	 * @param {Object} config - { duration, easing }
	 */
	async fade(entering, leaving, config = {}) {
		const { duration = 150, easing = 'ease' } = config;
		const animations = [];

		if (entering) {
			this._prepareElement(entering);
			
			const enterAnim = entering.animate([
				{ opacity: 0 },
				{ opacity: 1 }
			], {
				duration: duration * 0.6,
				easing,
				fill: 'forwards'
			});
			
			animations.push(enterAnim);
		}

		if (leaving) {
			const leaveAnim = leaving.animate([
				{ opacity: 1 },
				{ opacity: 0 }
			], {
				duration: duration * 0.4,
				easing,
				fill: 'forwards'
			});
			
			animations.push(leaveAnim);
		}

		this.currentAnimation = Promise.all(animations.map(a => a.finished));
		await this.currentAnimation;
	}

	/**
	 * Scale transition
	 * @param {Element} entering - Element scaling in
	 * @param {Element} leaving - Element scaling out
	 * @param {Object} config - { duration, easing, from }
	 */
	async scale(entering, leaving, config = {}) {
		const { duration = 200, easing = 'ease-out', from = 0.8 } = config;
		const animations = [];

		if (entering) {
			this._prepareElement(entering);
			
			const enterAnim = entering.animate([
				{ transform: `scale(${from})`, opacity: 0 },
				{ transform: 'scale(1)', opacity: 1 }
			], {
				duration,
				easing,
				fill: 'forwards'
			});
			
			animations.push(enterAnim);
		}

		if (leaving) {
			const leaveAnim = leaving.animate([
				{ transform: 'scale(1)', opacity: 1 },
				{ transform: `scale(${from})`, opacity: 0 }
			], {
				duration,
				easing: 'ease-in',
				fill: 'forwards'
			});
			
			animations.push(leaveAnim);
		}

		this.currentAnimation = Promise.all(animations.map(a => a.finished));
		await this.currentAnimation;
	}

	/**
	 * Height transition (for expand/collapse)
	 * @param {Element} element - Element to expand/collapse
	 * @param {boolean} expand - true to expand, false to collapse
	 * @param {Object} config - { duration, easing }
	 */
	async height(element, expand, config = {}) {
		const { duration = 300, easing = 'ease-out' } = config;
		
		if (!element) return;

		element.style.overflow = 'hidden';
		
		if (expand) {
			const startHeight = element.offsetHeight;
			element.style.height = 'auto';
			const endHeight = element.offsetHeight;
			element.style.height = startHeight + 'px';
			
			this.currentAnimation = element.animate([
				{ height: startHeight + 'px' },
				{ height: endHeight + 'px' }
			], { 
				duration, 
				easing, 
				fill: 'forwards' 
			}).finished;
			
			await this.currentAnimation;
			
			element.style.height = '';
			element.style.overflow = '';
		} else {
			const startHeight = element.offsetHeight;
			
			this.currentAnimation = element.animate([
				{ height: startHeight + 'px' },
				{ height: '0px' }
			], { 
				duration, 
				easing: 'ease-in', 
				fill: 'forwards' 
			}).finished;
			
			await this.currentAnimation;
		}
	}

	/**
	 * Shake animation (error feedback)
	 * @param {Element} element - Element to shake
	 * @param {Object} config - { duration, intensity }
	 */
	async shake(element, config = {}) {
		const { duration = 400, intensity = 10 } = config;
		
		if (!element) return;

		this.currentAnimation = element.animate([
			{ transform: 'translateX(0)' },
			{ transform: `translateX(-${intensity}px)` },
			{ transform: `translateX(${intensity}px)` },
			{ transform: `translateX(-${intensity}px)` },
			{ transform: `translateX(${intensity}px)` },
			{ transform: 'translateX(0)' }
		], { 
			duration, 
			easing: 'ease-in-out' 
		}).finished;
		
		await this.currentAnimation;
	}

	/**
	 * Pulse animation (attention)
	 * @param {Element} element - Element to pulse
	 * @param {Object} config - { duration, scale }
	 */
	async pulse(element, config = {}) {
		const { duration = 600, scale = 1.05 } = config;
		
		if (!element) return;

		this.currentAnimation = element.animate([
			{ transform: 'scale(1)' },
			{ transform: `scale(${scale})` },
			{ transform: 'scale(1)' }
		], { 
			duration, 
			easing: 'ease-in-out' 
		}).finished;
		
		await this.currentAnimation;
	}

	/**
	 * Gesture-driven transition (real-time)
	 * Updates element positions based on gesture progress
	 * @param {Element} entering - Previous page sliding in
	 * @param {Element} leaving - Current page sliding out
	 * @param {number} progress - 0 to 1
	 */
	gestureTransition(entering, leaving, progress) {
		if (entering) {
			this._prepareElement(entering);
			entering.style.pointerEvents = 'none';
			
			const translateX = -20 + (progress * 20);
			entering.style.transform = `translateX(${translateX}%)`;
			entering.style.opacity = String(0.3 + (progress * 0.7));
		}

		if (leaving) {
			const translateX = progress * 100;
			leaving.style.transform = `translateX(${translateX}%)`;
		}
	}

	/**
	 * Complete or cancel a gesture
	 * @param {Element} entering - Element that was entering
	 * @param {Element} leaving - Element that was leaving
	 * @param {boolean} shouldComplete - true to complete, false to cancel
	 * @param {Object} config - { duration, easing }
	 */
	async finishGesture(entering, leaving, shouldComplete, config = {}) {
		const { duration = 220, easing = 'ease' } = config;
		const animations = [];

		if (shouldComplete) {
			// Complete the transition
			if (entering) {
				const anim = entering.animate([
					{ transform: entering.style.transform, opacity: entering.style.opacity },
					{ transform: 'translateX(0)', opacity: '1' }
				], { duration: duration * 0.4, easing, fill: 'forwards' });
				animations.push(anim);
			}

			if (leaving) {
				const anim = leaving.animate([
					{ transform: leaving.style.transform },
					{ transform: 'translateX(100%)' }
				], { duration: duration * 0.4, easing, fill: 'forwards' });
				animations.push(anim);
			}
		} else {
			// Cancel - return to original positions
			if (entering) {
				const anim = entering.animate([
					{ transform: entering.style.transform, opacity: entering.style.opacity },
					{ transform: 'translateX(-20%)', opacity: '0' }
				], { duration: duration * 0.3, easing, fill: 'forwards' });
				animations.push(anim);
			}

			if (leaving) {
				const anim = leaving.animate([
					{ transform: leaving.style.transform },
					{ transform: 'translateX(0)' }
				], { duration: duration * 0.3, easing, fill: 'forwards' });
				animations.push(anim);
			}
		}

		this.currentAnimation = Promise.all(animations.map(a => a.finished));
		await this.currentAnimation;
	}

	/**
	 * Cleanup element styles after animation
	 * @param {Element} entering - Element that entered
	 * @param {Element} leaving - Element that left
	 */
	cleanup(entering, leaving) {
		if (entering) {
			entering.style.position = '';
			entering.style.transform = '';
			entering.style.opacity = '';
			entering.style.pointerEvents = '';
			entering.style.top = '';
			entering.style.left = '';
			entering.style.width = '';
			entering.style.height = '';
		}

		if (leaving) {
			leaving.remove();
		}
	}

	/**
	 * Cancel any in-progress animation
	 */
	cancel() {
		if (this.currentAnimation) {
			// Web Animations API doesn't have cancel on Promise
			// This is a no-op for now, could track Animation objects if needed
			this.currentAnimation = null;
		}
	}

	/**
	 * Prepare element for animation (position it absolutely)
	 * @private
	 */
	_prepareElement(element) {
		element.style.position = 'absolute';
		element.style.top = '0';
		element.style.left = '0';
		element.style.width = '100%';
		element.style.height = '100%';
	}
}