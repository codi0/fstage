//imports
import { dom } from '../dom.mjs';
import { debounce, parseHTML } from '../utils.mjs';

//dialog overlay
dom.fn.overlay = function(text, opts = {}) {

	//set vars
	var html = '';
	var that = this;

	//overlay html
	html += '<div class="overlay hidden">';
	html += '<div class="inner">';
	html += '<div class="head">';
	html += '<div class="title">' + (opts.title || '') + '</div>';
	if(opts.close !== false) {
		html += '<div class="close" data-close="true">X</div>';
	}
	html += '</div>';
	html += '<div class="body">' + text + '</div>';
	html += '</div>';
	html += '</div>';

	//return html?
	if(opts.html) {
		return html;
	}

	//loop through nodes
	for(var i=0; i < this.length; i++) {
		//create overlay
		var overlay = parseHTML(html)[0];
		//append overlay
		this[i].appendChild(overlay);
	}

	//start animation
	that.find('.overlay').animate('fade in', {
		onEnd: function() {
			//add close listener
			that.find('.overlay [data-close]').on('click', function(e) {
				//get overlay
				var o = dom(this).closest('.overlay');
				//animate and close
				o.animate('fade out', {
					onEnd: function() {
						o.remove();
					}
				});
			});
		}
	});
	
	//chain it
	return this;

}

//page notice
dom.fn.notice = function(title, opts = {}) {

	//set vars
	var html = '';

	//build html
	html += '<div class="notice ' + (opts.type || 'info') + ' hidden">';
	html += opts.close ? '<div class="close">X</div>' : '';
	html += '<div class="title">' + title + '</div>';
	html += opts.body ? '<div class="body">' + opts.body + '</div>' : '';
	html += '</div>';
	
	//return html?
	if(opts.html) {
		return html;
	}

	//loop through nodes
	for(var i=0; i < this.length; i++) {
		//notice to html
		var notice = parseHTML(html)[0];
		//append pr prepend?
		if(opts.prepend) {
			this[i].insertBefore(notice, this[i].firstChild);
		} else {
			this[i].appendChild(notice);
		}
		//show notice
		var show = dom(notice).animate((opts.animate || 'none') + ' in');
		//hide notice later?
		if(opts.hide && opts.hide > 0) {
			setTimeout(function() {
				show.animate((opts.animate || 'none') + ' out', {
					onEnd: function() {
						notice.parentNode.removeChild(notice);
					}
				});
			}, opts.hide);
		}
	}

	//chain it
	return this;
	
}

