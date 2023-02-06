//imports
import { capitalize } from '../utils/index.mjs';

//form wrapper
export default function form(name, opts = {}) {
	//set vars
	var step = '';
	var values = {};
	var errors = {};
	var formEl = (typeof name == 'string') ? document[name] : name;
	//create form?
	if(!formEl) {
		return form.create(name, opts);
	}
	//already created?
	if(formEl.step) {
		return formEl;
	}
	//set fields?
	if(!opts.fields) {
		opts.fields = {};
	}
	//validate helper
	var validate = function(field) {
		//set vars
		var isValid = true;
		//loop through fields
		opts.fields.forEach(function(v, k) {
			//skip field?
			if(field && k !== field) {
				return;
			}
			//field found?
			if(formEl[k]) {
				//get field value
				var value = formEl[k].value.trim();
				//remove error
				removeError(k);
				//filter value?
				if(v.filter) {
					value = v.filter.call(form, value);
				}
				//validate value?
				if(v.validator) {
					//call validator
					var res = v.validator.call(form, value);
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
		if(!formEl[field]) return;
		//create error node
		var err = document.createElement('div');
		err.classList.add('error');
		err.innerHTML = message;
		//add to cache
		errors[field] = message;
		//is multi?
		if(formEl[field].parentNode) {
			//add error meta
			formEl[field].classList.add('has-error');
			//add error node
			formEl[field].parentNode.insertBefore(err, formEl[field].nextSibling);
		} else {
			//add error meta
			formEl[field].forEach(function(el) {
				el.classList.add('has-error');
			});
			//add error node
			formEl[field][0].parentNode.appendChild(err);
		}
	};
	//remove error helper
	var removeError = function(field) {
		//valid field?
		if(!formEl[field]) return;
		//is multi?
		if(formEl[field].parentNode) {
			//remove error meta
			formEl[field].classList.remove('has-error');
			//remove error node
			var err = formEl[field].parentNode.querySelector('.error');
			err && err.parentNode.removeChild(err);
		} else {
			//remove field meta
			formEl[field].forEach(function(el) {
				el.classList.remove('has-error');
			});
			//remove error node
			var err = formEl[field][0].parentNode.querySelector('.error');
			err && err.parentNode.removeChild(err);
		}
		//delete cache?
		if(errors[field]) {
			delete errors[field];
		}
	};
	//Method: render field
	formEl.render = function(type, name, opts = {}) {
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
			opts.options.forEach(function(val, key) {
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
			opts.forEach(function(val, key) {
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
				(opts.options || {}).forEach(function(val, key) {
					//skip?
					if(!val) return;
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
		formEl.appendChild(wrap);
		//return
		return el;
	};
	//Method: get or set step
	formEl.step = function(name = null) {
		//set step?
		if(name) {
			//update state
			step = name;
			//update DOM
			formEl.querySelectorAll('.step').forEach(function(el) {
				var isStep = el.classList.contains(step);
				el.classList[isStep ? 'remove' : 'add']('hidden');
			});
		}
		//return
		return step;
	};
	//Method: get or set errors
	formEl.err = function(field = null, message = null) {
		//set error?
		if(field && message) {
			addError(field, message);
		}
		//return errors
		return field ? (errors[field] || null) : errors;
	};
	//Method: get or set values
	formEl.val = function(field = null, val = null) {
		//set field?
		if(field && val && formEl[field]) {
			formEl[field] = val;
		}
		//return values
		return field ? (values[field] || null) : values;
	};
	//Method: reset fields
	formEl.reset = function(field = null, skip = []) {
		//loop through fields
		opts.fields.forEach(function(v, k) {
			//reset field?
			if(formEl[k] && !skip.includes(k) && (!field || field === k)) {
				//is checked?
				if(formEl[k] instanceof NodeList) {
					//loop through nodes
					formEl[k].forEach(function(el) {
						el.checked = el.defaultChecked;
					});
				}
				//default value
				formEl[k].value = values[k] = formEl[k].defaultValue;
				//clear error
				removeError(k);
			}
		});
	};
	//Method: validate form
	formEl.isValid = function(key = null) {
		return validate(key);
	};
	//add focus listeners
	opts.fields.forEach(function(v, k) {
		//valid field?
		if(!formEl[k]) return;
		//get fields
		var fields = formEl[k].parentNode ? [ formEl[k] ] : formEl[k];
		//loop through fields
		fields.forEach(function(el) {
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
	formEl.addEventListener('click', function(e) {
		//is submit?
		if(e.target.type !== 'submit') {
			return;
		}
		//is valid?
		if(formEl.isValid()) {
			if(opts.onSuccess) {
				opts.onSuccess.call(form, values, errors);
			}
		} else {
			if(opts.onError) {
				opts.onError.call(form, values, errors);
			}
		}
	}, true);
	//return
	return formEl;
};

//create form
form.create = function(name, opts = {}) {
	//create element
	var formEl = form(document.createElement('form'));
	//set attributes
	formEl.setAttribute('name', name);
	formEl.setAttribute('id', name + '-form');
	formEl.setAttribute('method', opts.method || 'post');
	//add to parent?
	if(opts.parent) {
		//query selector
		if(typeof opts.parent === 'string') {
			opts.parent = document.querySelector(opts.parent);
		}
		//add to parent
		opts.parent.appendChild(formEl);
	}
	//return
	return formEl;
};