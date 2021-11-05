# fstage

A lean javascript library for developing modern web apps, at under 15kb (minified and gzipped).

Fstage was created to help prototye and develop codi.io projects, without any build or compilation steps required.
Any significant updates will be shared here, as the library evolves.

All functions are split into modules that can easily be extracted and used in isolation or as part of the library
(see fstage.js file for code and comments).

# CDN links

	<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/codi0/fstage@0.2.3/fstage.min.css">
	<script defer src="https://cdn.jsdelivr.net/gh/codi0/fstage@0.2.3/fstage.min.js"></script>

# Browser support

Support for ES6 Promise, fetch and Proxy is required. Internet Explorer is not supported.

# Skeleton app

See the "app" directory for a very simple skeleton app; incorporating services, components and middleware.

# Modules API

(1) CORE

	Fstage(selector, context = document)  //replicates jQuery DOM select
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
	Fstage.debounce(callback, waitMs = 100)  //limits the rate at which the callback is executed
	Fstage.memoize(callback)  //caches output of function using hash of input parameters
	Fstage.hash(string|array|object)  //converts input into a numeric hash
	Fstage.deviceId(uid = '')  //creates hash using versionless user agent and optional user identifier
	Fstage.scroll(number|node)  //scroll to an element or pixel position on the screen

(3) DOM SELECTION

	Fstage(selector).find(selector)  //returns all matching children of each selected DOM node
	Fstage(selector).closest(selector)  //returns first matching child of each selected DOM node
	Fstage(selector).parent()  //returns parent node of each selected DOM node

(4) DOM MANIPULATION

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

(5) DOM EVENTS

	Fstage(selector).on(eventTypes, delegatedSelector, callback)  //attaches event callback to each selected DOM node
	Fstage(selector).one(eventTypes, delegatedSelector, callback)  //event callback will only ever be called once
	Fstage(selector).off(eventTypes, callback)  //detaches event callback from each selected DOM node
	Fstage(selector).trigger(eventTypes, data = {})  //triggers custom event, with optional data passed

(6) DOM EFFECTS

	Fstage(selector).animate(effect, opts = {})  //manages animation on each selected DOM node using classes (requires fstage.css)
	Fstage(selector).sliding({ x: true, y: false, onStart: null, onMove: null, onEnd: null })  //controls sliding via options provided
	Fstage(selector).notice(text, { type: 'info', animate: 'none', prepend: false, hide: 0 })  //shows and hides notices (requires fstage.css)
	Fstage(selector).overlay(text, opts = {})  //creates a dialogue overlay
	Fstage(selector).carousel(opts = {})  //creates a responsive carousel
	Fstage(selector).cookieConsent(opts = {})  //creates an unobtrusive cookie consent banner at the bottom of the page
	Fstage.transition(toEl, toEffect, fromEl, fromEffect, opts = {})  //executes page transition from one element to another

(7) DOM DIFFING

	Fstage.domDiff(fromNode, toNode|toHtml, opts = {})  //updates specified DOM node to new state with the minimum necessary changes

(8) SERVER CALLS

	Fstage.ajax(url, opts = {})  //retrieves response from server URL
	Fstage.websocket(url)  //creates websocket object, with auto-reconnect and on/off/trigger methods to listen and send messages

(9) PUBSUB

	Fstage.pubsub.has(id)  //returns whether any callbacks subscribed to the specified ID
	Fstage.pubsub.on(id, callback)  //subscribes to event with specified ID, returning a token
	Fstage.pubsub.off(token)  //unsubscribes to event with specified ID
	Fstage.pubsub.emit(id, data = {})  //publishes event with specified ID, and optional data
	Fstage.pubsub.waitFor(tokens)  //allows one callback to wait for others before completing

(10) OBJECT HELPERS

	Fstage.obj.get(object, key)  //returns nested value from object by property key (E.g. user.address.city)
	Fstage.obj.set(object, key, val, opts = {})  //sets nested object property value using key
	Fstage.obj.merge(object, patch, opts = {})  //merges patch into object
	Fstage.obj.filter(object, filters = {})  //filters object properties by one or more key=>val pairs
	Fstage.obj.sort(object, order = {})  //sorts object properties by key, with optional limit/offset/desc

(11) OBJECT OBSERVER

	Fstage.observe(object, opts = {})  //returns a wrapped object to observe property access and changes, using wrapped.onProxy('access|change', callback)

(12) STATE MANAGEMENT

	Fstage.store(state = {}, opts = {})  //uses object observer to listen for property changes and automatically call functions that access those properties

(13) TEMPLATE LITERALS

	Fstage.lit(arr = null, callback = null)  //parse and auto-escape template literals, as well as acting as a loop/callback wrapper in embedded expressions
	Fstage.esc(string, type = 'html')  //escapes a string, with optional type (html, js, attr)

(14) VIEW ROUTING

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

(15) VIEW COMPONENTS

	Fstage.components.store()  //returns global state object, if attached
	Fstage.components.router()  //returns router object, if attached
	Fstage.components.register(name, callback)  //registers component using function or object literal
	Fstage.components.start(opts = {})  //initial render of components, starting with root component

(16) FORM VALIDATION

	Fstage.form(name, opts)  //returns an enhanced form element, opts contains 'fields' object (name, filter, validator)
	Fstage.form.isValid(field = null)  //validates form values against fields object, and also fires onBlur for a given field
	Fstage.form.err(field = null, message = null)  //returns or sets error message[s]
	Fstage.form.val(field = null)  //returns filtered value[s]
	Fstage.form.reset(field = null, skip = [])  //clears values and errors
	Fstage.form.step(name = null)  //returns current form step (if set), or sets step name

(17) WEB PUSH

	Fstage.webpush.init(url, vapidKey)  //sets the mandatory inputs required for push notifications
	Fstage.webpush.can()  //returns true or false based on whether push notifications are supported by the device
	Fstage.webpush.tags()  //returns the tags/topics currently subscribed to
	Fstage.webpush.state(opts={})  //returns a promise containing the permission state for push notifications (prompt, granted, blocked)
	Fstage.webpush.subscribe(tag)  //subscribes to push notifications, with an optional tag/topic, returning a promise with a true/false result
	Fstage.webpush.unsubscribe(tag)  //unsubscribes to push notifications tag/topic, if provided, otherwise all notifications

(18) APP SHELL

	Fstage.app()  //creates a framework for a reactive app that utilises Fstage modules 