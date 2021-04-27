# fstage

A lean javascript library for developing modern web apps, at under 15kb (minified and gzipped).

It's a collection of helper functions that are used at codi.io when prototying and developing front-end code, without any build or
compilation steps required. Any significant updates will be shared here, as the library evolves.

It follows jQuery syntax closely for DOM manipulation, though does not replicate all jQuery functions and goes far beyond the scope of jQuery,
housing features such as global statement management and reactive view components. All functions are split into modules that can easily be
extracted and used in isolation or as part of the library (see fstage.js file for code and comments).

# CDN links

	<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/codi0/fstage@0.2.1/fstage.min.css">
	<script defer src="https://cdn.jsdelivr.net/gh/codi0/fstage@0.2.1/fstage.min.js"></script>

# Browser support

It assumes support for Promise, fetch and Proxy; which are now well established in all major browsers. Internet Explorer is not supported.

# Modules API

(1) CORE

	Fstage(selector, context = document)  //replicates jQuery syntax for chaining methods
	Fstage(selector).get(index)  //returns selected DOM node by array index
	Fstage(selector).each(callback)  //executes callback for each selected DOM node

(2) UTILS

	Fstage.each(array|object, callback)  //executes callback on every key of the array/object
	Fstage.extend(obj1, obj2...)  //shallow merge of two or more objects
	Fstage.copy(array|object)  //returns a shallow copy of an array or object
	Fstage.type(input)  //returns input type as a string (E.g. object, array, string, boolean)
	Fstage.isEmpty(input)  //checks whether javascript variable of any type is empty
	Fstage.isUrl(input)  //checks whether javascript variable is a valid http(s) URL
	Fstage.capitalize(string)  //capitalizes the first letter of a string
	Fstage.ready(callback)  //delays executing callback until DOM is ready
	Fstage.parseHTML(string, first = false)  //converts HTML string to array of nodes
	Fstage.stripHTML(string)  //strips HTML from a string
	Fstage.escape(string, type = 'html')  //escapes a string, with optional type (html, js, attr)
	Fstage.debounce(callback, waitMs = 100)  //limits the rate at which the callback is executed
	Fstage.memoize(callback)  //caches output of function using hash of input parameters
	Fstage.hash(string|array|object)  //converts input into a numeric hash
	Fstage.deviceId(uid = '')  //creates hash using versionless user agent and optional user identifier

(3) OBJECT

	Fstage.obj.get(object, key)  //returns nested value from object by property key (E.g. user.address.city)
	Fstage.obj.set(object, key, val, opts = {})  //sets nested object property value using key
	Fstage.obj.merge(object, patch, opts = {})  //merges patch into object
	Fstage.obj.filter(object, filters = {})  //filters object properties by one or more key=>val pairs
	Fstage.obj.sort(object, order = {})  //sorts object properties by key, with optional limit/offset/desc

(4) PUBSUB

	Fstage.pubsub.has(id)  //returns whether any callbacks subscribed to the specified ID
	Fstage.pubsub.on(id, callback)  //subscribes to event with specified ID, returning a token
	Fstage.pubsub.off(token)  //unsubscribes to event with specified ID
	Fstage.pubsub.emit(id, data = {})  //publishes event with specified ID, and optional data
	Fstage.pubsub.waitFor(tokens)  //allows one callback to wait for others before completing

(5) DOM EVENTS

	Fstage(selector).on(eventTypes, delegatedSelector, callback)  //attaches event callback to each selected DOM node
	Fstage(selector).one(eventTypes, delegatedSelector, callback)  //event callback will only ever be called once
	Fstage(selector).off(eventTypes, callback)  //detaches event callback from each selected DOM node
	Fstage(selector).trigger(eventTypes, data = {})  //triggers custom event, with optional data passed

(6) DOM SELECTION

	Fstage(selector).find(selector)  //returns all matching children of each selected DOM node
	Fstage(selector).closest(selector)  //returns first matching child of each selected DOM node
	Fstage(selector).parent()  //returns parent node of each selected DOM node

