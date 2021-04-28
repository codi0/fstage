/* VERSION */

var version = 'v0.0.1';


/* SETUP */

var App = {};
var messages = {};
importScripts('js/config.js');


/* LISTENERS */

//install service worker
self.addEventListener('install', function(e) {
	//use debug?
	if(App.config.debug) {
		console.log('Worker install', version);
	}
	//execute
	e.waitUntil(
		//pre-cache resouces
		caches.open(version + '.offline').then(function(cache) {
			return cache.addAll(App.config.swPreCache || []).catch(function(error) {
				console.error(error);
			});
		})
	);
});

//activate service worker
self.addEventListener('activate', function(e) {
	//use debug?
	if(App.config.debug) {
		console.log('Worker activate', version);
	}
	//execute
	e.waitUntil(
		//delete old cache
		caches.keys().then(function(keys) {
			return Promise.all(keys.filter(function(key) {
				return !key.startsWith(version);
			}).map(function(key) {
				return caches.delete(key);
			}));
		})
	);
});

//receive client message
self.addEventListener('message', function(e) {
	//skip waiting?
	if(e.data === 'skipWaiting') {
		return self.skipWaiting();
	}
	//get notification?
	if(e.data.action && e.data.action === 'getNotification') {
		if(e.data.id && messages[e.data.id]) {
			e.source.postMessage(messages[e.data.id]);
			delete messages[e.data.id];
		}
	}
});

//fetch client resource
self.addEventListener('fetch', function(e) {
	//is GET request?
	if(e.request.method !== 'GET') {
		return;
	}
	//return response
	e.respondWith(
		//open fetch cache
		caches.open(version + '.offline').then(function(cache) {
			//check for resource cache match
			return cache.match(e.request.url).then(function(response) {
				//set vars
				var opts = {};
				var canCache = false;
				//allow current host
				App.config.swCacheHosts[App.config.host] = 'same-origin';
				//check cache hosts
				for(var host in App.config.swCacheHosts) {
					//host match found?
					if(host && e.request.url.indexOf(host) === 0) {
						//set flag
						canCache = true;
						//set mode
						opts.credentials = 'omit';
						opts.mode = App.config.swCacheHosts[host] || 'no-cors';
						//break
						break;
					}
				}
				//use cache first strategy
				return response || fetch(e.request, opts).then(function(response) {
					//cache response?
					if(canCache && response.status < 300) {
						cache.put(e.request.url, response.clone());
					}
					//return
					return response;
				}).catch(function(error) {
					//use debug?
					if(App.config.debug) {
						console.log('Failed request:', e.request.url);
					}
					//return
					return new Response('');
				});
			});
		})
	);
});

//receive push notification
self.addEventListener('push', function(e) {
	//set vars
	var canSend = true;
	var payload = e.data;
	//is fcm?
	if(payload.json) {
		payload = payload.json();
	}
	//debugging?
	if(App.config.debug) {
		console.log('SW push', payload, e);
	}
	//execute
	e.waitUntil(
		//get all matching windows
		clients.matchAll({ type: "window", includeUncontrolled: true }).then(function(clientList) {
			//loop through clients
			for(var i=0; i < clientList.length; i++) {
				//is app?
				if(clientList[i].url.indexOf(App.config.host) === 0) {
					//send data
					clientList[i].postMessage(payload.data);
					//is in focus?
					if(clientList[i].focused) {
						canSend = false;
					}
				}
			}
			//can notify?
			if(payload.notification && canSend) {
				//show notification
				return self.registration.showNotification(payload.notification.title, {
					body: payload.notification.body || '',
					tag: payload.notification.tag || '',
					data: payload.data || {},
					badge: App.config.icon,
					vibrate: App.config.vibrate
				});
			}
			//return
			return true;
		})
	);
});

//click push notification
self.addEventListener('notificationclick', function(e) {
	//set vars
	var payload = e.notification.data;
	//is fcm?
	if(payload.FCM_MSG) {
		payload = payload.FCM_MSG.data;
	}
	//ensure tag set
	payload.tag = payload.tag || e.notification.tag;
	//was tapped
	payload.wasTapped = true;
	//debugging?
	if(App.config.debug) {
		console.log('SW click', payload, e);
	}
	//close notification
	e.notification.close();
	//execute
	e.waitUntil(
		//get all matching windows
		clients.matchAll({ type: "window", includeUncontrolled: true }).then(function(clientList) {
			//loop though clients
			for(var i=0; i < clientList.length; i++) {
				//is app?
				if(clientList[i].url.indexOf(App.config.host) === 0) {
					//send data
					clientList[i].postMessage(payload);
					//focus client
					return clientList[i].focus();
				}
			}
			//generate ID
			var id = Math.random().toString(36).substring(2);
			//store payload
			messages[id] = payload;
			//open new tab
			return clients.openWindow(App.config.host + '#push=' + id);
		})
	);
});