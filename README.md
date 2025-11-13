# fstage [ALPHA v0.5.3]

Fstage is a framework builder. Create a custom javascript framework using third-party libraries or your own code. No build steps.

Alpha library, in development. Breaking changes may occur.

# Platform support

- Support for ES6 modules required
- Support for ImportMap required

# Quick Start

At it's most basic level, Fstage only requires two files to get started:

1.) The Fstage loader

	https://cdn.jsdelivr.net/gh/codi0/fstage@latest/src/js/fstage.min.mjs

2.) A local config file placed in "js/config.js" that the loader reads from (example below)

	https://cdn.jsdelivr.net/gh/codi0/fstage@latest/examples/pwa/js/config.js

# To-Do App example

Check out the "examples/pwa" folder to see how Fstage works in practice. This progressive web app makes use of:	

- LitElement for web components
- Ionic for UI elements and routing
- Capacitor for access to native APIs
- Fstage modules to handle global reactivity and storage syncing

# Fstage modules

As well as being a framework builder, Fstage comes with its own set of modules that can used as part of your own framework.

Documentation for each module will follow in due course, but you can see several of them at work in the example PWA.