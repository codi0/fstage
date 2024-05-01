//webpush wrapper
function webpush() {

	//internal vars
	var _url = null;
	var _reg = null;
	var _sub = null;
	var _vapid = null;
	var _topics = [];
	var _canPush = ('PushManager' in globalThis);

	//get sub helper
	var getSub = function() {
		//has sub?
		if(_sub) {
			return Promise.resolve(_sub);
		}
		//has url and key?
		if(!_url || !_vapid) {
			throw new Error("Webpush init method must be called with url and vapidKey, before calling (un)subscribe");
		}
		//fetch from worker
		return navigator.serviceWorker.ready.then(function(reg) {
			return reg.pushManager.getSubscription().then(function(sub) {
				_reg = reg;
				_sub = sub;
				return _sub;
			});
		});
	};

	//format vapid key helper
	var formatVapidKey = function(key) {
		//convert from base64 to int8
		var padding = '='.repeat((4 - key.length % 4) % 4);
		var base64 = (key + padding).replace(/\-/g, '+').replace(/_/g, '/');
		var rawData = atob(base64);
		var key = new Uint8Array(rawData.length);
		for(var i = 0; i < rawData.length; ++i) {
			key[i] = rawData.charCodeAt(i);
		}
		return key;			
	};

	//server sync helper
	var serverSync = function(method) {
		//notify server
		return fetch(_url, {
			method: method,
			headers: {
				'Content-type': 'application/json'
			},
			body: JSON.stringify({
				subscription: _sub,
				topics: _topics
			})
		}).then(function(response) {
			//check response body
			return response.text().then(function(text) {
				return (text == 'ok');
			});
		});				
	};
			
	return {
	
		instance: function() {
			return new webpush();
		},

		init: function(url, vapid) {
			_url = url;
			_vapid = formatVapidKey(vapid);
			_topics = JSON.parse(localStorage.getItem('webpush.topics') || '[]');
		},

		can: function() {
			return _canPush;
		},

		topics: function() {
			return _topics;
		},

		state: function(opts={}) {
			//can push?
			if(!_canPush) {
				return Promise.resolve(false);
			}
			//set default visibility?
			if(!('userVisibleOnly' in opts)) {
				opts.userVisibleOnly = true;
			}
			//return
			return navigator.serviceWorker.ready.then(function(reg) {
				return reg.pushManager.permissionState(opts);
			});
		},

		subscribe: function(topic) {
			//can push?
			if(!_canPush) {
				return Promise.resolve(false);
			}
			//get sub
			return getSub().then(function() {
				//subscribe on frontend
				return _reg.pushManager.subscribe({
					userVisibleOnly: true,
					applicationServerKey: _vapid
				}).then(function(sub) {
					//anything to sync?
					if(!_sub || (topic && _topics.indexOf(topic) == -1)) {
						//cache sub
						_sub = sub;
						//add topic?
						if(topic && _topics.indexOf(topic) == -1) {
							_topics.push(topic);
							localStorage.setItem('webpush.topics', JSON.stringify(_topics));
						}
						//save to backend
						return serverSync('POST');
					}
					//return
					return true;
				});
			});
		},

		unsubscribe: function(topic) {
			//get sub
			return getSub().then(function() {
				//set vars
				var method = 'PUT';
				//has sub?
				if(!_sub) {
					return true;
				}
				//has topic?
				if(topic && _topics.indexOf(topic) == -1) {
					return true;
				}
				//remove topic?
				if(topic) {
					_topics.splice(_topics.indexOf(topic), 1);
					localStorage.setItem('webpush.topics', JSON.stringify(_topics));
				}
				//remove sub?
				if(!_topics.length) {
					method = 'DELETE'; 
				}
				//save to backend
				return serverSync(method).then(function(result) {
					if(result && method === 'DELETE') {
						_sub.unsubscribe();
						_sub = null;
					}
				});
			});
		},

		close: function(topic) {
			return navigator.serviceWorker.ready.then(function(reg) {
				//get all active notifications
				return reg.getNotifications().then(function(notifications) {
					//loop through notifications
					for(var i=0; i < notifications.length; i++) {
						if(!topic || notifications[i].tag == topic || (notifications[i].data || []).topic == topic) {
							notifications[i].close();
						}
					}
				});
			});
		}

	};

};

//create obj
var _obj = new webpush()

//set globals?
if(globalThis.Fstage) {
	Fstage.webpush = _obj;
}

//exports
export default _obj;