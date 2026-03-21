/**
 * @fstage/form
 *
 * Store-backed declarative form lifecycle manager. Field values live in the
 * component store (declared in `state`, kept in sync via `bind`) — the form
 * module is purely a validation, error-display, and submit-lifecycle layer.
 *
 * Because values are reactive store state, the component's render function has
 * full access to them: disabled buttons, live character counts, dependent field
 * visibility, and any other value-driven UI work naturally without any special
 * form-module API.
 *
 * In a component, mount/unmount is handled automatically by the component
 * runtime when a `form` or `forms` block is present in the definition.
 *
 * Typical component usage:
 * ```js
 * state: {
 *   email:    '',
 *   password: '',
 * },
 *
 * bind: {
 *   '[name="email"]':    'email',
 *   '[name="password"]': 'password',
 * },
 *
 * form: {
 *   fields: {
 *     email:    { required: true, type: 'email' },
 *     password: { required: true, minLength: 8 },
 *   },
 *   onSubmit(values, form, ctx) { ... },
 *   onError(errors, form, ctx)  { ... },
 * },
 *
 * render({ html, state }) {
 *   return html`
 *     <form name="form">
 *       <input name="email"    .value=${state.email}>
 *       <input name="password" .value=${state.password} type="password">
 *       <button type="submit" ?disabled=${!state.email || !state.password}>
 *         Sign in
 *       </button>
 *     </form>
 *   `;
 * },
 * ```
 *
 * ─── Field definition options ────────────────────────────────────────────────
 *   required      {boolean}   Must be non-empty.
 *   minLength     {number}    Minimum string length.
 *   maxLength     {number}    Maximum string length.
 *   type          {string}    'email' | 'url' | 'number' | 'date' — format check.
 *   oneOf         {Array}     Value must appear in this list.
 *   min           {number}    Numeric or date-string minimum.
 *   max           {number}    Numeric or date-string maximum.
 *   validate      {Function}  (value, values) => string|null  — custom sync rule.
 *   validateAsync {Function}  (value, values) => Promise<string|null> — async rule.
 *   enabled       {Function}  (values) => boolean — false skips validation and
 *                             excludes the field from submitted values.
 *   default       {*}         Value written back to state on reset(). Defaults to ''.
 *   validateOn    {string}    'blur' | 'change' — overrides the form-level setting.
 *
 * ─── Form definition options ─────────────────────────────────────────────────
 *   fields        {Object}    Field definitions (required).
 *   validate      {Function}  (values) => { field: msg } | null — form-level sync
 *                             rule, runs after all field rules on submit.
 *   onSubmit      {Function}  (values, form, ctx) => void|Promise
 *   onError       {Function}  (errors, form, ctx) => void
 *   validateOn    {string}    'blur' (default) | 'change'
 *   debounce      {number}    ms to debounce async validation (default: 300).
 *
 * ─── DOM conventions ─────────────────────────────────────────────────────────
 *   - `novalidate` is added to the form element on mount.
 *   - Errors are injected as <div class="form-error"> immediately after the
 *     offending field, or after the last element of a radio/checkbox group.
 *   - The field (or each group element) receives the class 'field-invalid'.
 *   - Both are removed as soon as the field passes validation.
 *   - Submit buttons receive the `disabled` attribute during async submission.
 */

import { debounce } from '../utils/index.mjs';


// =============================================================================
// createFormManager
// =============================================================================

/**
 * Create a form manager — a thin factory wrapper around `createForm`.
 * Instantiated once at app boot and passed to `createRuntime` as
 * `config.formManager`.
 *
 * Usage in config:
 * ```js
 * var formManager = e.get('form.createFormManager', []);
 * ```
 *
 * @returns {{ create(def: Object, ctx: Object): Object }}
 */
export function createFormManager() {
	return {
		/**
		 * Create a form controller for a component instance.
		 *
		 * @param {Object} def - Form definition (fields, onSubmit, onError, etc.).
		 * @param {Object} ctx - Component ctx; provides state reads/writes and is
		 *   passed as the third argument to onSubmit/onError.
		 * @returns {Object} Form controller.
		 */
		create: function(def, ctx) {
			return createForm(def, ctx);
		}
	};
}


// =============================================================================
// Built-in validators
// =============================================================================

/** @type {Object<string, RegExp>} Format patterns for the `type` rule. */
var TYPE_PATTERNS = {
	email:  /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
	url:    /^https?:\/\/.+/,
	date:   /^\d{4}-\d{2}-\d{2}$/,
	number: /^-?\d+(\.\d+)?$/,
};