(7) DOM MANIPULATION

	Fstage(selector).hasClass(classNames)  //checks whether first selected DOM node contains one or more classes
	Fstage(selector).addClass(classNames, esc = true)  //adds one or more classes to each selected DOM node
	Fstage(selector).removeClass(classNames)  //remove one or more classes from each selected DOM node
	Fstage(selector).toggleClass(classNames, esc = true)  //toggles add or remove of one or more classes from each selected DOM node
	Fstage(selector).css(key, val = undefined, esc = true)  //gets or sets css style property on each selected DOM node
	Fstage(selector).attr(key, val = undefined, esc = true)  //gets or sets element attribute on each selected DOM node
	Fstage(selector).append(html)  //inserts html as last child of each selected DOM node
	Fstage(selector).prepend(html)  //inserts html as first child of each selected DOM node
	Fstage(selector).after(html)  //inserts html after each selected DOM node
	Fstage(selector).before(html)  //inserts html before each selected DOM node
	Fstage(selector).wrap(html)  //inserts html as parent of each selected DOM node
	Fstage(selector).replaceWith(html)  //inserts html as replacement for each selected DOM node
	Fstage(selector).remove()  //removes each selected DOM node from the document
	Fstage(selector).empty()  //removes all child nodes from each selected DOM node
	Fstage(selector).html(html)  //sets innerHTML of each selected DOM node
	Fstage(selector).text(text)  //sets textContent of each selected DOM node
	Fstage(selector).val(value, esc = true)  //sets value of each selected DOM node

(8) DOM EFFECTS

	Fstage(selector).animate(effect, opts = {})  //manages animation on each selected DOM node using classes (requires fstage.css)
	Fstage(selector).sliding({ x: true, y: false, onStart: null, onMove: null, onEnd: null })  //controls sliding via options provided
	Fstage(selector).notice(text, { type: 'info', animate: 'none', prepend: false, hide: 0 })  //shows and hides notices (requires fstage.css)
	Fstage(selector).overlay(text, opts = {})  //creates a dialogue overlay
	Fstage(selector).carousel(opts = {})  //creates a responsive carousel
	Fstage(selector).cookieConsent(opts = {})  //creates an unobtrusive cookie consent banner at the bottom of the page
	Fstage.transition(toEl, toEffect, fromEl, fromEffect, opts = {})  //executes page transition from one element to another

(9) DOM DIFFING

	Fstage.domDiff(fromNode, toNode|toHtml, opts = {})  //updates specified DOM node to new state with the minimum necessary changes

(10) SERVER CALLS

	Fstage.ajax(url, opts = {})  //retrieves response from server URL
	Fstage.websocket(url)  //creates websocket object, with auto-reconnect and on/off/trigger methods to listen and send messages

(10) DOM REACTIVITY

	Fstage.watch(input)  //creates proxy of input and emits any changes via Fstage.pub('watch')
	Fstage.component(name, { el: null, parent: null, data: null, template: null })  //renders html and automatically updates if data changes

(11) OBJECT OBSERVER

	Fstage.observe(object, opts = {})  //returns a wrapped object to observe property access and changes, using wrapped.onProxy('access|change', callback)

(12) STATE MANAGEMENT

	Fstage.store(state = {}, opts = {})  //uses object observer to listen for property changes and automatically call functions that access those properties

(13) VIEW ROUTING

	Fstage.router.start()  //starts router
	Fstage.router.current()  //returns current route object
	Fstage.router.is(name)  //check whether name matches current route
	Fstage.router.has(name)  //check whether route has any registered callbacks
	Fstage.router.on(name, callback)  //register route and add callback
	Fstage.router.trigger(name, data = {}, mode = 'push|replace|null')  //manually execute route with optional data and history API mode
	Fstage.router.redirect(name, data = {})  //as trigger method, with mode set to 'replace' to overwrite last entry
	Fstage.router.refresh()  //triggers the current route again
	Fstage.router.back()  //navigates back to the previous route
	Fstage.router.setState(state = {})  //updates current route object

(14) VIEW COMPONENTS

	Fstage.components.store()  //returns global state object, if attached
	Fstage.components.router()  //returns router object, if attached
	Fstage.components.register(name, callback)  //registers component using function or object literal
	Fstage.components.start(opts = {})  //initial render of components, starting with root component

(15) FORM VALIDATION

	Fstage.form(name, opts)  //returns an enhanced form element, opts contains 'fields' object (name, filter, validator)
	Fstage.form.isValid(field = null)  //validates form values against fields object, and also fires onBlur for a given field
	Fstage.form.err(field = null, message = null)  //returns or sets error message[s]
	Fstage.form.val(field = null)  //returns filtered value[s]
	Fstage.form.reset(field = null, skip = [])  //clears values and errors
	Fstage.form.step(name = null)  //returns current form step (if set), or sets step name