//imports
import dom from './dom.mjs';
import './effects.mjs';
import './widgets.mjs';

//set globals?
if(globalThis.Fstage) {
	Fstage.dom = dom;
}

//exports
export default dom;