/**
 * Run built-in rule checks against a single field value.
 * Rules are evaluated in declaration order; the first failure is returned.
 *
 * @param {*}      value - Field value read from store.
 * @param {Object} rules - Field definition.
 * @returns {string|null} Error message, or null if all rules pass.
 */
function runBuiltInRules(value, rules) {
	var str = (value === null || value === undefined) ? '' : String(value).trim();

	if (rules.required && !str) {
		return rules.requiredMessage || 'This field is required';
	}

	// All remaining rules are skipped when the field is empty
	if (!str) return null;

	if (rules.minLength !== undefined && str.length < rules.minLength) {
		return rules.minLengthMessage || ('Minimum length is ' + rules.minLength);
	}

	if (rules.maxLength !== undefined && str.length > rules.maxLength) {
		return rules.maxLengthMessage || ('Maximum length is ' + rules.maxLength);
	}

	if (rules.type && TYPE_PATTERNS[rules.type] && !TYPE_PATTERNS[rules.type].test(str)) {
		return rules.typeMessage || ('Please enter a valid ' + rules.type);
	}

	if (rules.oneOf && !rules.oneOf.includes(value)) {
		return rules.oneOfMessage || ('Must be one of: ' + rules.oneOf.join(', '));
	}

	if (rules.min !== undefined || rules.max !== undefined) {
		// Date strings compare lexicographically, which is correct for ISO 8601
		var comparable = (rules.type === 'date') ? str : parseFloat(str);
		if (!isNaN(comparable)) {
			if (rules.min !== undefined && comparable < rules.min) {
				return rules.minMessage || ('Minimum value is ' + rules.min);
			}
			if (rules.max !== undefined && comparable > rules.max) {
				return rules.maxMessage || ('Maximum value is ' + rules.max);
			}
		}
	}

	return null;
}


// =============================================================================
// DOM helpers — error display only (no value reading or writing)
// =============================================================================

/**
 * Return the DOM element within the mounted form for a given field name.
 *
 * @param {HTMLFormElement} formEl
 * @param {string}          name
 * @returns {HTMLElement|RadioNodeList|null}
 */
function getFieldEl(formEl, name) {
	return formEl ? formEl.elements[name] : null;
}

/**
 * Return the anchor element after which an error node is inserted.
 * For a RadioNodeList (group) this is the last element; otherwise the field itself.
 *
 * @param {HTMLElement|RadioNodeList|null} el
 * @returns {HTMLElement|null}
 */
function getAnchorElement(el) {
	if (!el) return null;
	if (typeof el.length === 'number' && !el.tagName) return el[el.length - 1] || null;
	return el;
}

/**
 * Inject (or update) a `<div class="form-error">` immediately after `el`.
 * Adds 'field-invalid' to each input element for CSS styling.
 *
 * @param {HTMLElement|RadioNodeList|null} el      - Field element or group.
 * @param {string}                         message - Error message.
 */
function showFieldError(el, message) {
	if (!el) return;
	var anchor = getAnchorElement(el);
	if (!anchor || !anchor.parentNode) return;

	if (typeof el.length === 'number' && !el.tagName) {
		for (var i = 0; i < el.length; i++) el[i].classList.add('field-invalid');
	} else {
		el.classList.add('field-invalid');
	}

	// Update in place to avoid unnecessary DOM churn
	var next = anchor.nextSibling;
	if (next && next.classList && next.classList.contains('form-error')) {
		next.textContent = message;
		return;
	}

	var errEl = document.createElement('div');
	errEl.className   = 'form-error';
	errEl.textContent = message;
	anchor.parentNode.insertBefore(errEl, anchor.nextSibling);
}

/**
 * Remove the injected `<div class="form-error">` and 'field-invalid' class.
 * No-ops gracefully if neither is present.
 *
 * @param {HTMLElement|RadioNodeList|null} el - Field element or group.
 */
function removeFieldError(el) {
	if (!el) return;
	var anchor = getAnchorElement(el);
	if (!anchor || !anchor.parentNode) return;

	if (typeof el.length === 'number' && !el.tagName) {
		for (var i = 0; i < el.length; i++) el[i].classList.remove('field-invalid');
	} else {
		el.classList.remove('field-invalid');
	}

	var next = anchor.nextSibling;
	if (next && next.classList && next.classList.contains('form-error')) {
		next.parentNode.removeChild(next);
	}
}

