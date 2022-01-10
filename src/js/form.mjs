//form wrapper
export function form(name, opts = {}) {
	//set vars
	var step = '';
	var values = {};
	var errors = {};
	var form = document[name];
	//valid form?
	if(!form) {
		throw new Error('Form not found:' + name);
	}
	//already created?
	if(form.step) {
		return form;
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
			if(form[k]) {
				//get field value
				var value = form[k].value.trim();
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
		if(!form[field]) return;
		//create error node
		var err = document.createElement('div');
		err.classList.add('error');
		err.innerHTML = message;
		//add to cache
		errors[field] = message;
		//is multi?
		if(form[field].parentNode) {
			//add error meta
			form[field].classList.add('has-error');
			//add error node
			form[field].parentNode.insertBefore(err, form[field].nextSibling);
		} else {
			//add error meta
			form[field].forEach(function(el) {
				el.classList.add('has-error');
			});
			//add error node
			form[field][0].parentNode.appendChild(err);
		}
	};
	//remove error helper
	var removeError = function(field) {
		//valid field?
		if(!form[field]) return;
		//is multi?
		if(form[field].parentNode) {
			//remove error meta
			form[field].classList.remove('has-error');
			//remove error node
			var err = form[field].parentNode.querySelector('.error');
			err && err.parentNode.removeChild(err);
		} else {
			//remove field meta
			form[field].forEach(function(el) {
				el.classList.remove('has-error');
			});
			//remove error node
			var err = form[field][0].parentNode.querySelector('.error');
			err && err.parentNode.removeChild(err);
		}
		//delete cache?
		if(errors[field]) {
			delete errors[field];
		}
	};
	//Method form step
	form.step = function(name = null) {
		//set step?
		if(name) {
			//update state
			step = name;
			//update DOM
			form.querySelectorAll('.step').forEach(function(el) {
				var isStep = el.classList.contains(step);
				el.classList[isStep ? 'remove' : 'add']('hidden');
			});
		}
		//return
		return step;
	};
	//Method: get errors
	form.err = function(field = null, message = null) {
		//set error?
		if(field && message) {
			addError(field, message);
		}
		//return error(s)
		return field ? (errors[field] || null) : errors;
	};
	//Method: get values
	form.val = function(field = null) {
		return field ? (values[field] || null) : values;
	};
	//Method: reset fields
	form.reset = function(field = null, skip = []) {
		//loop through fields
		opts.fields.forEach(function(v, k) {
			//reset field?
			if(form[k] && !skip.includes(k) && (!field || field === k)) {
				//is checked?
				if(form[k] instanceof NodeList) {
					//loop through nodes
					form[k].forEach(function(el) {
						el.checked = el.defaultChecked;
					});
				}
				//default value
				form[k].value = values[k] = form[k].defaultValue;
				//clear error
				removeError(k);
			}
		});
	};
	//Method: validate form
	form.isValid = function(key = null) {
		return validate(key);
	};
	//add focus listeners
	opts.fields.forEach(function(v, k) {
		//valid field?
		if(!form[k]) return;
		//get fields
		var fields = form[k].parentNode ? [ form[k] ] : form[k];
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
	form.addEventListener('click', function(e) {
		//is submit?
		if(e.target.type !== 'submit') {
			return;
		}
		//prevent default
		e.preventDefault();
		//is valid?
		if(form.isValid()) {
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
	return form;
};