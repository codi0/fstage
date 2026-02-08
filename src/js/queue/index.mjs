//imports
import { scheduleTask } from '../utils/index.mjs';

//private vars
const _cache = {};

//create queue helper
export function createQueue(config={}) {

	//public api
	const api = {

		pending: {
			micro: new Map(),
			macro: new Map(),
			afterMacro: new Map()
		},

		has: function(cb, scheduler='micro') {
			return api.pending[scheduler] && api.pending[scheduler].has(cb);
		},

		add: function(cb, args=[], scheduler='micro') {
			//run now?
			if(scheduler === 'sync') {
				return cb(...args);
			}
			//current value
			var arr = api.pending[scheduler].get(cb) || [];
			//add args
			arr.push(args);
			//update queue
			api.pending[scheduler].set(cb, arr);
			//schedule queue
			api.schedule(scheduler);
		},

		remove: function(cb, scheduler='micro') {
			return api.pending[scheduler] && api.pending[scheduler].delete(cb);
		},

		schedule: function(scheduler='micro') {
			//already scheduled?
			if(api.pending[scheduler].scheduled) {
				return;
			}
			//mark as scheduled
			api.pending[scheduler].scheduled = true;
			//create queue
			var run = function() {
				//get batch
				var batch = api.pending[scheduler];
				//reset queue
				api.pending[scheduler] = new Map();
				//start loop
				for(var [ cb, argsArr ] of batch) {
					//loop through args
					for(var i=0; i < argsArr.length; i++) {
						cb(...argsArr[i]);
					}
				}
			};
			//get frame
			var frameNum = (scheduler == 'afterMacro') ? 2 : (scheduler == 'macro' ? 1 : 0);
			//schedule
			scheduleTask(run, frameNum);
		}

	};

	//return
	return api;

}