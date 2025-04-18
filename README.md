# fstage [ALPHA v0.5.0]

Fstage is a framework builder. Create a custom javascript framework using third-party libraries. No build steps required.

Alpha library, in development. Breaking changes may occur.

# Platform support

- Support for ES6 modules required
- Developed for client side usage only

# Quick Start

At it's most basic level, Fstage only requires two files to get started:

1.) The Fstage loader

	<script defer src="https://cdn.jsdelivr.net/gh/codi0/fstage@latest/src/js/fstage.min.mjs"></script>

2.) A local config file placed in "js/config.js" that the loader reads from

	<script defer src="https://cdn.jsdelivr.net/gh/codi0/fstage@latest/examples/pwa/js/config.js"></script>

# To-Do App example

Check out the "examples/pwa" folder to see how Fstage works in practice. This progressive web app makes use of:	

- LitElement for web components
- Ionic for UI elements and routing
- Capacitor for access to native APIs
- Fstage modules to handle global data reactivity and syncing with local and remote storages

# Fstage modules

As well as being a framework builder, Fstage comes with its own set of modules that can optionally be made use of as part of your framework.

Documentation for each module will follow in due course, but you can see several of them at work in the example PWA.