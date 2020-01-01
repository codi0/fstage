# fstage

A lean javascript library for developing modern web apps, at under 7kb (minified and gzipped).

It's a collection of helper functions that are used at codi.io when prototying and developing front-end code, without any build or
compilation steps required. Any significant updates will be shared here, as the library evolves.

It follows the jQuery syntax closely for DOM manipulation, though does not replicate all jQuery functions. All functions are split into
modules that can easily be extracted and used in isolation or as part of the library (see fstage.js file for code and comments).

# Browser support

It assumes support for Promise, fetch and Proxy; which are now well established in all major browsers. Internet Explorer is not supported.

# Modules API

(1) CORE

	Fstage(selector, context = document)  //replicates jQuery syntax for chaining DOM methods
	Fstage(selector).get(index)  //returns selected DOM node by array index
	Fstage(selector).each(callback)  //executes callback for each selected DOM node

(2) UTILITY HELPERS

	Fstage.each(array|object, callback)  //executes callback on every key of the array/object
	Fstage.extend(obj1, obj2...)  //merges two or more objects together
	Fstage.type(input)  //returns input type as a string (E.g. object, array, string, boolean)
	Fstage.toNodes(html, first = false)  //converts HTML string to array of nodes
	Fstage.stripHtml(str, encode = false)  //removes HTML from a string (or encodes it)
	Fstage.copy(input)  //creates a deep copy of the input
	Fstage.debounce(callback, waitMs = 100)  //limits the rate at which the callback is executed
	Fstage.ready(callback)  //delays executing callback until DOM is ready

(3) DOM SELECTION

	Fstage.select(selector, context = document)  //returns array of DOM nodes
	Fstage(selector).find(selector)  //returns all matching children of each selected DOM node
	Fstage(selector).closest(selector)  //returns first matching child of each selected DOM node
	Fstage(selector).parent()  //returns parent node of each selected DOM node

(4) DOM EVENTS

	Fstage(selector).on(eventTypes, delegatedSelector, callback)  //attaches event callback to each selected DOM node
	Fstage(selector).one(eventTypes, delegatedSelector, callback)  //event callback will only ever be called once
	Fstage(selector).off(eventTypes, callback)  //detaches event callback from each selected DOM node
	Fstage(selector).trigger(eventTypes, data = {})  //triggers custom event, with optional data passed

(5) DOM MANIPULATION

	Fstage(selector).hasClass(classNames)  //checks whether first selected DOM node contains one or more classes
	Fstage(selector).addClass(classNames)  //adds one or more classes to each selected DOM node
	Fstage(selector).removeClass(classNames)  //remove one or more classes from each selected DOM node
	Fstage(selector).toggleClass(classNames)  //toggles add or remove of one or more classes from each selected DOM node
	Fstage(selector).css(key, val = undefined)  //gets or sets css style property on each selected DOM node
	Fstage(selector).attr(key, val = undefined)  //gets or sets element attribute on each selected DOM node
	Fstage(selector).append(html)  //inserts html as last child of each selected DOM node
	Fstage(selector).prepend(html)  //inserts html as first child of each selected DOM node
	Fstage(selector).after(html)  //inserts html after each selected DOM node
	Fstage(selector).before(html)  //inserts html before each selected DOM node
	Fstage(selector).wrap(html)  //inserts html as parent of each selected DOM node
	Fstage(selector).remove()  //removes each selected DOM node from the document
	Fstage(selector).empty()  //removes all child nodes from each selected DOM node
	Fstage(selector).html(html)  //sets innerHTML of each selected DOM node
	Fstage(selector).text(text)  //sets textContent of each selected DOM node
	Fstage(selector).val(value)  //sets value of each selected DOM node

(6) DOM EFFECTS

	Fstage(selector).animate(opts = {})  //applies Element.prototype.animate to each selected DOM node
	Fstage(selector).show(opts = {})  //shows each selected DOM node
	Fstage(selector).hide(opts = {})  //shows each selected DOM node
	Fstage(selector).toggle(opts = {})  //toggles display of each selected DOM node
	Fstage(selector).sliding({ x: true, y: false, onStart: null, onMove: null, onEnd: null })  //controls sliding via options provided
	Fstage.transition(toEl, toEffect, fromEl, fromEffect, opts = {})  //executes page transition from one element to another

(7) SERVER CALLS

	Fstage.ajax(url, opts = {})  //retrieves response from server URL
	Fstage.websocket(url)  //creates websocket object, with auto-reconnect and on/off/trigger methods to listen and send messages

(8) PUBSUB

	Fstage.pub(id, data = {})  //publishes event with specified ID, and optional data
	Fstage.sub(id, callback)  //subscribes to event with specified ID
	Fstage.unsub(id, callback)  //unsubscribes to event with specified ID

(9) TICKS

	Fstage.tick(callback)  //registers callback to execute at end of current tick
	Fstage.nextTick(callback)  //registers callback to execute at start of next tick

(10) DOM DIFFING

	Fstage.syncDom(fromNode, toNode|toHtml, opts = {})  //updates specified DOM node to new state with the minimum necessary changes

(11) DOM REACTIVITY

	Fstage.watch(input)  //creates proxy of input and emits any changes via Fstage.pub('watch')
	Fstage.component(name, { el: null, parent: null, data: null, template: null })  //renders html and automatically updates if data changes

(12) PAGE ROUTING

	Fstage.router.has(name)  //check whether route has any registered callbacks
	Fstage.router.on(name, callback)  //register route and add callback
	Fstage.router.off(name, callback)  //remove route callback
	Fstage.router.trigger(name)  //manually execute route
	Fstage.router.url(name)  //generates URL for given route
	Fstage.router.start({ baseUrl: '', attr: 'data-route' })  //starts router with config opts, which must be called after all routes registered

(13) CRYPTO

	Fstage.crypto //simple wrapper for crypto.subtle
	Fstage.hash(string|array|object)  //converts input into a numeric hash