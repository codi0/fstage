var http = require('http');
var fstage = require('fstage');

http.createServer(function(req, res) {
	//parse request
	fstage.env.parseReq(req);
	//load fstage modules
	fstage.ready('@all', function(exports) {
		var output = 'Fstage v ' + fstage.version + ":\n";
		for(var k in exports) {
			output += "\n" + k;
		}
		res.end(output);
	});
}).listen(8000);

console.log('Server running at http://localhost:8000/');