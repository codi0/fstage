//imports
import dom from './dom.mjs';

//add to dom
dom.diff = domDiff;

//Forked: https://github.com/patrick-steele-idem/morphdom/
export default function domDiff(from, to, opts = {}) {

	//get node key helper
	var getNodeKey = function(node) {
		//set vars
		var key = '';
		//custom callback?
		if(opts.onGetKey) {
			key = opts.onGetKey(node, opts.key);
		} else if( node.getAttribute && !node.classList.contains('page')) {
			key = node.getAttribute(opts.key || 'id');
		}
		//return
		return key || '';
	};

	//find keyed nodes helper
	var findKeyedNodes = function(node, res = {}) {
		if(node.nodeType === 1 || node.nodeType === 11) {
			var curChild = node.firstChild;
			while(curChild) {
				var key = getNodeKey(curChild);
				if(key) {
					res[key] = curChild;
				}
				res = findKeyedNodes(curChild, res);
				curChild = curChild.nextSibling;
			}
		}
		return res;
	};

	//update node helper
	var updateNode = function(from, to) {
		//delete node key
		delete fromNodesLookup[getNodeKey(to)];
		//equivalent node?
		if(from.isEqualNode(to)) {
			return;
		}
		//run before callback?
		if(opts.beforeUpdateNode) {
			if(opts.beforeUpdateNode(from, to) === false) {
				return;
			}
		}
		//clone from
		var cloned = from.cloneNode(false);
		//update attributes
		updateAttrs(from, to);
		//update children
		updateChildren(from, to);
		//run after callback?
		if(opts.afterUpdateNode) {
			opts.afterUpdateNode(cloned, from);
		}
	};

	//update attrs helper
	var updateAttrs = function(from, to) {
		//skip fragment?
		if(from.nodeType === 11 || to.nodeType === 11) {
			return;
		}
		//cache to attr
		var toAttrs = to.attributes;
		//set updated attributes
		for(var i=0; i < toAttrs.length; i++) {
			if(from.getAttribute(toAttrs[i].name) !== toAttrs[i].value) {
				from.setAttribute(toAttrs[i].name, toAttrs[i].value);
			}
		}
		//cache from attr
		var fromAttrs = from.attributes;
		//remove discarded attrs
		for(var i=0; i < fromAttrs.length; i++) {
			if(!to.hasAttribute(fromAttrs[i].name)) {
				from.removeAttribute(fromAttrs[i].name);
			}
		}
	};

	//update boolean attr helper
	var updateAttrBool = function(from, to, name) {
		from[name] = to[name];
		from[from[name] ? 'setAttribute' : 'removeAttribute'](name, '');
	};

	//update child nodes helper
	var updateChildren = function(from, to) {
		//set vars
		var curToChild = to.firstChild;
		var curFromChild = from.firstChild;
		var curToKey, curFromKey, fromNextSibling, toNextSibling, matchingFromEl;
		//handle textarea node?
		if(from.nodeName === 'TEXTAREA') {
			from.value = to.value;
			return;
		}
		//walk 'to' children
		outer: while(curToChild) {
			//set next 'to' sibling
			toNextSibling = curToChild.nextSibling;
			//get 'to' node key
			curToKey = getNodeKey(curToChild);
			//walk 'from' children
			while(curFromChild) {
				//set next 'from' sibling
				fromNextSibling = curFromChild.nextSibling;
				//is same node?
				if(curToChild === curFromChild) {
					//move to next sibling
					curToChild = toNextSibling;
					curFromChild = fromNextSibling;
					continue outer;
				}
				//compatible flag
				var isCompatible = undefined;
				//get 'from' node key
				curFromKey = getNodeKey(curFromChild);
				//same node type?
				if(curFromChild.nodeType === curToChild.nodeType) {
					//is element?
					if(curFromChild.nodeType === 1) {
						//has key?
						if(curToKey) {
							//keys not matching?
							if(curToKey !== curFromKey) {
								//match found in lookup?
								if((matchingFromEl = fromNodesLookup[curToKey])) {
									if(fromNextSibling === matchingFromEl) {
										isCompatible = false;
									} else {
										from.insertBefore(matchingFromEl, curFromChild);
										if(curFromKey) {
											keyedRemovalList.push(curFromKey);
										} else {
											removeNode(curFromChild, from, true);
										}
										curFromChild = matchingFromEl;
									}
								} else {
									isCompatible = false;
								}
							}
						} else if(curFromKey) {
							isCompatible = false;
						}
						isCompatible = (isCompatible !== false) && (curFromChild.nodeName === curToChild.nodeName);
						if(isCompatible) {
							updateNode(curFromChild, curToChild);
						}
					}
					//is text or comment?
					if(curFromChild.nodeType === 3 || curFromChild.nodeType === 8) {
						isCompatible = true;
						curFromChild.nodeValue = curToChild.nodeValue;
					}
				}
				//is compatible?
				if(isCompatible) {
					//move to next sibling
					curToChild = toNextSibling;
					curFromChild = fromNextSibling;
					continue outer;
				}
				if(curFromKey) {
					keyedRemovalList.push(curFromKey);
				} else {
					removeNode(curFromChild, from, true);
				}
				curFromChild = fromNextSibling;
			}
			//append node
			if(curToKey && (matchingFromEl = fromNodesLookup[curToKey]) && matchingFromEl.nodeName === curToChild.nodeName) {
				from.appendChild(matchingFromEl);
				updateNode(matchingFromEl, curToChild);
			} else {
				if(curToChild.actualize) {
					curToChild = curToChild.actualize(from.ownerDocument || document);
				}
				from.appendChild(curToChild);
				nodeAdded(curToChild);
			}
			//move to next sibling
			curToChild = toNextSibling;
			curFromChild = fromNextSibling;
		}
		//clean up from?
		while(curFromChild) {
			fromNextSibling = curFromChild.nextSibling;
			curFromKey = getNodeKey(curFromChild);
			if(curFromKey) {
				keyedRemovalList.push(curFromKey);
			} else {
				removeNode(curFromChild, from, true);
			}
			curFromChild = fromNextSibling;
		}
		//handle input node?
		if(from.nodeName === 'INPUT') {
			//update boolean attrs
			updateAttrBool(from, to, 'checked');
			updateAttrBool(from, to, 'disabled');
			//set value
			from.value = to.value;
			//remove value attr?
			if(!to.hasAttribute('value')) {
				from.removeAttribute('value');
			}
		}
		//handle select node?
		if(from.nodeName === 'SELECT') {
			//is multi select?
			if(!to.hasAttribute('multiple')) {
				//set vars
				var curChild = from.firstChild;
				var index = -1, i = 0, optgroup;
				//loop through children
				while(curChild) {
					//is optgroup node?
					if(curChild.nodeName === 'OPTGROUP') {
						optgroup = curChild;
						curChild = optgroup.firstChild;
					}
					//is option node?
					if(curChild.nodeName === 'OPTION') {
						//is selected?
						if(curChild.hasAttribute('selected')) {
							index = i;
							break;
						}
						//increment
						i++;
					}
					//move to next sibling
					curChild = curChild.nextSibling;
					//move to next opt group?
					if(!curChild && optgroup) {
						curChild = optgroup.nextSibling;
						optgroup = null;
					}
				}
				//update index
				from.selectedIndex = index;
			}
		}
		//handle select node?
		if(from.nodeName === 'OPTION') {
			//has parent node?
			if(from.parentNode) {
				//set vars
				var parentNode = from.parentNode;
				var parentName = parentNode.nodeName;
				//parent is optgroup node?
				if(parentName === 'OPTGROUP') {
					parentNode = parentNode.parentNode;
					parentName = parentNode && parentNode.nodeName;
				}
				//parent is select node?
				if(parentName === 'SELECT' && !parentNode.hasAttribute('multiple')) {
					//remove attribute?
					if(from.hasAttribute('selected') && !to.selected) {
						fromEl.setAttribute('selected', 'selected');
						fromEl.removeAttribute('selected');
					}
					//update index
					parentNode.selectedIndex = -1;
				}
			}
			//update boolean attr
			updateAttrBool(from, to, 'selected');
		}
	};

	//node added helper
	var nodeAdded = function(el) {
		var curChild = el.firstChild;
		while(curChild) {
			var nextSibling = curChild.nextSibling;
			var key = getNodeKey(curChild);
			//key = null;
			if(key) {
				var unmatchedFromEl = fromNodesLookup[key];
				if(unmatchedFromEl && curChild.nodeName === unmatchedFromEl.nodeName) {
					curChild.parentNode.replaceChild(unmatchedFromEl, curChild);
					updateNode(unmatchedFromEl, curChild);
				} else {
					nodeAdded(curChild);
				}
			} else {
				nodeAdded(curChild);
			}
			curChild = nextSibling;
		}
	};
	//remove node helper
	var removeNode = function(node, parentNode, skipKeyedNodes) {
		if(parentNode) {
			parentNode.removeChild(node);
		}
		walkDiscardedNodes(node, skipKeyedNodes);
	};
	//walk discarded nodes helper
	var walkDiscardedNodes = function(node, skipKeyedNodes) {
		if(node.nodeType === 1) {
			var curChild = node.firstChild;
			while(curChild) {
				var key = getNodeKey(curChild);
				if(key && skipKeyedNodes) {
					keyedRemovalList.push(curFromKey);
				} else if(curChild.firstChild) {
					walkDiscardedNodes(curChild, skipKeyedNodes);
				}
				curChild = curChild.nextSibling;
			}
		}
	};

	//start update
	var updated = from;
	var keyedRemovalList = [];
	var fromNodesLookup = findKeyedNodes(from);
	
	//convert html to nodes?
	if(typeof to === 'string') {
		var tmp = from.cloneNode(false);
		tmp.innerHTML = to;
		to = tmp;
	}

	//is element?
	if(updated.nodeType === 1) {
		if(to.nodeType === 1) {
			if(from.nodeName !== to.nodeName) {
				updated = document.createElement(to.nodeName);
				while(from.firstChild) {
					updated.appendChild(from.firstChild);
				}
			}
		} else {
			updated = to;
		}
	}

	//is text or comment?
	if(updated.nodeType === 3 || updated.nodeType === 8) {
		if(to.nodeType === updated.nodeType) {
			updated.nodeValue = to.nodeValue;
			return updated;
		} else {
			updated = to;
		}
	}

	//update node?
	if(updated !== to) {
		//update node
		updateNode(updated, to);
		//check keyed nodes
		for(var i=0; i < keyedRemovalList.length; i++) {
			//node to remove
			var toRemove = fromNodesLookup[keyedRemovalList[i]];
			//can remove?
			if(toRemove) {
				removeNode(toRemove, toRemove.parentNode, false);
			}
		}
	}

	//replace from node?
	if(updated !== from && from.parentNode) {
		//virtual DOM?
		if(updated.actualize) {
			updated = updated.actualize(from.ownerDocument || document);
		}
		//replace node
		from.parentNode.replaceChild(updated, from);
	}

	//return
	return updated;

}