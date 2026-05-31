export type LegendBinId = 'lt0' | '0to10' | '10to25' | '25to50' | 'gte50' | 'unknown';

export type GroupBy = 'neighborhood' | 'class';

export type PlacementMethod = 'direct-pin' | 'parent-pin' | 'address' | 'missing';

export type PropertyRecord = {
	id: string;
	pin: string;
	pin10: string;
	address: string;
	city: string;
	classCode: string;
	classDescription: string;
	neighborhood: string;
	currentYear: number;
	previousYear: number;
	currentValue: number | null;
	previousValue: number | null;
	currentAssessedValue: number | null;
	previousAssessedValue: number | null;
	assessmentLevel: number | null;
	changeDollar: number | null;
	changePct: number | null;
	stage: 'board' | 'certified' | 'mailed' | 'missing';
	lat: number | null;
	lon: number | null;
	placementMethod: PlacementMethod;
	locatedPin: string | null;
};

export type DataManifest = {
	generatedAt: string;
	jurisdiction: string;
	currentYear: number;
	previousYear: number;
	recordCount: number;
	displayedCount: number;
	placement: Record<PlacementMethod, number>;
	sources: Record<
		string,
		{
			label: string;
			url: string;
			rowCount: number;
			lastModified?: string;
		}
	>;
	knownGaps: string[];
};

export type RecordsPayload = {
	manifest: DataManifest;
	records: PropertyRecord[];
};

export type GeometryProperties = {
	locatedPin: string;
	recordIds: string[];
	recordCount: number;
	avgChangePct: number | null;
	minChangePct: number | null;
	maxChangePct: number | null;
	totalCurrentValue: number;
	totalPreviousValue: number;
	address: string;
};

export type GeometryPayload = GeoJSON.FeatureCollection<
	GeoJSON.Geometry,
	GeometryProperties
>;
