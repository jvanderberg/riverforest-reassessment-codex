import type { LegendBinId, PropertyRecord } from './types';

export const nullDisplay = '—';

export const legendBins: Array<{
	id: LegendBinId;
	label: string;
	range: string;
	color: string;
}> = [
	{ id: 'lt0', label: 'Decrease', range: '< 0%', color: '#2c7bb6' },
	{ id: '0to10', label: '0-10%', range: '0-10%', color: '#abd9e9' },
	{ id: '10to25', label: '10-25%', range: '10-25%', color: '#ffffbf' },
	{ id: '25to50', label: '25-50%', range: '25-50%', color: '#fdae61' },
	{ id: 'gte50', label: '50%+', range: '>= 50%', color: '#d7191c' },
	{ id: 'unknown', label: 'No base', range: 'unknown', color: '#8f949b' },
];

export function median(values: Array<number | null | undefined>) {
	const sorted = values
		.filter((value): value is number => Number.isFinite(value))
		.sort((a, b) => a - b);
	if (sorted.length === 0) {
		return null;
	}
	const middle = Math.floor(sorted.length / 2);
	if (sorted.length % 2 === 1) {
		return sorted[middle];
	}
	return (sorted[middle - 1] + sorted[middle]) / 2;
}

export function average(values: Array<number | null | undefined>) {
	const clean = values.filter((value): value is number => Number.isFinite(value));
	if (clean.length === 0) {
		return null;
	}
	return clean.reduce((sum, value) => sum + value, 0) / clean.length;
}

export function weightedChangePct(records: PropertyRecord[]) {
	const current = records.reduce((sum, record) => sum + (record.currentValue ?? 0), 0);
	const previous = records.reduce(
		(sum, record) => sum + (record.previousValue ?? 0),
		0,
	);
	if (previous <= 0) {
		return null;
	}
	return (current - previous) / previous;
}

export function classifyChange(value: number | null | undefined): LegendBinId {
	if (!isFiniteNumber(value)) {
		return 'unknown';
	}
	if (value < 0) {
		return 'lt0';
	}
	if (value < 0.1) {
		return '0to10';
	}
	if (value < 0.25) {
		return '10to25';
	}
	if (value < 0.5) {
		return '25to50';
	}
	return 'gte50';
}

export function formatCurrency(value: number | null | undefined) {
	if (!isFiniteNumber(value)) {
		return nullDisplay;
	}
	return new Intl.NumberFormat('en-US', {
		style: 'currency',
		currency: 'USD',
		maximumFractionDigits: 0,
	}).format(value);
}

export function formatPercent(value: number | null | undefined) {
	if (!isFiniteNumber(value)) {
		return nullDisplay;
	}
	return new Intl.NumberFormat('en-US', {
		style: 'percent',
		maximumFractionDigits: 1,
	}).format(value);
}

export function formatNumber(value: number | null | undefined) {
	if (!isFiniteNumber(value)) {
		return nullDisplay;
	}
	return new Intl.NumberFormat('en-US').format(value);
}

export function binColor(binId: LegendBinId) {
	return legendBins.find((bin) => bin.id === binId)?.color ?? '#8f949b';
}

function isFiniteNumber(value: number | null | undefined): value is number {
	return typeof value === 'number' && Number.isFinite(value);
}
