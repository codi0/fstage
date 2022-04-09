//import ipfs
import 'https://cdn.jsdelivr.net/npm/ipfs/dist/index.min.js';

//private vars
var nodeCache = {};

//export ipfs wrapper
export function ipfs(config = {}) {
		
	//format config?
	if(typeof config === 'string') {
		config = { repo: config };
	}

	//config defaults
	config = Object.assign({
		repo: 'ipfs'
	}, config);
		
	//return from cache?
	if(nodeCache[config.repo]) {
		return nodeCache[config.repo];
	}

	//create instance
	nodeCache[config.repo] = globalThis.Ipfs.create(config).then(function(node) {

		//public API
		var api = {

			node: node,
				
			ipfs: ipfs,
				
			genIterate: function(generator, callback, chunks=[]) {
				//run loop
				return generator.next().then(function(result) {
					//add chunk?
					if(result && typeof result.value !== 'undefined') {
						chunks.push(result.value);
					}
					//has callback?
					if(callback) {
						//exec callback
						var res = callback.call(api, result, chunks, generator);
						//stop here?
						if(res !== null && typeof res !== 'undefined') {
							return res;
						}
					}
					//next loop?
					if(result && !result.done) {
						return api.genIterate(generator, callback, chunks);
					}
					//return
					return chunks;
				});
			},

			on: function(event, callback) {
				return node.on(event, callback);
			},

			meta: function(key = null) {
				return node.id().then(function(result) {
					return key ? result[key] : result;
				});
			},

			id: function() {
				return api.meta('id');
			},

			isOnline: function() {
				return Promise.resolve(node.isOnline());
			},

			read: function(path, opts = {}) {
				//read dir?
				if(path.indexOf('.') == -1) {
					return api.readDir(path, opts);
				}
				//set vars
				var generator = node.files.read(path, opts);
				//return stream?
				if(opts.stream) {
					return generator;
				}
				//run loop
				return api.genIterate(generator, opts.callback);
			},

			write: function(path, content, opts = {}) {
				//create dir?
				if(path.indexOf('.') == -1) {
					return api.makeDir(path, opts);
				}
				//write file
				return node.files.write(path, content, opts);
			},

			delete: function(path, opts = {}) {
				//format opts?
				if(typeof opts === 'boolean') {
					opts = { recursive: opts };
				}
				//remove file or dir
				return node.files.rm(path, opts);
			},

			copy: function(from, to, opts = {}) {
				return node.files.cp(from, to, opts);
			},

			move: function(from, to, opts = {}) {
				return node.files.mv(from, to, opts);
			},

			touch: function(path, opts = {}) {
				return node.files.touch(path, opts);
			},

			chmod: function(path, mode, opts = {}) {
				return node.files.chmod(path, mode, opts);
			},

			flush: function(path, opts = {}) {
				return node.files.flush(path, opts);
			},

			stat: function(path) {
				return node.files.stat(path);
			},

			isFile: function(path, type='file') {
				return node.files.stat(path).then(function(result) {
					return (result.type == type);
				});
			},

			isDir: function(path) {
				return api.isFile(path, 'directory');
			},

			listDir: function(path, opts = {}) {
				//set vars
				var generator = node.files.ls(path, opts);
				//return stream?
				if(opts.stream) {
					return generator;
				}
				//run loop
				return api.genIterate(generator, opts.callback);
			},

			makeDir: function(path, opts = {}) {
				//format opts?
				if(typeof opts === 'boolean') {
					opts = { parents: opts };
				}
				//make dir
				return node.files.mkdir(path, opts);
			},

			cid: {

				get: function(cid, opts = {}) {
					//cid to string?
					if(cid && typeof cid !== 'string') {
						cid = cid.toString();
					}
					//default opts
					opts = Object.assign({
						string: !opts.tree,
					}, opts);
					//set vars
					var method = opts.tree ? 'get' : 'cat';
					var generator = node[method](cid, opts);
					//return stream?
					if(opts.stream) {
						return generator;
					}
					//run loop
					return api.genIterate(generator, opts.callback).then(function(chunks) {
						//to string?
						if(opts.string) {
							chunks = chunks.toString();
						}
						//return
						return chunks;
					});
				},

				getTree: function(cid, opts = {}) {
					//use tree
					opts.tree = true;
					//return
					return api.get(cid, opts);
				},

				listTree: function(cid, opts = {}) {
					//set vars
					var generator = node.ls(cid, opts);
					//return stream?
					if(opts.stream) {
						return generator;
					}
					//run loop
					return api.genIterate(generator, opts.callback);
				},

				set: function(data, opts = {}) {
					//default opts
					opts = Object.assign({
						cidOnly: true
					}, opts);
					//return
					return node.add(data, opts).then(function(result) {
						return opts.cidOnly ? result.cid.toString() : result;
					});
				},

				setAll: function(source, opts = {}) {
					//set vars
					var generator = node.addAll(source, opts);
					//return stream?
					if(opts.stream) {
						return generator;
					}
					//run loop
					return api.genIterate(generator, opts.callback);
				}

			}

		};
			
		//return
		return api;

	});

	//return
	return nodeCache[config.repo];

}