/**
 * Fork of https://github.com/bigskysoftware/idiomorph/
**/
export default function morph(oldNode, newNode, config = {}) {
	//convert html string?
	if(typeof newNode === 'string') {
		var tpl = document.createElement('template');
		tpl.innerHTML = newNode;
		newNode = tpl.content.firstElementChild;
	}
	//noop helper
	var noop = function() {};
	//create context
	var ctx = Object.assign({
		ignoreActive: false,
		ignoreActiveValue: false,
		removeAttributes: true,
		checkEqualNode: true,
		idMap: createIdMap(oldNode, newNode),
		deadIds: new Set()
	}, config || {});
	//set callbacks
	ctx.callbacks = Object.assign({
		beforeNodeAdded: noop,
		afterNodeAdded: noop,
		beforeNodeMorphed: noop,
		afterNodeMorphed: noop,
		beforeNodeRemoved: noop,
		afterNodeRemoved: noop,
		beforeAttributeUpdated: noop
	}, config.callbacks || {});
	//morph root node
	return morphOldToNew(oldNode, newNode, ctx);
}

function morphOldToNew(oldNode, newNode, ctx) {
	//ignore active element?
	if(ctx.ignoreActive && oldNode === document.activeElement) {
		return;
	}
	//is empty node?
	if(!newNode) {
		if(ctx.callbacks.beforeNodeRemoved(oldNode) === false) return oldNode;
		oldNode.remove();
		ctx.callbacks.afterNodeRemoved(oldNode);
		return null;
	}
	//replace node directly?
	if(!isSoftMatch(oldNode, newNode)) {
		if(ctx.callbacks.beforeNodeRemoved(oldNode) === false) return oldNode;
		if(ctx.callbacks.beforeNodeAdded(newNode) === false) return oldNode;
		oldNode.parentElement.replaceChild(newNode, oldNode);
		ctx.callbacks.afterNodeAdded(newNode);
		ctx.callbacks.afterNodeRemoved(oldNode);
		return newNode;
	}
	//keep old node attributes?
	if(!ctx.removeAttributes && oldNode.getAttribute && newNode.getAttribute) {
		//merge classes
		var classes = newNode.getAttribute('class');
		classes && classes.split(/\s+/).forEach(function(cls) {
			if(cls && !oldNode.classList.contains(cls)) {
				oldNode.classList.add(cls);
			}
		});
		//add missing attribtes to new node
		for(var i=0; i < oldNode.attributes.length; i++) {
			//get attribute
			var attr = oldNode.attributes[i];
			//add attribute to new node?
			if(!newNode.hasAttribute(attr.name)) {
				newNode.setAttribute(attr.name, attr.value);
			}
		}
	}
	//is equal node?
	if(ctx.checkEqualNode && oldNode.isEqualNode(newNode)) {
		return oldNode;
	}
	//morph old node to new node
	if(ctx.callbacks.beforeNodeMorphed(oldNode, newNode) === false) return oldNode;
	var didSelfChange = syncNodeFrom(newNode, oldNode, ctx);
	if(!ignoreActiveValue(oldNode, ctx)) {
		morphChildren(newNode, oldNode, ctx);
	}
	ctx.callbacks.afterNodeMorphed(oldNode, didSelfChange);
	return oldNode;
}

function morphChildren(newParent, oldParent, ctx) {
	//set vars
	var nextNewChild = newParent.firstChild;
	var insertionPoint = oldParent.firstChild;
	var newChild;
	//loop through new nodes
	while(nextNewChild) {
		//check next new child
		newChild = nextNewChild;
		nextNewChild = newChild.nextSibling;
		//at the end of the parent node's children?
		if(insertionPoint == null) {
			if(ctx.callbacks.beforeNodeAdded(newChild) === false) return;
			oldParent.appendChild(newChild);
			ctx.callbacks.afterNodeAdded(newChild);
			removeIdsFromConsideration(ctx, newChild);
			continue;
		}
		//id set match found?
		if(isIdSetMatch(newChild, insertionPoint, ctx)) {
			morphOldToNew(insertionPoint, newChild, ctx);
			insertionPoint = insertionPoint.nextSibling;
			removeIdsFromConsideration(ctx, newChild);
			continue;
		}
		//check for next id set match
		var idSetMatch = findIdSetMatch(newParent, oldParent, newChild, insertionPoint, ctx);
		//match found?
		if(idSetMatch) {
			insertionPoint = removeNodesBetween(insertionPoint, idSetMatch, ctx);
			morphOldToNew(idSetMatch, newChild, ctx);
			removeIdsFromConsideration(ctx, newChild);
			continue;
		}
		//no id set match found, so check for next soft match
		var softMatch = findSoftMatch(newParent, oldParent, newChild, insertionPoint, ctx);
		//match found?
		if(softMatch) {
			insertionPoint = removeNodesBetween(insertionPoint, softMatch, ctx);
			morphOldToNew(softMatch, newChild, ctx);
			removeIdsFromConsideration(ctx, newChild);
			continue;
		}
		//no matches found at all, so insert node directly
		if(ctx.callbacks.beforeNodeAdded(newChild) === false) return;
		oldParent.insertBefore(newChild, insertionPoint);
		ctx.callbacks.afterNodeAdded(newChild);
		removeIdsFromConsideration(ctx, newChild);
	}
	//remove any unmatched old nodes
	while(insertionPoint !== null) {
		var tempNode = insertionPoint;
		insertionPoint = insertionPoint.nextSibling;
		removeNode(tempNode, ctx);
	}
}

