import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const SOCRATA = 'https://datacatalog.cookcountyil.gov';
const ASSESSED = `${SOCRATA}/resource/uzyt-m557.json`;
const ADDRESSES = `${SOCRATA}/resource/3723-97qp.json`;
const ADDRESS_POINTS = `${SOCRATA}/resource/78yw-iddh.json`;
const PARCEL_QUERY =
	'https://gis.cookcountyil.gov/hosting/rest/services/Hosted/Parcel_2022/FeatureServer/0/query';
const MUNICIPAL_QUERY =
	'https://services.arcgis.com/F7DSX1DSNSiWmOqh/arcgis/rest/services/Cook_County_Municipalities/FeatureServer/0/query';

const TOWNSHIP_CODE = '33';
const CITY = 'RIVER FOREST';
const OUT_DIR = path.resolve('public/data');

const classDescriptions = {
	100: 'Vacant land',
	200: 'Residential land or improvement',
	202: 'Two or more story residence, up to 62 years old',
	203: 'One-story residence, any age, 1,001 to 1,800 sq. ft.',
	204: 'Two or more story residence, 63 years or older',
	205: 'Residential condominium',
	206: 'Residential condominium, garage',
	207: 'Two to six apartments, any age',
	208: 'Two or more story residence, up to 62 years old, large',
	209: 'One-story residence, any age, over 1,800 sq. ft.',
	210: 'Residential garage',
	211: 'Apartment building, seven units or more',
	212: 'Mixed-use commercial and residential',
	234: 'Split-level residence',
	241: 'Residential improvement on leased land',
	299: 'Residential exempt',
	300: 'Multifamily apartment',
	400: 'Not-for-profit',
	500: 'Commercial',
	501: 'Commercial land',
	517: 'Commercial building',
	522: 'Commercial condominium',
	523: 'Commercial condominium, garage',
	590: 'Commercial incentive',
	600: 'Industrial',
	700: 'Industrial incentive',
	800: 'Agricultural',
	900: 'Exempt',
	EX: 'Exempt',
	RR: 'Railroad',
};

await main();

