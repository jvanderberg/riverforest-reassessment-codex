import type { GroupBy, LegendBinId } from './types';

export type UrlState = {
	classes: string[];
	neighborhoods: string[];
	bins: LegendBinId[];
	groupBy: GroupBy;
	pin: string | null;
	theme: 'system' | 'light' | 'dark';
};

export function readUrlState(): UrlState {
	const params = new URLSearchParams(window.location.search);
	return {
		classes: splitParam(params.get('class')),
		neighborhoods: splitParam(params.get('nbhd')),
		bins: splitParam(params.get('bins')) as LegendBinId[],
		groupBy: params.get('group') === 'class' ? 'class' : 'neighborhood',
		pin: params.get('pin'),
		theme: parseTheme(params.get('theme')),
	};
}

export function writeUrlState(state: UrlState) {
	const params = new URLSearchParams();
	if (state.classes.length > 0) {
		params.set('class', state.classes.join(','));
	}
	if (state.neighborhoods.length > 0) {
		params.set('nbhd', state.neighborhoods.join(','));
	}
	if (state.bins.length > 0) {
		params.set('bins', state.bins.join(','));
	}
	if (state.groupBy !== 'neighborhood') {
		params.set('group', state.groupBy);
	}
	if (state.pin) {
		params.set('pin', state.pin);
	}
	if (state.theme !== 'system') {
		params.set('theme', state.theme);
	}
	const next = `${window.location.pathname}${params.toString() ? `?${params}` : ''}`;
	window.history.replaceState(null, '', next);
}

function splitParam(value: string | null) {
	return value ? value.split(',').filter(Boolean) : [];
}

function parseTheme(value: string | null) {
	if (value === 'light' || value === 'dark') {
		return value;
	}
	return 'system';
}
