function assert(condition, message) {
  if(!condition) throw new Error(message);
}

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function freeze(value) {
  return Object.freeze(value);
}

function isPlainObject(value) {
  return !!value && value.constructor === Object;
}

function normalizeManifestDefault(manifest) {
  assert(manifest && typeof manifest === 'object' && !Array.isArray(manifest), 'Plugin manifest must be an object');
  const id = String(manifest.id || '').trim();
  assert(id, 'Plugin manifest requires id');
  return freeze({
    id,
    name: String(manifest.name || id),
    dependsOn: Array.from(new Set((Array.isArray(manifest.dependsOn) ? manifest.dependsOn : []).map((value) => String(value).trim()).filter(Boolean))),
  });
}

function normalizePluginDefinition(definition, moduleUrl) {
  assert(isPlainObject(definition), `Plugin module ${moduleUrl} must default export a plain object`);
  assert(typeof definition.activate === 'function', `Plugin module ${moduleUrl} must define activate(ctx)`);
  if('deactivate' in definition) assert(typeof definition.deactivate === 'function', `Plugin module ${moduleUrl} deactivate must be a function`);
  return freeze({
    activate: definition.activate,
    deactivate: typeof definition.deactivate === 'function' ? definition.deactivate : null,
  });
}

export function createPluginManager({ createHostFacade, normalizeManifest=normalizeManifestDefault, internalPrefix='plugin.internal.' }={}) {
  const sources = new Map();
  const active = new Map();
  const handlers = new Map();
  const contributions = new Map();
  const activationStack = new Set();
  const listeners = new Map();

  function emit(type, payload={}) {
    const event = freeze({ type: String(type), ...clone(payload) });
    const bucket = listeners.get(event.type);
    if(bucket) {
      for(const listener of [...bucket]) {
        try { listener(event); } catch {}
      }
    }
    return event;
  }

  function on(type, listener) {
    const eventType = String(type || '').trim();
    assert(eventType, 'Event type is required');
    assert(typeof listener === 'function', 'Event listener must be a function');
    if(!listeners.has(eventType)) listeners.set(eventType, new Set());
    listeners.get(eventType).add(listener);
    return () => listeners.get(eventType)?.delete(listener);
  }

  function publicSource(record) {
    return clone({
      id: record.manifest.id,
      manifest: record.manifest,
      protected: record.protected,
      meta: record.meta,
      moduleUrl: record.moduleUrl,
    });
  }

  function registerSource(source) {
    assert(source && typeof source === 'object', 'Plugin source must be an object');
    const manifest = freeze(clone(normalizeManifest(source.manifest)));
    assert(manifest.id, 'Plugin manifest requires id');
    assert(!sources.has(manifest.id), `Duplicate source: ${manifest.id}`);
    const record = freeze({
      manifest,
      moduleUrl: String(source.moduleUrl || ''),
      protected: !!source.protected,
      meta: clone(source.meta || {}),
    });
    sources.set(manifest.id, record);
    emit('source.registered', { pluginId: manifest.id });
    return publicSource(record);
  }

  function getSourceRecord(pluginId) {
    const record = sources.get(String(pluginId || '').trim());
    assert(record, `Unknown plugin source: ${pluginId}`);
    return record;
  }

  function getSource(pluginId) {
    return publicSource(getSourceRecord(pluginId));
  }

  function hasSource(pluginId) {
    return sources.has(String(pluginId || '').trim());
  }

  function removeSource(pluginId) {
    const id = String(pluginId || '').trim();
    const record = sources.get(id);
    if(!record) return false;
    assert(!record.protected, `Cannot remove protected plugin: ${id}`);
    assert(!active.has(id), `Cannot remove active plugin: ${id}`);
    sources.delete(id);
    emit('source.removed', { pluginId: id });
    return true;
  }

  function listSources() {
    return [...sources.values()].map(publicSource);
  }

  function listActive() {
    return [...active.values()].map((record) => clone(record.publicRecord));
  }

  function isActive(pluginId) {
    return active.has(String(pluginId || '').trim());
  }

  function canCallInternal(callerPluginId, ownerPluginId, handlerId) {
    return !String(handlerId).startsWith(internalPrefix) || callerPluginId === 'host' || callerPluginId === ownerPluginId;
  }

  async function callHandler(handlerId, payload={}, callerPluginId='host') {
    const id = String(handlerId || '').trim();
    const entry = handlers.get(id);
    assert(entry, `Unknown handler: ${id}`);
    assert(canCallInternal(String(callerPluginId || 'host'), entry.ownerPluginId, id), `Handler ${id} is internal`);
    const result = await entry.fn(clone(payload), freeze({ handlerId: id, callerPluginId: String(callerPluginId || 'host'), ownerPluginId: entry.ownerPluginId }));
    return clone(result);
  }

  function listContributions(type) {
    const bucket = contributions.get(String(type || '').trim());
    return bucket ? [...bucket.values()].map((entry) => clone(entry.value)) : [];
  }

  async function cleanupActivation({ pluginId, registeredHandlers, registeredContributions, eventUnsubscribers, cleanupFns }) {
    for(const handlerId of [...registeredHandlers].reverse()) handlers.delete(handlerId);
    for(const item of [...registeredContributions].reverse()) contributions.get(item.type)?.delete(item.id);
    for(const unsubscribe of [...eventUnsubscribers].reverse()) {
      try { unsubscribe(); } catch {}
    }
    for(const fn of [...cleanupFns].reverse()) {
      try { await fn(); } catch {}
    }
    active.delete(pluginId);
  }

  async function activate(pluginId) {
    const source = getSourceRecord(pluginId);
    const pluginIdString = source.manifest.id;
    if(active.has(pluginIdString)) return clone(active.get(pluginIdString).publicRecord);
    assert(!activationStack.has(pluginIdString), `Circular activation detected at ${pluginIdString}`);
    activationStack.add(pluginIdString);
    try {
      for(const dependencyId of source.manifest.dependsOn || []) await activate(dependencyId);
      const registeredHandlers = [];
      const registeredContributions = [];
      const cleanupFns = [];
      const eventUnsubscribers = [];
      const hostFacade = typeof createHostFacade === 'function'
        ? createHostFacade(source)
        : freeze({ can() { return false; }, capability() { throw new Error(`Plugin ${pluginIdString} has no host access`); } });

      const ctx = freeze({
        manifest: source.manifest,
        can: (capabilityId) => !!hostFacade.can(String(capabilityId || '').trim()),
        host: freeze({ capability: (capabilityId) => hostFacade.capability(String(capabilityId || '').trim()) }),
        handlers: freeze({
          register(handlerId, fn) {
            const id = String(handlerId || '').trim();
            assert(id.includes('.'), `Handler ids must be namespaced: ${id || '(empty)'}`);
            assert(typeof fn === 'function', `Handler ${id} must be a function`);
            assert(!handlers.has(id), `Duplicate handler: ${id}`);
            handlers.set(id, { ownerPluginId: pluginIdString, fn });
            registeredHandlers.push(id);
            emit('handler.registered', { pluginId: pluginIdString, handlerId: id });
            return id;
          },
          call(handlerId, payload={}) {
            return callHandler(handlerId, payload, pluginIdString);
          },
        }),
        contributions: freeze({
          register(type, contribution) {
            const contributionType = String(type || '').trim();
            assert(contributionType, 'Contribution type is required');
            assert(contribution && typeof contribution === 'object' && !Array.isArray(contribution), `Contribution for ${contributionType} must be an object`);
            const id = String(contribution.id || '').trim();
            assert(id, `${contributionType} contribution id is required`);
            if(!contributions.has(contributionType)) contributions.set(contributionType, new Map());
            const bucket = contributions.get(contributionType);
            assert(!bucket.has(id), `Duplicate contribution ${contributionType}:${id}`);
            const value = freeze({ ...clone(contribution), id });
            bucket.set(id, freeze({ ownerPluginId: pluginIdString, value }));
            registeredContributions.push({ type: contributionType, id });
            emit('contribution.registered', { pluginId: pluginIdString, type: contributionType, id });
            return clone(value);
          },
          list(type) {
            return listContributions(type);
          },
          remove(type, id) {
            const contributionType = String(type || '').trim();
            const contributionId = String(id || '').trim();
            const entry = contributions.get(contributionType)?.get(contributionId);
            if(!entry) return false;
            assert(entry.ownerPluginId === pluginIdString, `Plugin ${pluginIdString} does not own ${contributionType}:${contributionId}`);
            contributions.get(contributionType)?.delete(contributionId);
            emit('contribution.removed', { pluginId: pluginIdString, type: contributionType, id: contributionId });
            return true;
          },
        }),
        cleanup(fn) {
          assert(typeof fn === 'function', 'Cleanup must be a function');
          cleanupFns.push(fn);
          return fn;
        },
        events: freeze({
          on(type, listener) {
            const unsubscribe = on(type, listener);
            eventUnsubscribers.push(unsubscribe);
            return unsubscribe;
          },
        }),
      });

      try {
        const mod = await import(source.moduleUrl);
        const definition = normalizePluginDefinition(mod?.default, source.moduleUrl);
        await definition.activate(ctx);
        const deactivateHook = definition.deactivate ? async () => { await definition.deactivate(ctx); } : null;
        const publicRecord = freeze({ id: pluginIdString, manifest: source.manifest, protected: source.protected });
        active.set(pluginIdString, freeze({
          manifest: source.manifest,
          protected: source.protected,
          cleanupFns,
          eventUnsubscribers,
          publicRecord,
          registeredHandlers,
          registeredContributions,
          deactivateHook,
        }));
        emit('plugin.activated', { pluginId: pluginIdString });
        return clone(publicRecord);
      } catch (error) {
        await cleanupActivation({ pluginId: pluginIdString, registeredHandlers, registeredContributions, eventUnsubscribers, cleanupFns });
        throw error;
      }
    } finally {
      activationStack.delete(pluginIdString);
    }
  }

  async function deactivate(pluginId) {
    const id = String(pluginId || '').trim();
    const record = active.get(id);
    if(!record) return false;
    assert(!record.protected, `Cannot deactivate protected plugin: ${id}`);
    const dependents = [...active.values()].filter((item) => (item.manifest.dependsOn || []).includes(id)).map((item) => item.manifest.id);
    assert(!dependents.length, `Cannot deactivate ${id}; active dependents: ${dependents.join(', ')}`);

    try {
      if(record.deactivateHook) await record.deactivateHook();
    } finally {
      await cleanupActivation({
        pluginId: id,
        registeredHandlers: record.registeredHandlers,
        registeredContributions: record.registeredContributions,
        eventUnsubscribers: record.eventUnsubscribers,
        cleanupFns: record.cleanupFns,
      });
    }
    emit('plugin.deactivated', { pluginId: id });
    return true;
  }

  return freeze({
    on,
    emit,
    callHandler,
    listContributions,
    listSources,
    listActive,
    hasSource,
    isActive,
    getSource,
    registerSource,
    removeSource,
    activate,
    deactivate,
  });
}