async function main() {
	await mkdir(OUT_DIR, { recursive: true });
	const years = await latestYears();
	const [currentRows, previousRows, addressRows, pointRows, boundary] =
		await Promise.all([
			fetchSocrata(ASSESSED, {
				$select:
					'pin,year,class,township_code,township_name,nbhd,mailed_tot,certified_tot,board_tot',
				$where: `township_code='${TOWNSHIP_CODE}' AND year=${years.current}`,
				$limit: '50000',
			}),
			fetchSocrata(ASSESSED, {
				$select:
					'pin,year,class,township_code,township_name,nbhd,mailed_tot,certified_tot,board_tot',
				$where: `township_code='${TOWNSHIP_CODE}' AND year=${years.previous}`,
				$limit: '50000',
			}),
			fetchSocrata(ADDRESSES, {
				$select:
					'pin,pin10,year,prop_address_full,prop_address_city_name,prop_address_state,prop_address_zipcode_1',
				$where: `prop_address_city_name='${CITY}' AND year=${years.current}`,
				$limit: '50000',
			}),
			fetchSocrata(ADDRESS_POINTS, {
				$select: 'pin,cmpaddabrv,inc_muni,post_comm,twp_name,lat,long',
				$where: `inc_muni='River Forest'`,
				$limit: '50000',
			}),
			fetchBoundary(),
		]);

	assertRows('current assessed values', currentRows, 4000);
	assertRows('previous assessed values', previousRows, 4000);
	assertRows('parcel addresses', addressRows, 4000);
	assertRows('address points', pointRows, 3000);

	const previousByPin = new Map(previousRows.map((row) => [row.pin, row]));
	const addressByPin = new Map(addressRows.map((row) => [row.pin, row]));
	const pointByPin = buildPointMap(pointRows);
	const pointByAddress = new Map(
		pointRows
			.filter((row) => row.cmpaddabrv)
			.map((row) => [normalizeAddress(row.cmpaddabrv), row]),
	);

	const placement = {
		'direct-pin': 0,
		'parent-pin': 0,
		address: 0,
		missing: 0,
	};

	const records = currentRows
		.map((current) => {
			const previous = previousByPin.get(current.pin);
			const address = addressByPin.get(current.pin);
			const coordinate = resolveCoordinate(
				current.pin,
				address,
				pointByPin,
				pointByAddress,
			);
			placement[coordinate.method] += 1;
			const currentAssessedValue = latestAssessedTotal(current);
			const previousAssessedValue = previous ? latestAssessedTotal(previous) : null;
			const assessmentLevel = assessmentLevelForClass(current.class);
			const previousAssessmentLevel = previous
				? assessmentLevelForClass(previous.class)
				: null;
			const currentValue = assessedToMarket(currentAssessedValue, assessmentLevel);
			const previousValue = assessedToMarket(
				previousAssessedValue,
				previousAssessmentLevel,
			);
			const changeDollar =
				currentValue === null || previousValue === null
					? null
					: currentValue - previousValue;
			const changePct =
				changeDollar === null || !previousValue ? null : changeDollar / previousValue;
			const classCode = current.class ?? 'unknown';
			return {
				id: current.pin,
				pin: current.pin,
				pin10: current.pin.slice(0, 10),
				address: formatAddress(address, coordinate.row),
				city: CITY,
				classCode,
				classDescription: classDescriptions[classCode] ?? 'Property class',
				neighborhood: current.nbhd || 'Unknown',
				currentYear: years.current,
				previousYear: years.previous,
				currentValue,
				previousValue,
				currentAssessedValue,
				previousAssessedValue,
				assessmentLevel,
				changeDollar,
				changePct,
				stage: latestStage(current),
				lat: coordinate.lat,
				lon: coordinate.lon,
				placementMethod: coordinate.method,
				locatedPin: coordinate.locatedPin,
			};
		})
		.sort((a, b) => a.pin.localeCompare(b.pin));

	const directOrParent = placement['direct-pin'] + placement['parent-pin'];
	const coverage = directOrParent / records.length;
	if (coverage < 0.75) {
		throw new Error(
			`Only ${(coverage * 100).toFixed(
				1,
			)}% of records resolved by direct or parent PIN.`,
		);
	}

	const geometry = await fetchParcelGeometry(records, boundary);
	const displayedCount = records.filter((record) => record.lat && record.lon).length;
	const manifest = {
		generatedAt: new Date().toISOString(),
		jurisdiction: 'River Forest, Illinois',
		currentYear: years.current,
		previousYear: years.previous,
		recordCount: records.length,
		displayedCount,
		placement,
		sources: {
			assessedValues: {
				label: 'Cook County Assessor - Assessed Values',
				url: 'https://datacatalog.cookcountyil.gov/d/uzyt-m557',
				rowCount: currentRows.length + previousRows.length,
			},
			parcelAddresses: {
				label: 'Cook County Assessor - Parcel Addresses',
				url: 'https://datacatalog.cookcountyil.gov/d/3723-97qp',
				rowCount: addressRows.length,
			},
			addressPoints: {
				label: 'Cook County Address Points',
				url: 'https://datacatalog.cookcountyil.gov/d/78yw-iddh',
				rowCount: pointRows.length,
			},
			parcelGeometry: {
				label: 'Cook County Parcel 2022 FeatureServer',
				url: 'https://gis.cookcountyil.gov/hosting/rest/services/Hosted/Parcel_2022/FeatureServer/0',
				rowCount: geometry.features.filter((feature) => feature.properties?.locatedPin)
					.length,
			},
			municipalBoundary: {
				label: 'Cook County Municipalities FeatureServer',
				url: 'https://services.arcgis.com/F7DSX1DSNSiWmOqh/arcgis/rest/services/Cook_County_Municipalities/FeatureServer/0',
				rowCount: boundary.features.length,
			},
		},
		knownGaps: [
			'Market values are estimated from Cook County assessed values by dividing by the assessment level for each property class.',
			`${records.length - displayedCount} of ${records.length} records do not have coordinates and are omitted from the marker layer.`,
			'Condominium units may share a parent parcel or address point where Cook County publishes one building geometry for many PINs.',
		],
	};

	await Promise.all([
		writeFile(
			path.join(OUT_DIR, 'records.json'),
			`${JSON.stringify({ manifest, records })}\n`,
		),
		writeFile(path.join(OUT_DIR, 'geometry.geojson'), `${JSON.stringify(geometry)}\n`),
		writeFile(
			path.join(OUT_DIR, 'manifest.json'),
			`${JSON.stringify(manifest, null, 2)}\n`,
		),
	]);

	console.log(
		`Wrote ${records.length} records, ${geometry.features.length} geometry features, ${displayedCount} mapped records.`,
	);
}

