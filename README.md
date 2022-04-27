# fstage [ALPHA v0.3.9]

A modular javascript library for developing modern web2 and web3 applications. Being developed as part of codi.io's mission to make open web3 infrastructure accessible to all.

Alpha library, in heavy development, and breaking changes may occur.

# CDN links

	<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/codi0/fstage@0.3.9/src/css/fstage.min.css">
	<script defer src="https://cdn.jsdelivr.net/gh/codi0/fstage@0.3.9/src/js/fstage.min.js"></script>

# Module loading

	<script>
	//loads defaults
	Fstage.ready(function(exports) {
		//once modules are loaded, do what you want here
	});
	</script>

	<script>
	var modules = [
		//Example 1: load specific modules (default)
		'core', 'app'
		//Example 2: load all modules
		//'core', 'utils', 'pubsub', 'observe', 'transport', 'form', 'dom', 'app', 'webpush', 'hls', 'ipfs'
		//Example 3: shortcut for loading all modules
		//'@all'
	];
	
	//loads specified modules
	Fstage.ready(modules, function(exports) {
		//once modules are loaded, do what you want here
	});
	</script>

# Platform support

- Support for ES6 modules required
- Internet Explorer browser is not supported
- Both browser and node.js environments are supported, though modules are typically developed "browser-first"

# Example usage

- "examples/app" folder - a simple skeleton app; incorporating services, components and middleware
- "examples/ipfs" folder - a demo of how to stream video over the decentralised IPFS network
- "examples/nodejs" folder - a demo of how to include the Fstage library in a node application

# Modules API
Modules can be imported into a script using standard ES6 syntax, or accessed via the Fstage global var.

(1) CORE

	Fstage.env = { isNode, isWorker, isBrower, isMobile, isHybrid, isPwa, clientId, clientOs, clientUa, host, basePath, scriptPath }  //returns environment vars
	Fstage.env.parseReq(req)  //re-processes environment vars based on an IncomingMessage request object (nodejs)

	Fstage.importr(modulePath, opts = {})  //returns a promise of exports for an es6 module import
	Fstage.importMap(dependencies = {})  //creates an import map of core modules and user-defined dependencies
	Fstage.ready(modules, callback)  //load modules and execute callback when loading complete

(2) UTILS

	Fstage.utils.type(input)  //returns input type as a string (E.g. object, array, string, boolean)
	Fstage.utils.copy(array|object)  //returns a shallow copy of an array or object
	Fstage.utils.extend(obj1, obj2...)  //shallow merge of two or more objects
	Fstage.utils.debounce(callback, waitMs = 100)  //limits the rate at which the callback is executed
	Fstage.utils.memoize(callback)  //caches output of function using hash of input parameters
	Fstage.utils.isEmpty(input)  //checks whether javascript variable of any type is empty
	Fstage.utils.isUrl(input)  //checks whether javascript variable is a valid http(s) URL
	Fstage.utils.capitalize(string)  //capitalizes the first letter of a string
	Fstage.utils.hash(string|array|object)  //converts input into a numeric hash
	Fstage.utils.scroll(number|node)  //scroll to an element or pixel position on the screen
	Fstage.utils.parseHTML(string, first = false)  //converts HTML string to array of nodes
	Fstage.utils.stripHTML(string)  //strips HTML from a string
	Fstage.utils.esc(string, type = 'html')  //escapes a string, with optional type (html, js, attr)

	Fstage.utils.objHandler.get(object, key)  //returns nested value from object by property key (E.g. user.address.city)
	Fstage.utils.objHandler.set(object, key, val, opts = {})  //sets nested object property value using key
	Fstage.utils.objHandler.merge(object, patch, opts = {})  //merges patch into object
	Fstage.utils.objHandler.filter(object, filters = {})  //filters object properties by one or more key=>val pairs
	Fstage.utils.objHandler.sort(object, order = {})  //sorts object properties by key, with optional limit/offset/desc

(3) PUBSUB

	Fstage.pubsub.has(id)  //returns whether any callbacks subscribed to the specified ID
	Fstage.pubsub.on(id, callback)  //subscribes to event with specified ID, returning a token
	Fstage.pubsub.off(id, token)  //unsubscribes to event with specified ID
	Fstage.pubsub.emit(id, data = {})  //publishes event with specified ID, and optional data
	Fstage.pubsub.waitFor(tokens)  //allows one callback to wait for others before completing
	Fstage.pubsub.instance()  //create new instance of pubsub object