function syncNodeFrom(from, to, ctx) {
	//set vars
	var didChange = false;
	//is html element?
	if(from.nodeType === 1) {
		//loop through from attributes
		for(var fromAttribute of from.attributes) {
			//anything to update?
			if(to.getAttribute(fromAttribute.name) !== fromAttribute.value) {
				//skip attribute?
				if(!ignoreAttribute(fromAttribute.name, to, 'update', ctx)) {
					to.setAttribute(fromAttribute.name, fromAttribute.value);
					didChange = true;
				}
			}
		}
		//loop through to attributes (backwards)
		for(var i = to.attributes.length-1; 0 <= i; i--) {
			//anything to remove?
			if(!from.hasAttribute(to.attributes[i].name)) {
				//skip attribute?
				if(!ignoreAttribute(to.attributes[i].name, to, 'remove', ctx)) {
					to.removeAttribute(to.attributes[i].name);
					didChange = true;
				}
			}
		}
	}
	//is comment or text node?
	if(from.nodeType === 8 || from.nodeType === 3) {
		//anything to update?
		if(to.nodeValue !== from.nodeValue) {
			to.nodeValue = from.nodeValue;
			didChange = true;
		}
	}
	//sync input values?
	if(!ignoreActiveValue(to, ctx)) {
		if(syncInputValue(from, to, ctx)) {
			didChange = true;
		}
	}
	//return
	return didChange;
}

function syncInputValue(from, to, ctx) {
	//set vars
	var didChange = false;
	//select input element type
	if(from instanceof HTMLInputElement && to instanceof HTMLInputElement && from.type !== 'file') {
		//sync chaecked attribute?
		if(syncBooleanAttribute(from, to, 'checked', ctx)) {
			didChange = true;
		}
		//sync disabled attribute?
		if(syncBooleanAttribute(from, to, 'disabled', ctx)) {
			didChange = true;
		}
		//remove value attribute?
		if(!from.hasAttribute('value') && to.hasAttribute('value')) {
			//skip attribute?
			if(!ignoreAttribute('value', to, 'remove', ctx)) {
				to.value = '';
				to.removeAttribute('value');
				didChange = true;
			}
		}
		//change value attribute?
		if(from.value !== to.value) {
			//skip attribute?
			if(!ignoreAttribute('value', to, 'update', ctx)) {
				to.setAttribute('value', from.value);
				to.value = from.value;
				didChange = true;
			}
		}
	} else if(from instanceof HTMLOptionElement) {
		didChange = syncBooleanAttribute(from, to, 'selected', ctx)
	} else if(from instanceof HTMLTextAreaElement && to instanceof HTMLTextAreaElement) {
		//anything to update?
		if(from.value !== to.value) {
			//skip attribute?
			if(!ignoreAttribute('value', to, 'update', ctx)) {
				//update attribute
				to.value = from.value;
				//update child value?
				if(to.firstChild && to.firstChild.nodeValue !== from.value) {
					to.firstChild.nodeValue = from.value;
				}
				//mark as changed
				didChange = true;
			}
		}
	}
	//return
	return didChange;
}

function syncBooleanAttribute(from, to, attributeName, ctx) {
	//set vars
	var didChange = false;
	//anything to update?
	if(from[attributeName] !== to[attributeName]) {
		//skip attribute?
		var ignoreUpdate = ignoreAttribute(attributeName, to, 'update', ctx);
		//update attribute?
		if(!ignoreUpdate) {
			to[attributeName] = from[attributeName];
			didChange = true;
		}
		//has from attribute?
		if(from[attributeName]) {
			if(!ignoreUpdate) {
				to.setAttribute(attributeName, from[attributeName]);
				didChange = true;
			}
		} else {
			if(!ignoreAttribute(attributeName, to, 'remove', ctx)) {
				to.removeAttribute(attributeName);
				didChange = true;
			}
		}
	}
	//return
	return didChange;
}

function ignoreAttribute(attr, to, updateType, ctx) {	
	//skip attribute removal?
	if(!ctx.removeAttributes && updateType === 'remove') {
		return true;
	}
	//skip active element value?
	if(attr === 'value' && ctx.ignoreActiveValue && to === document.activeElement) {
		return true;
	}
	//callback result
	return ctx.callbacks.beforeAttributeUpdated(attr, to, updateType) === false;
}

function ignoreActiveValue(node, ctx) {
	return ctx.ignoreActiveValue && node === document.activeElement && node !== document.body;
}