async function latestYears() {
	const rows = await fetchSocrata(ASSESSED, {
		$select: 'year,count(*)',
		$where: `township_code='${TOWNSHIP_CODE}'`,
		$group: 'year',
		$order: 'year DESC',
		$limit: '5',
	});
	const years = rows
		.map((row) => Number(row.year))
		.filter(Number.isFinite)
		.sort((a, b) => b - a);
	if (years.length < 2) {
		throw new Error('Could not determine current and previous assessment years.');
	}
	return { current: years[0], previous: years[1] };
}

async function fetchSocrata(url, params) {
	const target = new URL(url);
	for (const [key, value] of Object.entries(params)) {
		target.searchParams.set(key, value);
	}
	const response = await fetch(target);
	if (!response.ok) {
		throw new Error(`${url} returned HTTP ${response.status}`);
	}
	const payload = await response.json();
	if (!Array.isArray(payload)) {
		throw new Error(`${url} returned a non-array payload.`);
	}
	return payload;
}

async function fetchBoundary() {
	const params = new URLSearchParams({
		where: "NAME='River Forest'",
		outFields: 'NAME,NAMELSAD',
		outSR: '4326',
		f: 'geojson',
		returnGeometry: 'true',
	});
	const response = await fetch(`${MUNICIPAL_QUERY}?${params}`);
	if (!response.ok) {
		throw new Error(`Municipal boundary returned HTTP ${response.status}`);
	}
	const geojson = await response.json();
	if (!geojson.features?.length) {
		throw new Error('Municipal boundary query returned no features.');
	}
	geojson.features[0].properties = {
		...geojson.features[0].properties,
		boundary: true,
	};
	return geojson;
}

async function fetchParcelGeometry(records, boundary) {
	const byLocatedPin = new Map();
	for (const record of records) {
		if (!record.locatedPin) {
			continue;
		}
		const group = byLocatedPin.get(record.locatedPin) ?? [];
		group.push(record);
		byLocatedPin.set(record.locatedPin, group);
	}
	const parcelPins = [...byLocatedPin.keys()];
	const features = [];
	for (const chunk of chunked(parcelPins, 450)) {
		const params = new URLSearchParams({
			where: `name IN (${chunk.map((pin) => `'${pin}'`).join(',')})`,
			outFields: 'name',
			outSR: '4326',
			f: 'geojson',
			returnGeometry: 'true',
		});
		const response = await fetch(PARCEL_QUERY, {
			method: 'POST',
			headers: { 'content-type': 'application/x-www-form-urlencoded' },
			body: params,
		});
		if (!response.ok) {
			throw new Error(`Parcel geometry returned HTTP ${response.status}`);
		}
		const geojson = await response.json();
		for (const feature of geojson.features ?? []) {
			const locatedPin = feature.properties?.name;
			const group = byLocatedPin.get(locatedPin) ?? [];
			if (group.length === 0) {
				continue;
			}
			const changeValues = group
				.map((record) => record.changePct)
				.filter((value) => Number.isFinite(value));
			feature.properties = {
				locatedPin,
				recordIds: group.map((record) => record.id),
				recordCount: group.length,
				avgChangePct: weightedChange(group),
				minChangePct: changeValues.length ? Math.min(...changeValues) : null,
				maxChangePct: changeValues.length ? Math.max(...changeValues) : null,
				totalCurrentValue: group.reduce(
					(sum, record) => sum + (record.currentValue ?? 0),
					0,
				),
				totalPreviousValue: group.reduce(
					(sum, record) => sum + (record.previousValue ?? 0),
					0,
				),
				address: group[0].address,
			};
			features.push(feature);
		}
	}
	const boundaryFeatures = boundary.features.map((feature) => ({
		...feature,
		properties: {
			locatedPin: '',
			recordIds: [],
			recordCount: 0,
			avgChangePct: null,
			minChangePct: null,
			maxChangePct: null,
			totalCurrentValue: 0,
			totalPreviousValue: 0,
			address: feature.properties?.NAMELSAD ?? 'River Forest village boundary',
			boundary: true,
		},
	}));
	return {
		type: 'FeatureCollection',
		features: [...boundaryFeatures, ...features],
	};
}