(4) DOM

	Fstage.dom(selector, context = document)  //replicates jQuery DOM select
	Fstage.dom(selector).get(index)  //returns selected DOM node by array index
	Fstage.dom(selector).each(callback)  //executes callback for each selected DOM node
	Fstage.dom(selector).find(selector)  //returns all matching children of each selected DOM node
	Fstage.dom(selector).closest(selector)  //returns first matching child of each selected DOM node
	Fstage.dom(selector).parent()  //returns parent node of each selected DOM node
	Fstage.dom(selector).hasClass(classNames)  //checks whether first selected DOM node contains one or more classes
	Fstage.dom(selector).addClass(classNames, esc = true)  //adds one or more classes to each selected DOM node
	Fstage.dom(selector).removeClass(classNames)  //remove one or more classes from each selected DOM node
	Fstage.dom(selector).toggleClass(classNames, esc = true)  //toggles add or remove of one or more classes from each selected DOM node
	Fstage.dom(selector).css(key, val = undefined, esc = true)  //gets or sets css style property on each selected DOM node
	Fstage.dom(selector).attr(key, val = undefined, esc = true)  //gets or sets element attribute on each selected DOM node
	Fstage.dom(selector).append(html)  //inserts html as last child of each selected DOM node
	Fstage.dom(selector).prepend(html)  //inserts html as first child of each selected DOM node
	Fstage.dom(selector).after(html)  //inserts html after each selected DOM node
	Fstage.dom(selector).before(html)  //inserts html before each selected DOM node
	Fstage.dom(selector).wrap(html)  //inserts html as parent of each selected DOM node
	Fstage.dom(selector).replaceWith(html)  //inserts html as replacement for each selected DOM node
	Fstage.dom(selector).remove()  //removes each selected DOM node from the document
	Fstage.dom(selector).empty()  //removes all child nodes from each selected DOM node
	Fstage.dom(selector).html(html)  //sets innerHTML of each selected DOM node
	Fstage.dom(selector).text(text)  //sets textContent of each selected DOM node
	Fstage.dom(selector).val(value, esc = true)  //sets value of each selected DOM node

(4.1) DOM EVENTS

	Fstage.dom(selector).on(eventTypes, delegatedSelector, callback)  //attaches event callback to each selected DOM node
	Fstage.dom(selector).one(eventTypes, delegatedSelector, callback)  //event callback will only ever be called once
	Fstage.dom(selector).off(eventTypes, callback)  //detaches event callback from each selected DOM node
	Fstage.dom(selector).trigger(eventTypes, data = {})  //triggers custom event, with optional data passed

(4.2) DOM EFFECTS

	Fstage.dom(selector).animate(effect, opts = {})  //manages animation on each selected DOM node using classes (requires fstage.css)
	Fstage.dom(selector).sliding({ x: true, y: false, onStart: null, onMove: null, onEnd: null })  //controls sliding via options provided
	Fstage.dom.transition(toEl, toEffect, fromEl, fromEffect, opts = {})  //executes page transition from one element to another

(4.3) DOM WIDGETS

	Fstage.dom(selector).notice(text, { type: 'info', animate: 'none', prepend: false, hide: 0 })  //shows and hides notices (requires fstage.css)
	Fstage.dom(selector).overlay(text, opts = {})  //creates a dialogue overlay
	Fstage.dom(selector).carousel(opts = {})  //creates a responsive carousel
	Fstage.dom(selector).cookieConsent(opts = {})  //creates an unobtrusive cookie consent banner at the bottom of the page

(4.4) DOM DIFFING

	Fstage.dom.diff(fromNode, toNode|toHtml, opts = {})  //updates specified DOM node to new state with the minimum necessary changes

(5) VIEW ROUTING

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
	Fstage.router.instance()  //create new instance of router object

(6) OBJECT OBSERVER

	Fstage.observe(object, opts = {})  //returns a wrapped object to observe property access and changes, using wrapped.onProxy('access|change', callback)

(7) STATE MANAGEMENT

	Fstage.store(state = {}, opts = {})  //uses object observer to listen for property changes and automatically call functions that access those properties

(8) TEMPLATE LITERALS

	Fstage.lit(arr = null, callback = null)  //parse and auto-escape template literals, as well as acting as a loop/callback wrapper in embedded expressions

(9) VIEW COMPONENTS

	Fstage.components.register(name, callback)  //registers component using function or object literal
	Fstage.components.start(opts = {})  //initial render of components, starting with root component
	Fstage.components.pusub()  //returns pubsub object, if attached
	Fstage.components.router()  //returns router object, if attached
	Fstage.components.store()  //returns global state object, if attached
	Fstage.components.instance()  //create new instance of components object

(10) FORM VALIDATION

	Fstage.form(name, opts)  //returns an enhanced form element, opts contains 'fields' object (name, filter, validator)
	Fstage.form.isValid(field = null)  //validates form values against fields object, and also fires onBlur for a given field
	Fstage.form.err(field = null, message = null)  //returns or sets error message[s]
	Fstage.form.val(field = null)  //returns filtered value[s]
	Fstage.form.reset(field = null, skip = [])  //clears values and errors
	Fstage.form.step(name = null)  //returns current form step (if set), or sets step name

(11) TRANSPORT

	Fstage.ajax(url, opts = {})  //retrieves response from server URL
	Fstage.websocket(url)  //creates websocket object, with auto-reconnect and on/off/trigger methods to listen and send messages

(12) WEB PUSH

	Fstage.webpush.init(url, vapidKey)  //sets the mandatory inputs required for push notifications
	Fstage.webpush.can()  //returns true or false based on whether push notifications are supported by the device
	Fstage.webpush.tags()  //returns the tags/topics currently subscribed to
	Fstage.webpush.state(opts={})  //returns a promise containing the permission state for push notifications (prompt, granted, blocked)
	Fstage.webpush.subscribe(tag)  //subscribes to push notifications, with an optional tag/topic, returning a promise with a true/false result
	Fstage.webpush.unsubscribe(tag)  //unsubscribes to push notifications tag/topic, if provided, otherwise all notifications

(13) APP SHELL

	Fstage.app(config = {})  //creates a framework for a reactive app that utilises Fstage modules

(14) HTTP LIVE STREAMING

	Fstage.hls.stream(url, callback|opts)  //creates a video or audio html element that will play over http or ipfs
	
(15) IPFS (https://ipfs.io)

	//In development. No stable API yet.