function removeNode(tempNode, ctx) {
	removeIdsFromConsideration(ctx, tempNode)
	if(ctx.callbacks.beforeNodeRemoved(tempNode) === false) return;
	tempNode.remove();
	ctx.callbacks.afterNodeRemoved(tempNode);
}

function removeNodesBetween(startInclusive, endExclusive, ctx) {
	while(startInclusive !== endExclusive) {
		var tempNode = startInclusive;
		startInclusive = startInclusive.nextSibling;
		removeNode(tempNode, ctx);
	}
	removeIdsFromConsideration(ctx, endExclusive);
	return endExclusive.nextSibling;
}

function isSoftMatch(node1, node2) {
	//empty nodes?
	if(!node1 || !node2) {
		return false;
	}
	//check node type match
	return node1.nodeType === node2.nodeType && node1.tagName === node2.tagName
}

function findSoftMatch(newNode, oldParent, newChild, insertionPoint, ctx) {
	//set vars
	var potentialSoftMatch = insertionPoint;
	var nextSibling = newChild.nextSibling;
	var siblingSoftMatchCount = 0;
	//start match loop
	while(potentialSoftMatch != null) {
		 //the current potential soft match has a potential id set match with the remaining new node
		if(getIdIntersectionCount(ctx, potentialSoftMatch, newNode) > 0) {
			return null;
		}
		//if we have a soft match with the current node, return it
		if(isSoftMatch(newChild, potentialSoftMatch)) {
			return potentialSoftMatch;
		}
		//the next new node has a soft match with this node, so increment the count of future soft matches
		if(isSoftMatch(nextSibling, potentialSoftMatch)) {
			siblingSoftMatchCount++;
			nextSibling = nextSibling.nextSibling;
			//if there are two future soft matches, bail to allow the siblings to soft match
			if(siblingSoftMatchCount >= 2) {
				return null;
			}
		}
		//advanced to the next old child node
		potentialSoftMatch = potentialSoftMatch.nextSibling;
	}
	//return
	return potentialSoftMatch;
}

function isIdSetMatch(node1, node2, ctx) {
	if(!node1 || !node2) {
		return false;
	}
	if(node1.nodeType === node2.nodeType && node1.tagName === node2.tagName) {
		if(node1.id !== "" && node1.id === node2.id) {
			return true;
		}
		return getIdIntersectionCount(ctx, node1, node2) > 0;
	}
	return false;
}

function findIdSetMatch(newNode, oldParent, newChild, insertionPoint, ctx) {
	//max id matches we are willing to discard in our search
	var newChildPotentialIdCount = getIdIntersectionCount(ctx, newChild, oldParent);
	var potentialMatch = null;
	//only search forward if there is a possibility of an id match
	if(newChildPotentialIdCount > 0) {
		var potentialMatch = insertionPoint;
		var otherMatchCount = 0;
		while(potentialMatch != null) {
			//if we have an id match, return the current potential match
			if(isIdSetMatch(newChild, potentialMatch, ctx)) {
				return potentialMatch;
			}
			//compute the other potential matches of this new nodes
			otherMatchCount += getIdIntersectionCount(ctx, potentialMatch, newNode);
			if(otherMatchCount > newChildPotentialIdCount) {
				return null;
			}
			//advanced to the next old child node
			potentialMatch = potentialMatch.nextSibling;
		}
	}
	return potentialMatch;
}

function isIdInConsideration(ctx, id) {
	return !ctx.deadIds.has(id);
}

function idIsWithinNode(ctx, id, targetNode) {
	return (ctx.idMap.get(targetNode) || new Set()).has(id);
}

function removeIdsFromConsideration(ctx, node) {
	var idSet = ctx.idMap.get(node) || new Set();
	for(var id of idSet) {
		ctx.deadIds.add(id);
	}
}

function getIdIntersectionCount(ctx, node1, node2) {
	var sourceSet = ctx.idMap.get(node1) || new Set();
	var matchCount = 0;
	for(var id of sourceSet) {
		//a potential match is an id in the source and potentialIdsSet, but not added to the DOM
		if(isIdInConsideration(ctx, id) && idIsWithinNode(ctx, id, node2)) {
			++matchCount;
		}
	}
	return matchCount;
}

function populateIdMapForNode(node, idMap) {
	//find all elements with an id property
	var nodeParent = node.parentElement;
	var idElements = node.querySelectorAll('[id]');
	for(var elt of idElements) {
		var current = elt;
		//walk up tree, adding the element id to the parent's id set
		while(current !== nodeParent && current != null) {
			var idSet = idMap.get(current);
			// f the id set doesn't exist, insert it in the map
			if(idSet == null) {
				idSet = new Set();
				idMap.set(current, idSet);
			}
			idSet.add(elt.id);
			current = current.parentElement;
		}
	}
}

function createIdMap(oldNode, newNode) {
	var idMap = new Map();
	populateIdMapForNode(oldNode, idMap);
	populateIdMapForNode(newNode, idMap);
	return idMap;
}