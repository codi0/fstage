//imports
import { createHeila, libp2pDefaults } from 'helia';
import { unixfs } from '@helia/unixfs';
import { LevelDatastore } from 'datastore-level';
import { LevelBlockstore } from 'blockstore-level';
import { CID } from 'multiformats/cid';

//export globals
export createHelia;
export libp2pDefaults;
export LevelDatastore;
export LevelBlockstore;
export unixfs;
export CID;

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