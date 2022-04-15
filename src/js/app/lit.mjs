//imports
import { esc } from '../utils/index.mjs';
import pubsub from '../pubsub/index.mjs';

//exports
export default function lit() {

	//set vars
	var ctx = this;
	var output = '';
	var inAttr = '';
	var args = [].slice.call(arguments);

	//is raw loop?
	if(typeof args[1] === 'function') {
		args[0].forEach(function(val, key) {
			output += (args[1].call(ctx, val, key) || '').trim();
		});
		return { raw: output };
	}

	//is raw?
	if(typeof args[0] === 'function') {
		return { raw: (args[0].call(ctx) || '').trim() };
	}

	//get input
	var input = {
		text: args.shift() || [],
		params: args
	};

	//filter input
	input = pubsub.emit('lit.input', input, {
		filter: true
	});

	//check attribute helper
	var checkAttr = function(text, inAttr) {
		if(text) {
			var tmp = text.match(/\=\s?(\"|\')(.*)?/s);
			if(tmp) {
				return checkAttr(tmp[2] || '', tmp[1]);
			}
			if(inAttr) {
				var tmp = text.split(inAttr);
				if(tmp && tmp.length > 1) {
					tmp.shift();
					return checkAttr(tmp.join(inAttr), '');
				}
			}
		}
		return inAttr;
	};

	//loop through text
	for(var i=0; i < input.text.length; i++) {
		//add text
		output += input.text[i];
		//update inAttr
		inAttr = checkAttr(input.text[i], inAttr);
		//add param?
		if(input.params[i]) {
			if(typeof input.params[i].raw === 'string') {
				output += input.params[i].raw;
			} else {
				output += esc(input.params[i], inAttr ? 'attr' : 'html');
			}
		}
	}

	//return
	return output.trim();

}