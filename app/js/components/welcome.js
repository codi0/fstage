(function(root, undefined) {

	//module api
	var api = function(self, ctx) {

		//generate css
		self.css = function() {
			return `
				scoped .content {
					display: flex;
					justify-content: center;
					align-items: center;
					height: 100%;
				}
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
				<div class="content">${self.store.user ? 'Welcome to ' + self.store.user.name + '!' : 'Hi there...'}</div>
				<button data-route="${ctx.routes.ABOUT}">Page transition</button>
			`;
		};
		
		self.onDidMount = function() {
			//query store
			self.actions.getProfile();
			//set page title
			document.title = 'Welcome to Fstage';
		};

	};

	//module export
	root.export(api);

})(self || window || this);