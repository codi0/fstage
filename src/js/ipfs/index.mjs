//imports
var isNode = (typeof global !== 'undefined');
var Ipfs = await import(isNode ? 'ipfs-core' : 'https://cdn.jsdelivr.net/npm/ipfs/dist/index.min.js');

//use global?
if(!Ipfs || !Ipfs.create) {
	Ipfs = globalThis.Ipfs;
}

//private vars
var nodeCache = {};

//exports
export default function ipfs(config = {}) {
		
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
	nodeCache[config.repo] = Ipfs.create(config).then(function(node) {

		//public API
		var api = {

			node: node,

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

			getCid: function(cid, opts = {}) {
				//cid to string?
				if(cid && typeof cid !== 'string') {
					cid = api.utils.toString(cid);
				}
				//default method?
				if(opts.method !== 'get') {
					opts.method = 'cat';
				}
				//create generator
				var generator = node[opts.method](cid, opts);
				//return
				return api.utils.iterator(generator, opts);
			},

			setCid: function(data, opts = {}) {
				//default opts
				opts = Object.assign({
					cidOnly: true
				}, opts);
				//return
				return node.add(data, opts).then(function(result) {
					return opts.cidOnly ? result.cid.toString() : result;
				});
			},

			setCids: function(source, opts = {}) {
				//create generator
				var generator = node.addAll(source, opts);
				//return
				return api.utils.iterator(generator, opts);
			},

			listCids: function(cid, opts = {}) {
				//cid to string?
				if(cid && typeof cid !== 'string') {
					cid = api.utils.toString(cid);
				}
				//create generator
				var generator = node.ls(cid, opts);
				//return
				return api.utils.iterator(generator, opts);
			},

			publishName: function(cid) {
				return node.name.publish(cid);
			},

			resolveName: function() {
				return node.name.resolve();
			},

			read: function(path, opts = {}) {
				//read dir?
				if(path.indexOf('.') === -1) {
					return api.readDir(path, opts);
				}
				//create generator
				var generator = node.files.read(path, opts);
				//return
				return api.utils.iterator(generator, opts);
			},

			write: function(path, content, opts = {}) {
				//create dir?
				if(path.indexOf('.') === -1) {
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
				//create generator
				var generator = node.files.ls(path, opts);
				//return
				return api.utils.iterator(generator, opts);
			},

			makeDir: function(path, opts = {}) {
				//format opts?
				if(typeof opts === 'boolean') {
					opts = { parents: opts };
				}
				//make dir
				return node.files.mkdir(path, opts);
			},

			utils: {

				toString: function(data) {
					if(data.buffer instanceof ArrayBuffer) {
						return new TextDecoder().decode(data);
					} else {
						return data.toString();
					}
				},

				iterator: function(generator, opts = {}) {
					//format opts?
					if(typeof opts === 'function') {
						opts = { callback: opts };
					}
					//set defaaults
					opts = Object.assign({
						chunks: [],
						buffer: 0,
						toString: true
					}, opts);
					//return stream?
					if(opts.stream) {
						return generator;
					}
					//run loop
					return generator.next().then(function(result) {
						//process value?
						if(result.value) {
							//cache chunk
							opts.chunks.push(result.value);
							//is object?
							if(result.value.length) {
								opts.buffer += result.value.length;
							} else {
								opts.toString = false;
							}
							//execute callback?
							if(opts.callback && opts.callback.call(api, opts.chunks, opts.buffer, result.done ? null : generator) === false) {
								result.done = true;
							}
						}
						//another loop?
						if(!result.done) {
							return api.utils.iterator(generator, opts);
						}
						//format data
						var offset = 0;
						var data = opts.chunks;
						//create array buffer?
						if(opts.buffer > 0) {
							//set buffer length
							data = new Uint8Array(opts.buffer);
							//populate buffer view
							for(var i=0; i < opts.chunks.length; i++) {
								data.set(opts.chunks[i], offset);
								offset += opts.chunks[i].length;
							}
						}
						//to string?
						if(opts.toString) {
							data = api.utils.toString(data);
						}
						//return
						return data;
					});
				}

			},

		};
			
		//return
		return api;

	});

	//return
	return nodeCache[config.repo];

}