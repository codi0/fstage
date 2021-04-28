(function(root, undefined) {

	//module api
	var api = function(self, ctx) {
	
		//initial state
		self.state = {
			data: {}
		};

		//generate css
		self.css = function() {
			return `
				scoped button {
					position: absolute;
					width: calc(100% - 20px);
					left: 10px;
					bottom: 10px;
				}
			`;
		};

		//generate html
		self.html = function() {
			return self.lit`
				<div class="content">
					<p><b>Wow, a new page!</b></p>
					${self.lit(self.state.data, function(k, v) {
						return `<p>${k}: ${v}</p>`;
					})}
				</div>
				<button data-route="back">Go back</button>
			`;
		};

		//on mounted
		self.onDidMount = function() {
			//set page title
			document.title = 'Page transition :)';
			//simulate state change
			setTimeout(function() {
				self.state.data = {
					1: 'One',
					2: 'Two',
					3: 'Three',
					'Uh': 'What is this...?'
				};
			}, 1900);
		};

	};

	//module export
	root.export(api);

})(self || window || this);