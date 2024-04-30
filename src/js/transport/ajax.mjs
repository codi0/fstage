export default function ajax(url, opts = {}) {

	//set vars
	var controller = (typeof AbortController !== 'undefined') ? new AbortController() : null;

	//format opts
	opts = Object.assign({
		method: 'GET',
		headers: {},
		body: '',
		timeout: 5000,
		signal: controller && controller.signal
	}, opts);

	//set default content type?
	if(opts.method === 'POST' && !opts.headers['Content-Type']) {
		opts.headers['Content-Type'] = 'application/x-www-form-urlencoded';
	}

	//remove undefined param values?
	if(opts.body && typeof opts.body !== 'string') {
		//remove undefined params
		for(var i in opts.body) {
			if(opts.body[i] === undefined) {
				delete opts.body[i];
			}
		}
		//convert to string
		opts.body = new URLSearchParams(opts.body);
	}

	//wrap fetch in timeout promise
	var p = new Promise(function(resolve, reject) {
		//create timer
		var timer = opts.timeout && setTimeout(function() {
			reject(new Error("Ajax request timeout"));
			controller && controller.abort();
		}, opts.timeout);
		//fetch with timer
		fetch(url, opts).finally(function() {
			timer && clearTimeout(timer);
		}).then(resolve, reject);
	});

	//success callback?
	if(opts.success) {
		p = p.then(function(response) {
			opts.success(response);
		});
	}

	//error callback?
	if(opts.error) {
		p = p.catch(function(err) {
			opts.error(err);
		});
	}

	//return
	return p;

}