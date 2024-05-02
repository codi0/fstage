//imports
import dom from './dom.mjs';

//animate element
dom.fn.animate = function(effect, opts = {}) {

	//set vars
	var isIn = /(^|\s|\-)in(\s|\-|$)/.test(effect);
	var isOut = /(^|\s|\-)out(\s|\-|$)/.test(effect);

	//onStart listener
	var onStart = function(e) {
		//onStart callback?
		opts.onStart && opts.onStart(e);
		//remove listener
		this.removeEventListener('transitionstart', onStart);
	};

	//onEnd listener
	var onEnd = function(e) {
		//hide element?
		isOut && this.classList.add('hidden');
		//reset classes
		this.classList.remove('animate', 'in', 'out');
		this.classList.remove.apply(this.classList, effect.split(/\s+/g));
		//onEnd callback?
		opts.onEnd && opts.onEnd(e);
		//remove listeners
		this.removeEventListener('transitionend', onEnd);
		this.removeEventListener('transitioncancel', onEnd);
	};

	//loop through elements
	for(var i=0; i < this.length; i++) {
		//use closure
		(function(el) {
			//is hidden?
			var isHidden = el.classList.contains('hidden');
			//infer direction?
			if(!isIn && !isOut) {
				isOut = !isHidden;
			}
			//stop here?
			if((isOut && isHidden) || (isIn && !isHidden)) {
				return;
			}
			//register listeners
			el.addEventListener('transitionstart', onStart);
			el.addEventListener('transitionend', onEnd);
			el.addEventListener('transitioncancel', onEnd);
			//add effect classes
			el.classList.add.apply(el.classList, effect.split(/\s+/g));
			//add animate (out)
			isOut && el.classList.add('animate');
			//before next repaint
			requestAnimationFrame(function() {
				//after next repaint
				requestAnimationFrame(function() {
					//add animate (not out)
					!isOut && el.classList.add('animate');
					//apply classes
					isIn && el.classList.add('in');
					isOut && el.classList.add('out');
					!isOut && el.classList.remove('hidden');
					//manually fire listeners?
					if(globalThis.getComputedStyle(el, null).getPropertyValue('transition') === 'all 0s ease 0s') {
						onStart.call(el);
						onEnd.call(el);
					}
				});
			});
		})(this[i]);
	}
	//chain it
	return this;
}

//transition element
dom.transition = function(toEl, toEffect, fromEl, fromEffect, opts = {}) {

	//onEnd listener
	var onEnd = function(e) {
		//reset from?
		if(fromEl) {
			fromEl.classList.add('hidden');
			fromEl.removeAttribute('style');
		}
		//reset to
		toEl.removeAttribute('style');
		//run callback?
		opts.onEnd && opts.onEnd(e);
	};

	//from el?
	if(fromEl) {
		//transition immediately?
		if(fromEl.classList.contains('hidden')) {
			toEl.classList.remove('hidden');
			return onEnd();
		}
		//From: set z-index
		fromEl.style.zIndex = opts.reverse ? 99 : 98;
		//From: animate
		dom(fromEl).animate((opts.reverse ? toEffect : fromEffect) + ' out');
	}

	//To: set z-index
	toEl.style.zIndex = opts.reverse ? 98 : 99;

	//To: animate
	dom(toEl).animate((opts.reverse ? fromEffect : toEffect) + ' in', {
		onStart: opts.onStart,
		onEnd: onEnd
	});

}

//draggable element
dom.fn.draggable = function(opts = {}) {

	//set vars
	var el, pos;

	//format opts
	opts = Object.assign({
		x: true,
		y: false,
		delegate: null,
		persist: true
	}, opts);

	//standardise event
	var ev = function(e, prop) {
		if(!e.targetTouches) {
			return e[prop] || null;
		}
		return e.targetTouches.length ? e.targetTouches[0][prop] : null;
	};

	//onStart listener
	var onStart = function(e) {
		//stop here?
		if(el) return;
		//set vars
		el = this;
		var coords = {};
		//get translation?
		if(el.style.transform) {
			var coords = {};
			var m = el.style.transform.match(/translate3d\((.*)\)/);
			if(m && m[1]) {
				var parts = m[1].split(',');
				coords.left = parts[0].replace('px', '').trim();
				coords.top = parts[1].replace('px', '').trim();
			}
		}
		//cache position
		pos = {
			translateX: parseInt(coords.left) || 0,
			translateY: parseInt(coords.top) || 0,
			startX: ev(e, 'clientX'),
			startY: ev(e, 'clientY'),
			moveX: 0,
			moveY: 0
		};
		//make non-selectable
		el.style.userSelect = 'none';
		el.style.cursor = 'grabbing';
		//add listeners
		dom(el).on('mousemove touchmove', onMove).on('mouseup touchend', onEnd);
		//execute callback?
		opts.onStart && opts.onStart(el, pos);
	};

	//onMove listener
	var onMove = function(e) {
		//stop here?
		if(!el) return;
		//set move values
		pos.moveX = ev(e, 'clientX') - pos.startX;
		pos.moveY = ev(e, 'clientY') - pos.startY;
		//new coordinates
		var X = opts.x ? pos.translateX + pos.moveX : 0;
		var Y = opts.y ? pos.translateY + pos.moveY : 0;
		//transform target
		el.style.transform = 'translate3d(' + X + 'px, ' + Y + 'px, 0px)';
		//execute callback?
		opts.onMove && opts.onMove(el, pos);
	};

	//onEnd listener
	var onEnd = function(e) {
		//stop here?
		if(!el) return;
		//remove mouse/touch listeners
		dom(el).off('mousemove touchmove', onMove).off('mouseup touchend', onEnd);
		//transitionend listener
		var listen = function() {
			//stop here?
			if(!el) return;
			//remove listener?
			if(!opts.persist) {
				el.removeEventListener('transitionend', listen);
				el.removeEventListener('transitioncancel', listen);
			}
			//execute callback?
			opts.onEnd && opts.onEnd(el, pos);
			//reset styles
			el.style.removeProperty('cursor');
			el.style.removeProperty('transition');
			el.style.removeProperty('user-select');
			//reset vars
			el = pos = null;
		};
		//persist translate?
		if(opts.persist) {
			requestAnimationFrame(listen);
		} else {
			el.addEventListener('transitionend', listen);
			el.addEventListener('transitioncancel', listen);
			el.style.transition = 'transform 300ms ease-in-out';
			requestAnimationFrame(function() {
				el.style.removeProperty('transform');
			});
		}
	};

	//start slide
	this.on('mousedown touchstart', opts.delegate, onStart);

}

//sliding element
dom.fn.sliding = function(opts = {}) {
	opts.persist = false;
	return this.draggable(opts);
}