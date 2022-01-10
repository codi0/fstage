export const home = {

	css: function() {
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
	},

	html: function() {
		return this.lit`
			<div class="content">${this.store.user ? 'Welcome to ' + this.store.user.name + '!' : 'Hi there...'}</div>
			<button data-route="${this.context.routes.ABOUT}">Page transition</button>
		`;
	},
		
	onDidMount: function() {
		//query store
		this.actions.getProfile();
		//set page title
		document.title = 'Welcome to Fstage';
	}

}