//imports
import 'https://cdn.jsdelivr.net/npm/helia/dist/index.min.js';
import 'https://cdn.jsdelivr.net/npm/@helia/unixfs/dist/index.min.js';
import 'https://cdn.jsdelivr.net/npm/datastore-level/dist/index.min.js';
import 'https://cdn.jsdelivr.net/npm/blockstore-level/dist/index.min.js';
import 'https://cdn.jsdelivr.net/npm/multiformats/dist/index.min.js';

//export globals
export var createHelia = Helia.createHelia;
export var libp2pDefaults = Helia.libp2pDefaults;
export var LevelDatastore = DatastoreLevel.LevelDatastore;
export var LevelBlockstore = BlockstoreLevel.LevelBlockstore;
export var unixfs = HeliaUnixfs.unixfs;
export var CID = Multiformats.CID;

//private vars
var instances = {};

//export create node wrapper
export function createNode(config={}) {
	//set detaults
	config = Object.assign({
		name: 'ipfs-helia',
		persist: true
	}, config || {});
	//create instance?
	if(!instances[config.name]) {
		//helia config
		var hc = {};
		//persist?
		if(config.persist) {
			var datastore = new LevelDatastore(config.name);
			var blockstore = new LevelBlockstore(config.name);
			hc = { datastore, blockstore, libp2pDefaults };
		}
		//create helia node
		instances[config.name] = createHelia(hc).then(function(helia) {
			//add unix filesystem
			helia.fs = unixfs(helia);
			//return
			return helia;
		});
	}
	//return
	return instances[config.name];
}

//set globals?
if(globalThis.Fstage) {
	Fstage.ipfs = createNode;
}