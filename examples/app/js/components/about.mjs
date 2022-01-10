export const about = {
	
	state: {
		data: {}
	},

	css: function() {
		return `
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
			<div class="content">
				<p><b>A new page</b></p>
				${this.lit(this.state.data, function(val) {
					return `<p>${val}</p>`;
				})}
			</div>
			<button data-route="back">Go back</button>
		`;
	},

	onDidMount: function() {
		//set vars
		var that = this;
		//set page title
		document.title = 'Page transition :)';
		//simulate state change
		setTimeout(function() {
			that.state.data = [
				'1... 2... 3...',
				'Simulating a state object change'
			];
		}, 1900);
	}

};