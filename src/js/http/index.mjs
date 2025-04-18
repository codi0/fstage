//Helper: format url
export function formatUrl(url, params) {
	//set vars
	var params = params || '';
	//is string?
	if(typeof params !== 'string') {
		//wrap params?
		if(!(params instanceof URLSearchParams)) {
			params = new URLSearchParams(params);
		}
		//sort params
		params.sort();
		//convert to string
		params = params.toString();
	}
	//remove hash
	url = url.split('#')[0];
	//return
	return url + (params ? (url.indexOf('?') >= 0 ? '&' : '?') + params : '');
}

//Helper: format headers
export function formatHeaders(headers) {
	//set vars
	var res = {};
	var headers = headers || {};
	//loop through fields
	Object.keys(headers).forEach(function(key) {
		res[key.toLowerCase()] = headers[key];
	});
	//return
	return res;
}

//Helper: format form body
export function formatFormBody(body, form, path='') {
	//can process?
	if(!body || typeof body === 'string') {
		return body || '';
	}
	//get form?
	if(!form) {
		form = new FormData();
	}
	//set vars
	var formKey;
	//start loop
	for(var prop in body) {
		//skip property?
		if(!body.hasOwnProperty(prop)) {
			continue;
		}
		//get current path
		var propPath = path ? path + '[' + prop + ']' : prop;
		//recursive?
		if(typeof body[prop] == 'object' && !(body[prop] instanceof File)) {
			formatFormBody(body[prop], form, propPath);
		} else {
			form.append(propPath, body[prop]);
		}
	}
	//return
	return form;
}

//Helper: format json body
export function formatJsonBody(body) {
	//set vars
	var body = body || '';
	//anything to process?
	if(typeof body === 'string') {
		return body;
	}
	//return
	return JSON.stringify(body);
}

//Helper: process response
export function processResponse(response) {
	//get content type
	var contentType = response.headers.get('content-type') || '';
	//is json?
	if(contentType.indexOf('json') >= 0) {
		return response.json();
	}
	//is text?
	if(contentType.indexOf('text') >= 0) {
		return response.text();
	}
	//unknown
	return response.blob();
}

//make http request
export function fetchHttp(url, opts={}) {
	//format opts
	opts = Object.assign({
		timeout: 5000,
		format: null,
		method: null,
		headers: {},
		params: {},
		body: null,
	}, opts);
	//format url
	url = formatUrl(url, opts.params);
	//format headers
	opts.headers = formatHeaders(opts.headers);
	//default format?
	if(!opts.format && opts.body) {
		opts.format = 'form';
	}
	//default headers?
	if(!opts.headers['x-fetch']) {
		opts.headers['x-fetch'] = 'true';
	}
	//check format
	if(opts.format === 'form') {
		delete opts.headers['content-type'];
		opts.method = opts.method || 'POST';
		opts.body = formatFormBody(opts.body);
	} else if(opts.format === 'json') {
		opts.headers['content-type'] = 'application/json';
		opts.method = opts.method || 'POST';
		opts.body = formatJsonBody(opts.body);
	} else {
		opts.method = opts.method || (opts.body ? 'POST' : 'GET');
	}
	//return promise
	return new Promise(function(resolve, reject) {
		//set vars
		var tid = null;
		var controller = (typeof AbortController !== 'undefined') ? new AbortController() : null;
		//create timer?
		if(opts.timeout > 0) {
			tid = setTimeout(function() {
				reject(new Error("Ajax request timeout"));
				controller && controller.abort();
			}, opts.timeout);
		}
		//make request
		fetch(url, {
			method: opts.method,
			headers: opts.headers,
			body: opts.body,
			signal: controller && controller.signal
		}).finally(function() {
			tid && clearTimeout(tid);
		}).then(function(response) {
			//valid response?
			if(response.ok) {
				//process response
				return processResponse(response).then(function(res) {
					resolve(res);
				});
			} else {
				reject("HTTP " + response.status + " error: " + response.url);
			}
		}).catch(function(err) {
			reject(err);
		});
	});
}