function buildPointMap(rows) {
	const map = new Map();
	for (const row of rows) {
		if (!row.pin || !row.lat || !row.long || map.has(row.pin)) {
			continue;
		}
		map.set(row.pin, row);
	}
	return map;
}

function resolveCoordinate(pin, address, pointByPin, pointByAddress) {
	const direct = pointByPin.get(pin);
	if (direct) {
		return coordinate('direct-pin', pin, direct);
	}
	const parentPin = `${pin.slice(0, 10)}0000`;
	const parent = pointByPin.get(parentPin);
	if (parent) {
		return coordinate('parent-pin', parentPin, parent);
	}
	const addressPoint = address?.prop_address_full
		? pointByAddress.get(normalizeAddress(address.prop_address_full))
		: null;
	if (addressPoint) {
		return coordinate('address', addressPoint.pin ?? parentPin, addressPoint);
	}
	return {
		method: 'missing',
		locatedPin: null,
		lat: null,
		lon: null,
		row: null,
	};
}

function coordinate(method, locatedPin, row) {
	return {
		method,
		locatedPin,
		lat: Number(row.lat),
		lon: Number(row.long),
		row,
	};
}

function latestAssessedTotal(row) {
	for (const key of ['board_tot', 'certified_tot', 'mailed_tot']) {
		const value = Number(row[key]);
		if (Number.isFinite(value) && value > 0) {
			return value;
		}
	}
	return null;
}

function assessedToMarket(assessedValue, assessmentLevel) {
	if (!assessedValue || !assessmentLevel) {
		return null;
	}
	return Math.round(assessedValue / assessmentLevel);
}

function assessmentLevelForClass(classCode) {
	const normalized = String(classCode ?? '')
		.trim()
		.toUpperCase();
	if (!normalized || normalized === 'EX' || normalized === 'RR') {
		return null;
	}
	if (normalized.startsWith('1')) {
		return 0.1;
	}
	if (normalized.startsWith('2')) {
		return 0.1;
	}
	if (normalized.startsWith('3')) {
		return 0.1;
	}
	if (normalized.startsWith('4')) {
		return 0.2;
	}
	if (normalized.startsWith('5')) {
		return 0.25;
	}
	if (
		normalized.startsWith('6') ||
		normalized.startsWith('7') ||
		normalized.startsWith('8')
	) {
		return 0.1;
	}
	if (normalized.startsWith('9')) {
		return 0.1;
	}
	return null;
}

function latestStage(row) {
	if (Number(row.board_tot) > 0) {
		return 'board';
	}
	if (Number(row.certified_tot) > 0) {
		return 'certified';
	}
	if (Number(row.mailed_tot) > 0) {
		return 'mailed';
	}
	return 'missing';
}

function formatAddress(address, point) {
	if (address?.prop_address_full) {
		return address.prop_address_full;
	}
	if (point?.cmpaddabrv) {
		return point.cmpaddabrv;
	}
	return 'Address unavailable';
}

function normalizeAddress(value) {
	return value
		.toUpperCase()
		.replace(/[.,]/g, '')
		.replace(/\b(STREET|ST)\b/g, 'ST')
		.replace(/\b(AVENUE|AVE)\b/g, 'AVE')
		.replace(/\b(BOULEVARD|BLVD)\b/g, 'BLVD')
		.replace(/\b(ROAD|RD)\b/g, 'RD')
		.replace(/\s+/g, ' ')
		.trim();
}

function weightedChange(records) {
	const current = records.reduce((sum, record) => sum + (record.currentValue ?? 0), 0);
	const previous = records.reduce(
		(sum, record) => sum + (record.previousValue ?? 0),
		0,
	);
	return previous > 0 ? (current - previous) / previous : null;
}

function chunked(values, size) {
	const chunks = [];
	for (let index = 0; index < values.length; index += size) {
		chunks.push(values.slice(index, index + size));
	}
	return chunks;
}

function assertRows(label, rows, minimum) {
	if (!Array.isArray(rows) || rows.length < minimum) {
		throw new Error(
			`${label} returned ${rows?.length ?? 0}; expected at least ${minimum}.`,
		);
	}
}
