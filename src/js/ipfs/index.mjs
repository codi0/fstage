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

/**
 * Create and start a Helia IPFS node with a UnixFS interface.
 *
 * By default the node persists its datastore and blockstore to LevelDB
 * under the key `config.name`. Set `config.persist: false` to use
 * in-memory storage instead (useful for ephemeral/test scenarios).
 *
 * The returned Helia instance has a `.fs` property pre-wired with the
 * Helia UnixFS interface, ready for use with `createHlsStream` or
 * direct `helia.fs.cat()` / `helia.fs.ls()` calls.
 *
 * Requires the following CDN globals to be loaded first (handled automatically
 * by the module-level imports):
 * `Helia`, `HeliaUnixfs`, `DatastoreLevel`, `BlockstoreLevel`, `Multiformats`.
 *
 * @param {Object} [config]
 * @param {string}  [config.name='ipfs-helia'] - LevelDB store prefix.
 * @param {boolean} [config.persist=true]       - Persist to LevelDB when `true`;
 *   use in-memory storage when `false`.
 * @returns {Promise<Object>} Resolves with the Helia node instance
 *   (with `.fs` UnixFS interface attached).
 */
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