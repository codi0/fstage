export const notfound = {

	html: function() {
		return this.lit`
			<div class="content">
				<p>Oops, page not found.</p>
				<p><a data-route="${this.context.routes.HOME}">Back home &raquo;</a></p>
			</div>
		`;
	},
		
	onDidMount: function() {
		//set page title
		document.title = 'Page not found';
	}

}