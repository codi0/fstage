//imports
import { dom } from 'fstage/dom';

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
			//start animation
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
		})(this[i]);
	}
	//chain it
	return this;
}

//slide element
dom.fn.sliding = function(opts = {}) {

	//set vars
	var el, startX, startY, pageX, pageY;

	//format opts
	opts = Object.assign({
		x: true,
		y: false,
		delegate: null
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
		startX = pageX = ev(e, 'pageX');
		startY = pageY = ev(e, 'pageY');
		//make non-selectable
		el.style.userSelect = 'none';
		//add listeners
		dom(document).on('mousemove touchmove', onMove).on('mouseup touchend', onEnd);
		//execute callback?
		opts.onStart && opts.onStart(el, { startX: startX, startY: startY });
	};

	//onMove listener
	var onMove = function(e) {
		//stop here?
		if(!el) return;
		//update position
		pageX = ev(e, 'pageX');
		pageY = ev(e, 'pageY');
		//new coordinates
		var X = opts.x ? pageX - startX : startX;
		var Y = opts.y ? pageY - startY : startY;
		//transform target
		el.style.transform = 'translate3d(' + X + 'px, ' + Y + 'px, 0);';
		//execute callback?
		opts.onMove && opts.onMove(el, { startX: startX, startY: startY, pageX: pageX, pageY: pageY });
	};

	//onEnd listener
	var onEnd = function(e) {
		//stop here?
		if(!el) return;
		//remove mouse/touch listeners
		dom(document).off('mousemove touchmove', onMove).off('mouseup touchend', onEnd);
		//add transition
		el.style.transition = 'transform 300ms ease-in-out';
		//wait for next frame
		requestAnimationFrame(function() {
			//end now?
			var endNow = !el.style.transform;
			//transitionend listener
			var listen = function(e) {
				//reset styles
				el.style.removeProperty('transform');
				el.style.removeProperty('transition');
				el.style.removeProperty('user-select');
				//remove listener?
				!endNow && el.removeEventListener('transitionend', listen);
				//reset vars
				el = startX = startY = pageX = pageY = null;
			};
			//add listener?
			!endNow && el.addEventListener('transitionend', listen);
			//execute callback?
			opts.onEnd && opts.onEnd(el, { startX: startX, startY: startY, pageX: pageX, pageY: pageY });
			//end now?
			endNow && listen();
		});
	};

	//start slide
	this.on('mousedown touchstart', opts.delegate, onStart);

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