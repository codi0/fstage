//imports
import { forEach, capitalize } from '../utils/index.mjs';

//form wrapper
function wrapForm(el, opts={}) {
	//set vars
	var step = '';
	var values = {};
	var errors = {};
	//set fields?
	if(!opts.fields) {
		opts.fields = {};
	}
	//validate helper
	var validate = function(field) {
		//set vars
		var isValid = true;
		//loop through fields
		forEach(opts.fields, function(v, k) {
			//skip field?
			if(field && key !== field) {
				return;
			};
			//field found?
			if(el[k]) {
				//get field value
				var value = el[k].value.trim();
				//remove error
				removeError(k);
				//filter value?
				if(v.filter) {
					value = v.filter(value, el);
				}
				//validate value?
				if(v.validator) {
					//call validator
					var res = v.validator(value, el);
					//error returned?
					if(res instanceof Error) {
						addError(k, res.message);
						isValid = false;
					}
				}
				//cache value
				values[k] = value;
			}
		});
		//return
		return isValid;	
	};
	//add error helper
	var addError = function(field, message) {
		//valid field?
		if(!el[field]) return;
		//create error node
		var err = document.createElement('div');
		err.classList.add('error');
		err.innerHTML = message;
		//add to cache
		errors[field] = message;
		//is multi?
		if(el[field].parentNode) {
			//add error meta
			el[field].classList.add('has-error');
			//add error node
			el[field].parentNode.insertBefore(err, el[field].nextSibling);
		} else {
			//add error meta
			forEach(el[field], function(el) {
				el.classList.add('has-error');
			});
			//add error node
			el[field][0].parentNode.appendChild(err);
		}
	};
	//remove error helper
	var removeError = function(field) {
		//valid field?
		if(!el[field]) return;
		//is multi?
		if(el[field].parentNode) {
			//remove error meta
			el[field].classList.remove('has-error');
			//remove error node
			var err = el[field].parentNode.querySelector('.error');
			err && err.parentNode.removeChild(err);
		} else {
			//remove field meta
			forEach(el[field], function(el) {
				el.classList.remove('has-error');
			});
			//remove error node
			var err = el[field][0].parentNode.querySelector('.error');
			err && err.parentNode.removeChild(err);
		}
		//delete cache?
		if(errors[field]) {
			delete errors[field];
		}
	};
	//Method: render field
	el.render = function(type, name, opts = {}) {
		//set tag
		var html = '';
		var tag = type;
		//set type?
		if(tag === 'input') {
			type = 'text';
		} else if(tag !== 'select' && tag !== 'textarea') {
			tag = 'input';
		}
		//remove name?
		if(type === 'submit' || type === 'html') {
			opts.value = name || 'Submit';
			name = '';
		}
		//create field wrapper
		var wrap = document.createElement('div');
		wrap.classList.add('field', type, name || 'no-label');
		//create label?
		if(name && ![ '', false, null].includes(opts.label)) {
			var label = document.createElement('label');
			label.setAttribute('for', name);
			label.innerHTML = capitalize(opts.label || name) + (opts.required ? '*' : '');
			wrap.appendChild(label);
		}
		//is multi checkox or radio?
		if((type === 'checkbox' || type === 'radio') && opts.options) {
			//create group wrap
			var isCheckbox = (type === 'checkbox');
			var group = document.createElement('span');
			group.classList.add(type + '-group');
			wrap.appendChild(group);
			//loop through options
			forEach(opts.options, function(val, key) {
				//create item wrap
				var item = document.createElement('span');
				item.classList.add(type + '-wrap');
				group.appendChild(item);
				//create input
				var input = document.createElement('input');
				input.setAttribute('id', name + '-' + key);
				input.setAttribute('type', type);
				input.setAttribute('name', name + (isCheckbox ? '[' + key + ']' : ''));
				input.setAttribute('value', isCheckbox ? '1' : key);
				//is checked?
				if(opts.value && (key == opts.value || opts.value[key])) {
					input.setAttribute('checked', '');
				}
				//create label
				var label = document.createElement('label');
				label.setAttribute('for', name + '-' + key);
				label.innerHTML = capitalize(val);
				//add to item
				item.appendChild(input);
				item.appendChild(label);
			});
		} else if(type === 'html') {
			//set raw html
			wrap.innerHTML = name;
		} else {
			//create element
			var el = document.createElement(tag);
			wrap.appendChild(el);
			//set core attributes
			opts.type = type;
			opts.name = name;
			//add attributes
			forEach(opts, function(val, key) {
				//valid value?
				if(val && (val === true || typeof val === 'string')) {
					//format val
					val = (val === true) ? '' : val;
					//valid key?
					if(![ 'wrap', 'label' ].includes(key)) {
						el.setAttribute(key, val);
					}
				}
			});
			//is select?
			if(tag === 'select') {
				//loop through options
				forEach(opts.options, function(val, key) {
					//empty value?
					if(!val) {
						return;
					}
					//create option
					var option = document.createElement('option');
					option.value = key;
					option.innerHTML = val;
					//is selected?
					if(opts.value == key) {
						option.selected = true;
					}
					//append to element
					el.appendChild(option);
				});
			}
		}
		//add to form
		el.appendChild(wrap);
		//return
		return el;
	};
	//Method: get or set step
	el.step = function(name = null) {
		//set step?
		if(name) {
			//update state
			step = name;
			//update DOM
			forEach(el.querySelectorAll('.step'), function(el) {
				var isStep = el.classList.contains(step);
				el.classList[isStep ? 'remove' : 'add']('hidden');
			});
		}
		//return
		return step;
	};
	//Method: get or set errors
	el.err = function(field = null, message = null) {
		//set error?
		if(field && message) {
			addError(field, message);
		}
		//return errors
		return field ? (errors[field] || null) : errors;
	};
	//Method: get or set values
	el.val = function(field = null, val = null) {
		//set field?
		if(field && val && el[field]) {
			el[field] = val;
		}
		//return values
		return field ? (values[field] || null) : values;
	};
	//Method: reset fields
	el.reset = function(field = null, skip = []) {
		//loop through fields
		forEach(opts.fields, function(v, k) {
			//reset field?
			if(el[k] && !skip.includes(k) && (!field || field === k)) {
				//is checked?
				if(el[k] instanceof NodeList) {
					//loop through nodes
					forEach(el[k], function(el) {
						el.checked = el.defaultChecked;
					});
				}
				//default value
				el[k].value = values[k] = el[k].defaultValue;
				//clear error
				removeError(k);
			}
		});
	};
	//Method: validate form
	el.isValid = function(key = null) {
		return validate(key);
	};
	//add focus listeners
	forEach(opts.fields, function(v, k) {
		//valid field?
		if(!el[k]) return;
		//get fields
		var fields = el[k].parentNode ? [ el[k] ] : el[k];
		//loop through fields
		forEach(fields, function(el) {
			//add focus listener
			el.addEventListener('focus', function(e) {
				removeError(k);
			});
			//add blur listener
			el.addEventListener('blur', function(e) {
				validate(k);
			});
		});
	});
	//add submit listener
	el.addEventListener('click', function(e) {
		//is submit?
		if(e.target.type !== 'submit') {
			return;
		}
		//is valid?
		if(el.isValid()) {
			if(opts.onSuccess) {
				opts.onSuccess(values, errors, el);
			}
		} else {
			if(opts.onError) {
				opts.onError(values, errors, el);
			}
		}
	}, true);
	//return
	return el;
}

//create form
export function createForm(el, opts={}) {
	//element exists?
	if(typeof el === 'string') {
		if(document[el]) {
			el = document[el];
		} else {
			el = document.createElement('form');
			el.setAttribute('name', name);
			el.setAttribute('id', name + '-form');
			el.setAttribute('method', opts.method || 'post');
		}
	}
	//wrap form?
	if(!el.step) {
		el = wrapForm(el);
	}
	//return
	return el;
}