/**
 * Return all submit buttons within a form element.
 *
 * @param {HTMLFormElement} formEl
 * @returns {HTMLElement[]}
 */
function getSubmitButtons(formEl) {
	return Array.from(formEl.querySelectorAll('[type="submit"]'));
}


// =============================================================================
// createForm
// =============================================================================

/**
 * Create a store-backed form controller.
 *
 * Field values are read from and written to `componentCtx.state`. The form
 * module owns validation, error display, and submit lifecycle only.
 *
 * The controller is inert until `mount(root, name)` is called. Calling `mount`
 * again after a re-render is safe — it re-wires only if the `<form>` element
 * reference has changed.
 *
 * @param {Object} def
 * @param {Object}   def.fields          - Map of field names to rule objects (required).
 *   Field names must match both the `name` attribute on the input element and
 *   the corresponding key in the component's `state` block.
 * @param {Function} [def.validate]      - Form-level sync rule: (values) => { field: msg }|null.
 * @param {Function} [def.onSubmit]      - (values, form, ctx) => void|Promise
 * @param {Function} [def.onError]       - (errors, form, ctx) => void
 * @param {string}   [def.validateOn]    - 'blur' (default) | 'change'
 * @param {number}   [def.debounce]      - Async validation debounce in ms (default: 300).
 * @param {Object}   componentCtx        - Component ctx from the runtime.
 * @returns {{
 *   mount(root: Element, name: string): void,
 *   unmount(): void,
 *   submit(): Promise<void>,
 *   reset(): void,
 *   setValues(values: Object): void,
 *   setError(field: string, message: string): void,
 *   clearError(field: string): void,
 *   values: Object,
 *   errors: Object,
 *   submitting: boolean,
 *   isDirty: boolean,
 *   isValid: boolean,
 * }}
 */
