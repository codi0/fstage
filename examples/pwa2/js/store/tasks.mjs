import { defaultRegistry } from '@fstage/registry';


//get services
const registry = defaultRegistry();
const store = registry.get('store');
const syncManager = registry.get('syncManager');


//on tasks access
store.onAccess('tasks', function(e) {
	//debug...
	console.log('onAccess', e);
	//read data
	e.val = syncManager.read('tasks', {
		default: [],
		refresh: e.refresh,
		remote: {
			uri: 'api/?do=tasks',
			params: e.query,
			resDataPath: 'records'
		}
	});
});

//on tasks change
store.onChange('tasks', function(e) {
	//debug...
	console.log('onChange', e);
	//skip save?
	if(e.loading) {
		return;
	}
	//update tasks data
	e.diff('tasks.*', function(key, val, action) {
		//write data
		return syncManager.write(key, val, {
			remote: {
				uri: 'api/?do=tasks',
				reqDataPath: 'record',
				resIdPath: 'data.id'
			}
		});
	});
});