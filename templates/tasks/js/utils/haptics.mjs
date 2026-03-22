import { numberOr } from './shared.mjs';
import { defaultRegistry } from '@fstage/registry';

function nowMs() {
	try { return globalThis.performance && performance.now ? performance.now() : Date.now(); }
	catch (err) { return Date.now(); }
}

function getHapticsPolicy() {
	var config = defaultRegistry().get('config');
	return (config && config.policy && config.policy.haptics) || {};
}

var _lastPulseAt = 0;

function canPulse(opts) {
	opts = opts || {};
	var policy = getHapticsPolicy();
	var gap = numberOr(opts.minGapMs, numberOr(policy.minGapMs, 24));
	var t = nowMs();
	if ((t - _lastPulseAt) < gap) return false;
	_lastPulseAt = t;
	return true;
}

function vibrate(ms) {
	try {
		if (navigator && navigator.vibrate) navigator.vibrate(ms);
	} catch (err) {}
}

function getHapticsPlugin() {
	var plugins = null;

	if (globalThis.Capacitor && globalThis.Capacitor.Plugins) {
		plugins = globalThis.Capacitor.Plugins;
	}

	if (!plugins && globalThis.CapacitorPlugins) {
		plugins = globalThis.CapacitorPlugins;
	}

	return plugins && plugins.Haptics ? plugins.Haptics : null;
}

function getFallbackMs(kind, opts) {
	opts = opts || {};
	var policy = getHapticsPolicy();
	if (typeof opts.fallbackMs === 'number') return opts.fallbackMs;
	if (kind === 'light')  return numberOr(policy.fallbackLightMs, 8);
	if (kind === 'medium') return numberOr(policy.fallbackMediumMs, 14);
	if (kind === 'heavy')  return numberOr(policy.fallbackHeavyMs, 20);
	return 10;
}

function impact(style, kind, opts) {
	opts = opts || {};
	var policy = getHapticsPolicy();
	if (opts.enabled === false || policy.enabled === false) return;
	if (!canPulse(opts)) return;

	var haptics = getHapticsPlugin();
	var fallbackMs = getFallbackMs(kind, opts);

	try {
		if (haptics && typeof haptics.impact === 'function') {
			var res = haptics.impact({ style: style });
			if (res && typeof res.catch === 'function') {
				res.catch(function() { vibrate(fallbackMs); });
			}
			return;
		}
	} catch (err) {}

	vibrate(fallbackMs);
}

export function hapticLight(opts) {
	impact('LIGHT', 'light', opts);
}

export function hapticMedium(opts) {
	impact('MEDIUM', 'medium', opts);
}

export function hapticHeavy(opts) {
	impact('HEAVY', 'heavy', opts);
}
