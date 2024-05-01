export const user = {

	getProfile: function() {
		return new Promise(function(resolve) {
			setTimeout(function() {
				resolve({ id: 1, name: 'Fred' });
			}, 1500);
		});
	}

};