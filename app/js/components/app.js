(function(root, undefined) {
	
	//module api
	var api = function(self, ctx) {

		//generate css
		self.css = function() {
			return `
				html {
					overflow-y: hidden;
				}
				scoped {
					height: 100%;
					--header-height: 45px;
				}
				scoped header {
					font-size: 1.3em;
					height: var(--header-height);
					line-height: var(--header-height);
					text-align: center;
					color: #fff;
					background: #012847;
				}
				scoped button {
					background: #f02989;
					border-radius: 10px;
				}
				scoped .page {
					position: absolute;
					top: var(--header-height);
					left: 0;
					width: 100%;
					height: calc(100% - var(--header-height));
					margin-top: 0;
					padding: 10px;
				}
			`;
		};

		//generate html
		self.html = function() {
			return self.lit`
				<header>${ctx.config.name}</header>
				<div data-component="${self.store.route.name}" class="page"></div>
			`;
		};

	};
	
	//module export
	root.export(api);

})(self || window || this);