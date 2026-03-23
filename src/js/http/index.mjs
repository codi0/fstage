/**
 * Append query params to a URL, normalising duplicates and removing the hash.
 *
 * @param {string} url
 * @param {string|Object|URLSearchParams} [params]
 * @returns {string}
 */
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

/**
 * Normalise header keys to lowercase.
 *
 * @param {Object} [headers]
 * @returns {Object}
 */
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

/**
 * Recursively serialise a plain object (or array) into a `FormData` instance,
 * using bracket notation for nested keys (`parent[child]`).
 * File instances are appended as-is.
 *
 * @param {string|Object|Array} body - Data to serialise. Returned unchanged if
 *   already a string or falsy.
 * @param {FormData} [form] - Existing FormData to append into; created if omitted.
 * @param {string} [path=''] - Key prefix for nested recursion (used internally).
 * @returns {FormData|string}
 */
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
		var isFile = (typeof File !== 'undefined') && (body[prop] instanceof File);
		var isBlob = (typeof Blob !== 'undefined') && (body[prop] instanceof Blob);
		if(body[prop] && typeof body[prop] == 'object' && !isFile && !isBlob) {
			formatFormBody(body[prop], form, propPath);
		} else {
			form.append(propPath, body[prop]);
		}
	}
	//return
	return form;
}

/**
 * Serialise a value to a JSON string. Strings pass through unchanged.
 *
 * @param {string|*} [body]
 * @returns {string}
 */
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

/**
 * Parse a Fetch `Response` based on its `content-type` header.
 * Returns JSON, text, or a Blob accordingly.
 *
 * @param {Response} response
 * @returns {Promise<*>}
 */
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

/**
 * Wrapper around the Fetch API with timeout, auto body-formatting, and
 * content-type-based response parsing.
 *
 * @param {string} url - Request URL. Query params may also be passed via `opts.params`.
 * @param {Object} [opts]
 * @param {number}  [opts.timeout=5000]  - Abort timeout in ms. Set to `0` to disable.
 * @param {string}  [opts.format]        - Body serialisation format: `'form'` (default
 *   when `body` is present) or `'json'`. Leave unset for raw body/GET requests.
 * @param {string}  [opts.method]        - HTTP method. Inferred from `format` and `body`
 *   presence when omitted (`'POST'` if body, `'GET'` otherwise).
 * @param {Object}  [opts.headers={}]    - Request headers (keys are lowercased).
 * @param {string|Object|URLSearchParams} [opts.params={}] - URL query parameters.
 * @param {string|Object|FormData|null}   [opts.body=null]  - Request body.
 * @returns {Promise<*>} Resolves with the parsed response body (JSON, text, or Blob).
 *   Rejects on network errors, timeouts, or non-2xx HTTP status codes.
 */
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
		var controller = null;
		var signal = opts.signal || null;
		var onAbort = null;
		//create timeout controller?
		if(opts.timeout > 0 && typeof AbortController !== 'undefined') {
			controller = new AbortController();
			signal = controller.signal;
			//bridge external signal
			if(opts.signal) {
				if(opts.signal.aborted) {
					controller.abort();
				} else {
					onAbort = function() { controller.abort(); };
					opts.signal.addEventListener('abort', onAbort, { once: true });
				}
			}
		}
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
			signal: signal || undefined
		}).finally(function() {
			tid && clearTimeout(tid);
			if(onAbort && opts.signal && typeof opts.signal.removeEventListener === 'function') {
				opts.signal.removeEventListener('abort', onAbort);
			}
		}).then(function(response) {
			//valid response?
			if(response.ok) {
				//process response
				return processResponse(response).then(function(res) {
					resolve(res);
				});
			} else {
				reject(new Error("HTTP " + response.status + " error: " + response.url));
			}
		}).catch(function(err) {
			reject(err);
		});
	});
}
