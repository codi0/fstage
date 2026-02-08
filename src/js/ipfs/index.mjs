//imports
import 'https://cdn.jsdelivr.net/npm/helia/dist/index.min.js';
import 'https://cdn.jsdelivr.net/npm/@helia/unixfs/dist/index.min.js';
import 'https://cdn.jsdelivr.net/npm/datastore-level/dist/index.min.js';
import 'https://cdn.jsdelivr.net/npm/blockstore-level/dist/index.min.js';
import 'https://cdn.jsdelivr.net/npm/multiformats/dist/index.min.js';

//export globals
export const createHelia = Helia.createHelia;
export const libp2pDefaults = Helia.libp2pDefaults;
export const LevelDatastore = DatastoreLevel.LevelDatastore;
export const LevelBlockstore = BlockstoreLevel.LevelBlockstore;
export const unixfs = HeliaUnixfs.unixfs;
export const CID = Multiformats.CID;

//export create node wrapper
export function createIpfsNode(config={}) {
	//set detaults
	config = Object.assign({
		name: 'ipfs-helia',
		persist: true
	}, config || {});
	//helia config
	var hc = {};
	//use persist?
	if(config.persist) {
		var datastore = new LevelDatastore(config.name);
		var blockstore = new LevelBlockstore(config.name);
		hc = { datastore, blockstore, libp2pDefaults };
	}
	//create helia node
	return createHelia(hc).then(function(helia) {
		//add unix filesystem
		helia.fs = unixfs(helia);
		//return
		return helia;
	});
}