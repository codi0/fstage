var http = require('http');
var fstage = require('../../src/js/fstage.js');

http.createServer(function(req, res) {
	//parse request
	fstage.env.parseReq(req);
	//load fstage modules
	fstage.ready(function() {
		res.end('Hello World: ' + fstage.version);
	});
}).listen(8000);

console.log('Server running at http://localhost:8000/');