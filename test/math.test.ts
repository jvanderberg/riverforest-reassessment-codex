import { describe, expect, it } from 'vitest';
import { classifyChange, median, weightedChangePct } from '../src/lib/math';
import type { PropertyRecord } from '../src/lib/types';

describe('headline math', () => {
	it('computes median for odd and even samples', () => {
		expect(median([3, 1, 2])).toBe(2);
		expect(median([4, 1, 2, 3])).toBe(2.5);
		expect(median([null, undefined])).toBeNull();
	});

	it('classifies reassessment changes into stable legend bins', () => {
		expect(classifyChange(-0.01)).toBe('lt0');
		expect(classifyChange(0.05)).toBe('0to10');
		expect(classifyChange(0.2)).toBe('10to25');
		expect(classifyChange(0.4)).toBe('25to50');
		expect(classifyChange(0.7)).toBe('gte50');
		expect(classifyChange(null)).toBe('unknown');
	});

	it('computes base-weighted aggregate change', () => {
		const records = [
			{ currentValue: 150, previousValue: 100 },
			{ currentValue: 220, previousValue: 200 },
		] as PropertyRecord[];
		expect(weightedChangePct(records)).toBeCloseTo(70 / 300);
	});
});
