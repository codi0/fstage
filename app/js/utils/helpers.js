(function(root, undefined) {

	//module callback
	var module = function(ctx) {
	
		//add utils
		var utils = {

			usefulFn: function() {
				console.log('Hi there!');
			}

		};
		
		//return
		return utils;

	};

	//export module
	root.export(module);

})(self || window || this);