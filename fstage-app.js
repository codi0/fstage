/**
 * FSTAGE-APP.JS
 *
 * About: Bootstrap your next web app using fstage.js
 * Version: 0.2.1
 * License: MIT
 * Source: https://github.com/codi0/fstage
**/
(function(root, undefined) {

	//module callback
	var module = function() {
	
		//app status
		var status = {
			init: false,
			loaded: false,
			ready: false,
			waiting: []
		};

		//app exports
		var exported = {
			utils: {},
			services: {},
			middleware: {},
			components: {}
		};

		//platforms
		var platforms = [
			{ p: 'android', m: true, r: 'Android' },
			{ p: 'ios', m: true, r: 'iPad|iPhone|watchOS' },
			{ p: 'ios', m: false, r: 'Macintosh' },
			{ p: 'windows', m: true, r: 'Windows Phone' },
			{ p: 'windows', m: false, r: 'Windows' }
		];

		//hashcode
		var hashCode = function(str) {
			var h = 5381, i = str.length;
			while(i) h = (h * 33) ^ str.charCodeAt(--i);
			return (h >>> 0).toString();		
		};

		//public api
		var self = {

			utils: {},
			config: {},
			router: Fstage.router,
			pubsub: Fstage.pubsub,
			components: Fstage.components,

			export: function(module, path = null) {
				//guess path?
				if(path === null) {
					path = /js\/(.*)\.js/g.exec(document.currentScript.src)[1];
				}
				//parse path
				var parts = path.split('/');
				var name = parts.pop();
				var type = '';
				//has parts?
				if(name && parts.length) {
					//use name as type?
					if(exported[name + 's']) {
						type = name;
						name = parts.pop()
					} else {
						//find type
						for(var i=0; i < parts.length; i++) {
							if(exported[parts[i]]) {
								type = parts[i];
								break;
							}
						}
					}
				}
				//parts found?
				if(type && name && exported[type]) {
					exported[type][name] = module;
				} else {
					throw new Error("Unable to export module: " + path);
				}
				
			},

			about: {

				root: root,
				docEl: document.documentElement,
				appEl: document.getElementById('root'),

				platform: '',
				deviceId: hashCode(navigator.userAgent.replace(/[0-9\.\s]/g, '')),

				isMobile: false,
				isHybrid: !!root._cordovaNative,
				isPwa: root.matchMedia('(display-mode: standalone)').matches,

				isOnline: function(wait = false) {
					//get result
					var res = self.db ? self.db.isOnline() : navigator.onLine;
					//return now?
					if(wait === false) {
						return res;
					}
					//wait for online
					return new Promise(function(resolve) {
						//check at intervals
						var tid = setInterval(function() {
							//is online now?
							if(self.about.isOnline()) {
								clearInterval(tid);
								resolve(true);
							}
						}, 100);
					});
				},

				isReady: function(wait = false) {
					//return now?
					if(wait === false) {
						return status.ready;
					}
					//wait for ready
					return new Promise(function(resolve) {
						//resolve now?
						if(status.ready) { 
							resolve(true);
						} else {
							self.pubsub.on('app.ready', function() {
								resolve(true);
							});
						}
					});
				},

				isWaiting: function(wait = false, opts = {}) {
					//return now?
					if(wait === false) {
						return status.waiting.length > 0;
					}
					//add to wait list?
					if(wait && wait !== true) {
						status.waiting.push(wait);
						wait = true;
					}
					//set vars
					var that = this;
					var count = status.waiting.length;
					//process promises
					var res = Promise.all(status.waiting).then(function() {
						//completed?
						if(status.waiting.length === count) {
							status.waiting = [];
							return opts.nested ? true : (count > 0);
						}
						//mark as nested
						opts.nested = true;
						//continue waiting
						return that.isWaiting(wait, opts);
					});
					//is online?
					if(!opts.waitOffline && !that.isOnline()) {
						return Promise.resolve([]);
					}
					//return
					return res;
				}

			},

			logger: {
			
				track: function(name, params = {}) {
					return self.pubsub.emit('app.track', {
						name: name,
						params: params
					});
				},

				error: function(error, isFatal = false) {
					return this.track('exception', {
						exDescription: error,
						exFatal: false
					});
				},

				timer: function(name) {
					if(self.config.debug) {
						console.log(name + ':', Math.floor(performance.now()) + 'ms');
					}
				}

			},

			launch: function(callback = null) {
				//app supported?
				if(!self.about.isHybrid && !root.fetch) {
					return alert('Your browser is out of date and not supported. Please switch browser to continue.');
				}
				//detect platform
				platforms.some(function(el) {
					//user-agent match?
					if(!navigator.userAgent.match(new RegExp(el.r, 'i'))) {
						return;
					}
					//is mobile?
					if(el.m) {
						self.about.isMobile = true;
						self.about.docEl.classList.add('mobile');
					}
					//set platform
					self.about.platform = el.p;
					self.about.docEl.classList.add(el.p);
					//break
					return true;
				});
				//init event
				status.init = true;
				self.pubsub.emit('app.init', root, {
					ctx: self
				});
				//register utils
				for(var i in exported.utils) {
					//call function?
					if(typeof exported.utils[i] === 'function') {
						exported.utils[i] = new exported.utils[i](self);
					}
					//merge utils
					Object.assign(self.utils, exported.utils[i]);
				}
				//register services
				for(var i in exported.services) {
					//get object
					self[i] = self[i] || {};
					//call function?
					if(typeof exported.services[i] === 'function') {
						exported.services[i].apply(self[i], [ self[i], self ]);
					} else {
						Object.assign(self[i], exported.services[i]);
					}
				}
				//start services
				for(var i in exported.services) {
					if(self[i].start) {
						self[i].start();
					}
				}
				//register middleware
				for(var i in exported.middleware) {
					//get function
					var fn = exported.middleware[i];
					//init middleware
					new fn(self.components.store(), self);
				}
				//register components
				for(var i in exported.components) {
					self.components.register(i, exported.components[i]);
				}
				//register routes
				for(var i in (self.routes || {})) {
					self.router.on(self.routes[i], null);
				}
				//execute callback?
				if(callback) {
					callback.call(self, root);
				}
				//launch event
				status.launched = true;
				self.pubsub.emit('app.launch', root, {
					ctx: self
				});
				//log launch time
				self.logger.timer('App launched');
				//onready callback
				var onReady = function() {
					//update flag
					status.ready = true;
					//ready event
					self.pubsub.emit('app.ready', root, {
						ctx: self
					});
					//log ready time
					self.logger.timer('Device ready');
				};
				//is device ready?
				if(self.about.isHybrid) {
					document.addEventListener('deviceready', onReady);
				} else {
					onReady();
				}
				//return
				return self;
			},

			onInit: function(fn) {
				return status.init ? fn.call(self, root) : self.pubsub.on('app.init', fn);
			},

			onLaunch: function(fn) {
				return status.launched ? fn.call(self, root) : self.pubsub.on('app.launch', fn);
			},

			onDownload: function(fn) {
				return self.onLaunch(function() {
					self.about.isWaiting(true).then(function(didWait) {
						fn.call(self, didWait);
					});
				});
			},

			onReady: function(fn) {
				return status.ready ? fn.call(self, root) : self.pubsub.on('app.ready', fn);
			},

			onTrack: function(fn) {
				return self.pubsub.on('app.track', fn);
			}

		};

		//set export
		root.export = self.export;
	
		//capture errors
		root.addEventListener('error', function(e) {
			self.logger.error(e.error);
		});

		//return
		return self;

	};

	//dependencies loaded?
	if(!root.Fstage && confirm('App failed to load. Please refresh and try again.')) {
		return location.reload();
	}

	//create app
	root.App = new module();

})(self || window || this);