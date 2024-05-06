//imports
import dom from './dom.mjs';
import './effects.mjs';
import './widgets.mjs';
import diff from './diff.mjs';

//set diff
dom.diff = diff;

//set globals?
if(globalThis.Fstage) {
	Fstage.dom = dom;
}

//exports
export default dom;