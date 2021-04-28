(function(root, undefined) {

	//module api
	var module = function(store, ctx) {

		store.middleware('getProfile', function(action) {
			//update payload
			action.payload = ctx.user.getProfile();
			//define reducer
			action.reducer = function(state, payload) {
				state.merge('user', payload);
			}
			//return
			return action;
		});

	};

	//module export
	root.export(module);

})(window || self || this);