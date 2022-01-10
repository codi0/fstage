export function middleware(store, ctx) {

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

}