//imports
import lit from './lit.mjs';
import router from './router.mjs';
import store from './store.mjs';
import components from './components.mjs';
import app from './app.mjs';

//set globals?
if(globalThis.Fstage) {
	Fstage.lit = lit;
	Fstage.router = router;
	Fstage.store = store;
	Fstage.components = components;
	Fstage.app = app;
}

//exports
export default app;
export { lit, router, store, components };