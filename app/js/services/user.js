(function(root, undefined) {

	//module callback
	var module = function(self, ctx) {

		self.getProfile = function() {
			return new Promise(function(resolve) {
				setTimeout(function() {
					resolve({ id: 1, name: 'Fstage' });
				}, 1500);
			});
		};

	};

	//module export
	root.export(module);

})(self || window || this);