//carousel
dom.fn.carousel = function(config = {}) {

	//loop through nodes
	this.each(function() {

		//set opts
		var opts = Object.assign({
			item: '.item',
			nav: '.nav',
			auto: this.classList.contains('auto'),
			autoDuration: this.getAttribute('data-duration')
		}, config);

		//set default duration?
		if(!opts.autoDuration || opts.autoDuration == '0') {
			opts.autoDuration = 8000;
		}

		//set vars
		var tid = null;
		var slides = 0;
		var current = 1;
		var paused = false;
		var carousel = dom(this);
		var nav = opts.nav ? carousel.find(opts.nav) : null;

		//count slides
		carousel.find(opts.item).each(function() {
			slides++;
			this.setAttribute('data-slide', slides);
		});

		//stop here?
		if(!slides) {
			return;
		}

		//create nav?
		if(nav && !nav.length) {
			var el = document.createElement('div');
			el.classList.add(opts.nav.substring(1));
			for(var i=0; i < slides; i++) {
				el.innerHTML += '<div class="btn"></div>';
			}
			this.appendChild(el);
			nav = carousel.find(opts.nav);
		}

		//add nav count
		nav && nav.children().each(function(k) {
			if(!this.hasAttribute('data-nav')) {
				this.setAttribute('data-nav', k+1);
			}
		});

		//go to slide
		var goToSlide = function(number = null, init = false) {
			//is paused?
			if(!init && paused) return;
			//update slide number
			var prev = current;
			current = Number(number || current);
			//get slide
			var slide = carousel.find('[data-slide="' + current + '"]');
			//calculate total width
			var style = getComputedStyle(slide[0]);
			var width = Number(style.width.replace('px', ''));
			var marginLeft = Number(style.marginLeft.replace('px', ''))
			var marginRight = Number(style.marginRight.replace('px', ''));
			//get carousel width
			var carouselWidth = Number(getComputedStyle(carousel[0]).width.replace('px', ''));
			var slidesInView = Math.floor(carouselWidth / width);
			//anything to move?
			if(slides <= slidesInView) {
				//back home
				current = 1;
			} else {
				//set amount to translate
				var reset = (current == 1 && prev == slides);
				var fwd = (current > prev) || reset;
				var numSlides = reset ? 1 : (fwd ? current - prev : prev - current);
				var translate = init ? 0 : (width + marginLeft + marginRight) * numSlides * (fwd ? -1 : 1);
				//move slides
				carousel.find('[data-slide]').css('transform', 'translateX(' + translate + 'px)')[0].addEventListener('transitionend', function(e) {
					//loop through slides
					carousel.find('[data-slide]').each(function() {
						//set vars
						var el = this;
						var order = null;
						var n = Number(el.getAttribute('data-slide'));
						var order = (n - current) + 1;
						//update order?
						if(order < 1) {
							order = order + slides;
						}
						//disable transitions
						el.style.transition = 'none';
						//update order
						setTimeout(function() {
							el.style.order = order;
							el.style.transform = 'translateX(0px)';
						}, 50);
						//re-enable transitions
						setTimeout(function() {
							el.style.transition = null;
						}, 100);
					});
				});
			}
			//display nav
			nav && nav.removeClass('hidden');
			//update active nav
			carousel.find('[data-nav]').removeClass('active');
			carousel.find('[data-nav="' + current + '"]').addClass('active');
			//hide nav?
			if(slides <= slidesInView) {
				nav && nav.addClass('hidden');
			}
		};

		//auto play
		var autoplay = function() {
			//can auto play?
			if(!opts.auto || !opts.autoDuration) {
				return;
			}
			//reset internal?
			tid && clearInterval(tid);
			//set new interval
			tid = setInterval(function() {
				//get number
				var number = (current + 1);
				var number = (number > slides) ? 1 : number;
				//emulate click
				goToSlide(number);
			}, opts.autoDuration);
		};

		//start now
		goToSlide(1, true);
		autoplay();

		//listen for clicks
		carousel.on('click', function(e) {
			//stop here?
			if(!e.target.hasAttribute('data-nav')) {
				return;
			}
			//get slide number
			var number = e.target.getAttribute('data-nav');
			//is next?
			if(number === 'next') {
				number = current + 1;
			}
			//is previous?
			if(number === 'prev') {
				number = current - 1;
			}
			//go to slide
			goToSlide(number);
			//autoplay
			autoplay();
		});

		//listen for pause
		carousel.find('[data-slide]').on('mouseenter', function(e) {
			paused = true;
		});

		//listen for unpause
		carousel.find('[data-slide]').on('mouseleave', function(e) {
			paused = false;
		});

		//listen for resize
		globalThis.addEventListener('resize', debounce(function(e) {
			goToSlide();
		}));
	});

	//chain it
	return this;

}

//cookie consent
dom.fn.cookieConsent = function(opts = {}) {

	//set options
	opts = Object.assign({
		key: 'gdpr',
		text: 'We use cookies to provide the best website experience.',
		policy: '<a href="' + (opts.url || '/privacy/') + '">Privacy policy</a>.',
		action: 'Ok',
		onOk: null,
		onNav: function(e) {
			if(this.href.indexOf('://') === -1 || this.href.indexOf(location.hostname) !== -1) {
				if(this.href.indexOf(opts.url) === -1) {
					localStorage.setItem(opts.key, 1);
				}
			}
		}
	}, opts);

	//stop here?
	try {
		if(localStorage.getItem(opts.key) == 1) return;
	} catch (error) {
		return;
	}

	//display cookie notice
	this.append('<div id="cookie-consent">' + opts.text + ' ' + opts.policy + ' <button>' + opts.action + '</button></div>');

	//on load?
	if(opts.onLoad) {
		requestAnimationFrame(function() {
			opts.onLoad(document.getElementById('cookie-consent'));
		});
	}

	//on ok
	dom('#cookie-consent button').on('click', function(e) {
		//run callback
		var res = opts.onOk ? opts.onOk(e) : true;
		//after callback
		var onEnd = function() {
			localStorage.setItem(opts.key, 1);
			dom('#cookie-consent').remove();
		};
		//is promise?
		if(res && res.then) {
			return res.then(function(res) {
				if(res !== false) {
					onEnd();
				}
			});
		}
		//sync response
		if(res !== false) {
			onEnd();
		}
	});

	//on nav?
	if(opts.onNav) {
		dom('a').on('click', opts.onNav);
	}

	//chain it
	return this;

}