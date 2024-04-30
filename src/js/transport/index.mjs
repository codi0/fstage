//imports
import ajax from './ajax.mjs';
import websocket from './websocket.mjs';

//set globals?
if(globalThis.Fstage) {
	Fstage.ajax = ajax;
	Fstage.websocket = websocket;
}

//exports
export { ajax, websocket };