export function createForm(def, componentCtx) {
	if (!def || !def.fields) throw new Error('[fstage/form] createForm() requires a definition with fields');

	var formEl      = null;
	var _errors     = {};
	var _touched    = {};
	var _submitting = false;
	var _listeners  = [];  // DOM event listeners
	var _watchOffs  = [];  // store $watch unsubscribe functions

	var globalValidateOn = def.validateOn || 'blur';
	var debounceMs       = def.debounce !== undefined ? def.debounce : 300;

	/**
	 * Per-field debounced async runners — each field has its own timer so one
	 * field's debounce does not cancel another's.
	 * @type {Object<string, Function>}
	 */
	var _asyncDebounced = {};

	/**
	 * Per-field async sequence counters to discard stale responses.
	 * @type {Object<string, number>}
	 */
	var _asyncSeq = {};


	// ------------------------------------------------------------------
	// Value access — reads from store, writes to store
	// ------------------------------------------------------------------

	/**
	 * Return the current store value for a field.
	 * Falls back to '' when no componentCtx is available.
	 *
	 * @param {string} name - Field name.
	 * @returns {*}
	 */
	function getStoreValue(name) {
		if (!componentCtx) return '';
		var val = componentCtx.state[name];
		return val !== undefined ? val : '';
	}

	/**
	 * Write a value to the store for a field.
	 *
	 * @param {string} name  - Field name.
	 * @param {*}      value - Value to write.
	 */
	function setStoreValue(name, value) {
		if (!componentCtx) return;
		componentCtx.state.$set(name, value);
	}

	/**
	 * Collect current store values for all fields.
	 * All fields are included so `enabled` functions see the full form state.
	 *
	 * @returns {Object} Map of fieldName → current store value.
	 */
	function collectValues() {
		var vals = {};
		for (var name in def.fields) vals[name] = getStoreValue(name);
		return vals;
	}

	/**
	 * Filter a values snapshot to enabled fields only.
	 * Used when building the submit payload.
	 *
	 * @param {Object} allVals - Snapshot from collectValues().
	 * @returns {Object}
	 */
	function collectEnabledValues(allVals) {
		var vals = {};
		for (var name in def.fields) {
			if (isEnabled(name, allVals)) vals[name] = allVals[name];
		}
		return vals;
	}


	// ------------------------------------------------------------------
	// Internal helpers
	// ------------------------------------------------------------------

	/**
	 * Return the effective validateOn setting for a field.
	 *
	 * @param {Object} rules - Field definition.
	 * @returns {'blur'|'change'}
	 */
	function fieldValidateOn(rules) {
		return rules.validateOn || globalValidateOn;
	}

	/**
	 * Return whether a field is currently enabled.
	 *
	 * @param {string} name    - Field name.
	 * @param {Object} allVals - Snapshot from collectValues().
	 * @returns {boolean}
	 */
	function isEnabled(name, allVals) {
		var rules = def.fields[name];
		if (typeof rules.enabled !== 'function') return true;
		return !!rules.enabled(allVals);
	}

	/**
	 * Set or clear the `disabled` attribute on all submit buttons.
	 *
	 * @param {boolean} active - True to disable, false to re-enable.
	 */
	function setSubmitting(active) {
		_submitting = active;
		if (!formEl) return;
		var btns = getSubmitButtons(formEl);
		for (var i = 0; i < btns.length; i++) {
			if (active) btns[i].setAttribute('disabled', '');
			else        btns[i].removeAttribute('disabled');
		}
	}

	/**
	 * Validate a single field synchronously. Reads its value from the store.
	 * Clears errors without running rules when the field is disabled.
	 * Updates `_errors` and the DOM.
	 *
	 * @param {string} name    - Field name.
	 * @param {Object} allVals - Snapshot from collectValues().
	 * @returns {string|null} Error message, or null if valid.
	 */
	function validateField(name, allVals) {
		var rules = def.fields[name];
		var el    = getFieldEl(formEl, name);

		if (!isEnabled(name, allVals)) {
			delete _errors[name];
			removeFieldError(el);
			return null;
		}

		var value = allVals[name];
		var error = runBuiltInRules(value, rules);

		if (!error && typeof rules.validate === 'function') {
			error = rules.validate(value, allVals) || null;
		}

		if (error) {
			_errors[name] = error;
			showFieldError(el, error);
		} else {
			delete _errors[name];
			removeFieldError(el);
		}

		return error;
	}

	/**
	 * Run the form-level `validate` function and merge results into _errors / DOM.
	 *
	 * @param {Object} allVals - Snapshot from collectValues().
	 */
	function runFormLevelValidation(allVals) {
		if (typeof def.validate !== 'function') return;
		var formErrors = def.validate(allVals);
		if (!formErrors) return;
		for (var name in formErrors) {
			if (formErrors[name]) {
				_errors[name] = formErrors[name];
				showFieldError(getFieldEl(formEl, name), formErrors[name]);
			}
		}
	}

	/**
	 * Validate all fields synchronously. Marks every field as touched so
	 * subsequent store changes immediately re-validate (post-submit UX).
	 *
	 * @param {Object} [allVals] - Optional pre-collected snapshot.
	 * @returns {boolean} True when all fields pass.
	 */
	function validateAll(allVals) {
		allVals   = allVals || collectValues();
		var valid = true;
		for (var name in def.fields) {
			_touched[name] = true;
			if (validateField(name, allVals)) valid = false;
		}
		runFormLevelValidation(allVals);
		return valid && Object.keys(_errors).length === 0;
	}

	/**
	 * Dispatch a single async validator with stale-response guarding via a
	 * per-field sequence number.
	 *
	 * @param {string} name    - Field name.
	 * @param {Object} rules   - Field definition.
	 * @param {Object} allVals - Snapshot from collectValues().
	 * @returns {Promise<string|null>}
	 */
	function dispatchAsync(name, rules, allVals) {
		_asyncSeq[name] = (_asyncSeq[name] || 0) + 1;
		var seq = _asyncSeq[name];
		var val = allVals[name];

		return Promise.resolve(rules.validateAsync(val, allVals)).then(function(error) {
			if (_asyncSeq[name] !== seq) return null; // stale — discard
			error = error || null;
			if (error) {
				_errors[name] = error;
				showFieldError(getFieldEl(formEl, name), error);
			} else if (!_errors[name]) {
				removeFieldError(getFieldEl(formEl, name));
			}
			return error;
		});
	}

	/**
	 * Run async validators for all enabled fields in parallel.
	 *
	 * @param {Object} allVals - Snapshot from collectValues().
	 * @returns {Promise<boolean>}
	 */
	function validateAllAsync(allVals) {
		var promises = [];
		for (var name in def.fields) {
			var rules = def.fields[name];
			if (typeof rules.validateAsync !== 'function') continue;
			if (!isEnabled(name, allVals)) continue;
			promises.push(dispatchAsync(name, rules, allVals));
		}
		return Promise.all(promises).then(function(results) {
			return results.every(function(e) { return !e; });
		});
	}

	/**
	 * Return (creating lazily) the debounced async validator for a field.
	 *
	 * @param {string} name - Field name.
	 * @returns {Function}
	 */
	function getDebouncedAsync(name) {
		if (!_asyncDebounced[name]) {
			_asyncDebounced[name] = debounce(function() {
				var rules   = def.fields[name];
				var allVals = collectValues();
				if (!isEnabled(name, allVals)) return;
				dispatchAsync(name, rules, allVals);
			}, debounceMs);
		}
		return _asyncDebounced[name];
	}


	// ------------------------------------------------------------------
	// Event / watch handlers
	// ------------------------------------------------------------------

	/**
	 * Return a blur handler for a field. Marks the field as touched and
	 * runs sync + async validation immediately (no debounce on blur).
	 *
	 * @param {string} name - Field name.
	 * @returns {Function}
	 */
	function onBlur(name) {
		return function() {
			_touched[name] = true;
			validateField(name, collectValues());
			if (typeof def.fields[name].validateAsync === 'function') {
				getDebouncedAsync(name)();
			}
		};
	}

	/**
	 * Return a store watch handler for a field. Re-validates when the store
	 * value changes, but only after the field has been touched or if
	 * `validateOn` is 'change'. This replaces the DOM input/change listeners
	 * used in the previous DOM-owned approach — since values live in the store,
	 * watching the store is the natural reactive trigger.
	 *
	 * @param {string} name - Field name.
	 * @returns {Function}
	 */
	function onStoreChange(name) {
		return function() {
			var rules = def.fields[name];
			if (_touched[name] || fieldValidateOn(rules) === 'change') {
				_touched[name] = true;
				validateField(name, collectValues());
				if (typeof rules.validateAsync === 'function') getDebouncedAsync(name)();
			}
		};
	}

	/**
	 * Form submit handler — prevents native submission and delegates to submit().
	 *
	 * @param {SubmitEvent} e
	 */
	function onSubmit(e) {
		e.preventDefault();
		controller.submit();
	}


	// ------------------------------------------------------------------
	// Listener helpers
	// ------------------------------------------------------------------

	/**
	 * Add a DOM event listener and record it for cleanup.
	 *
	 * @param {EventTarget} el
	 * @param {string}      type
	 * @param {Function}    fn
	 */
	function addListener(el, type, fn) {
		el.addEventListener(type, fn);
		_listeners.push({ el: el, type: type, fn: fn });
	}

	/** Remove all registered DOM listeners. */
	function removeAllListeners() {
		for (var i = 0; i < _listeners.length; i++) {
			_listeners[i].el.removeEventListener(_listeners[i].type, _listeners[i].fn);
		}
		_listeners = [];
	}

	/** Unsubscribe all store watches. */
	function removeAllWatches() {
		for (var i = 0; i < _watchOffs.length; i++) _watchOffs[i]();
		_watchOffs = [];
	}


	// ------------------------------------------------------------------
	// Public controller
	// ------------------------------------------------------------------

	var controller = {

		/**
		 * Mount to `<form name="{name}">` inside `root`. Sets `novalidate`,
		 * wires a blur listener per field (for touched tracking), a store
		 * watch per field (for re-validation after touched), and a submit
		 * listener on the form element.
		 *
		 * Safe to call again after a re-render — re-wires only if the form
		 * element reference has changed.
		 *
		 * @param {Element} root - Root element to query within.
		 * @param {string}  name - Value of the form's `name` attribute.
		 */
		mount: function(root, name) {
			var newFormEl = root.querySelector('form[name="' + name + '"]');
			if (!newFormEl) {
				console.warn('[fstage/form] form[name="' + name + '"] not found in root');
				return;
			}

			if (newFormEl === formEl) return; // same element — nothing to do

			if (formEl) controller.unmount(); // different element — tear down first

			formEl = newFormEl;
			formEl.setAttribute('novalidate', '');

			_errors  = {};
			_touched = {};

			for (var fieldName in def.fields) {
				var el = getFieldEl(formEl, fieldName);

				// Blur listener — marks touched and triggers immediate validation.
				if (el) {
					var blurFn = onBlur(fieldName);
					if (typeof el.length === 'number' && !el.tagName) {
						// RadioNodeList — attach to each individual input
						for (var i = 0; i < el.length; i++) {
							addListener(el[i], 'blur', blurFn);
						}
					} else {
						addListener(el, 'blur', blurFn);
					}
				}

				// Store watch — re-validates after touched when the value changes.
				// Using { sync: true } so validation runs before the next render,
				// keeping error state consistent within the same update cycle.
				if (componentCtx) {
					var off = componentCtx.state.$watch(fieldName, onStoreChange(fieldName), { sync: true });
					_watchOffs.push(off);
				}
			}

			addListener(formEl, 'submit', onSubmit);
		},

		/**
		 * Unmount: remove all DOM listeners, store watches, and error nodes.
		 * Re-enables any disabled submit buttons.
		 */
		unmount: function() {
			if (formEl) {
				for (var name in def.fields) removeFieldError(getFieldEl(formEl, name));
				setSubmitting(false);
			}
			removeAllListeners();
			removeAllWatches();
			formEl          = null;
			_errors         = {};
			_touched        = {};
			_submitting     = false;
			_asyncDebounced = {};
			_asyncSeq       = {};
		},

		/**
		 * Programmatically submit the form. Snapshots store values once so the
		 * payload always matches what was validated. Runs sync validation, then
		 * async validators in parallel. Calls `def.onError` on failure, otherwise
		 * disables submit buttons, calls `def.onSubmit`, and re-enables on settle.
		 *
		 * @returns {Promise<void>}
		 */
		submit: function() {
			if (_submitting) return Promise.resolve();

			var snapshot  = collectValues();
			var syncValid = validateAll(snapshot);

			return validateAllAsync(snapshot).then(function(asyncValid) {
				if (!syncValid || !asyncValid) {
					if (typeof def.onError === 'function') {
						def.onError(Object.assign({}, _errors), controller, componentCtx);
					}
					return;
				}

				setSubmitting(true);
				var vals = collectEnabledValues(snapshot);

				return Promise.resolve(
					typeof def.onSubmit === 'function'
						? def.onSubmit(vals, controller, componentCtx)
						: undefined
				).finally(function() {
					setSubmitting(false);
				});
			});
		},

		/**
		 * Reset all fields to their defaults (from `def.fields[name].default`,
		 * falling back to '') by writing to the store. Clears all errors and
		 * touched state. The component re-renders via normal store reactivity —
		 * no DOM manipulation needed.
		 */
		reset: function() {
			for (var name in def.fields) {
				var dflt = def.fields[name].default;
				setStoreValue(name, dflt !== undefined ? dflt : '');
				if (formEl) removeFieldError(getFieldEl(formEl, name));
			}
			_errors  = {};
			_touched = {};
		},

		/**
		 * Write one or more field values to the store. Values not declared in
		 * `def.fields` are ignored.
		 *
		 * @param {Object} values - Partial map of fieldName → value.
		 */
		setValues: function(values) {
			for (var name in values) {
				if (name in def.fields) setStoreValue(name, values[name]);
			}
		},

		/**
		 * Set a field error programmatically (e.g. from a server response).
		 *
		 * @param {string} field   - Field name.
		 * @param {string} message - Error message.
		 */
		setError: function(field, message) {
			_errors[field] = message;
			showFieldError(getFieldEl(formEl, field), message);
		},

		/**
		 * Clear a field error programmatically.
		 *
		 * @param {string} field - Field name.
		 */
		clearError: function(field) {
			delete _errors[field];
			removeFieldError(getFieldEl(formEl, field));
		},

		/**
		 * Current store values for enabled fields only.
		 * @type {Object}
		 */
		get values() {
			return collectEnabledValues(collectValues());
		},

		/**
		 * Shallow copy of the current error map.
		 * @type {Object<string, string>}
		 */
		get errors() { return Object.assign({}, _errors); },

		/**
		 * True while `onSubmit` is in flight.
		 * @type {boolean}
		 */
		get submitting() { return _submitting; },

		/**
		 * True if any field's current store value differs from its initial default.
		 * Fields without an explicit `default` are compared against `''`.
		 * @type {boolean}
		 */
		get isDirty() {
			for (var name in def.fields) {
				var dflt = def.fields[name].default;
				var effective = dflt !== undefined ? dflt : '';
				if (getStoreValue(name) !== effective) return true;
			}
			return false;
		},

		/**
		 * True when the error map is empty. Note: `true` before any validation
		 * has run — no errors yet is not the same as confirmed validity.
		 * @type {boolean}
		 */
		get isValid() { return Object.keys(_errors).length === 0; },
	};

	return controller;
}
