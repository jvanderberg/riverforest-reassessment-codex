import type { PathOptions } from 'leaflet';
import {
	ChevronRight,
	CircleHelp,
	Copy,
	Filter,
	LocateFixed,
	Moon,
	PanelLeftClose,
	RotateCcw,
	Search,
	Sun,
	X,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
	CircleMarker,
	GeoJSON,
	MapContainer,
	Pane,
	Popup,
	TileLayer,
	Tooltip,
	useMap,
} from 'react-leaflet';
import { Button } from './components/Button';
import {
	average,
	binColor,
	classifyChange,
	formatCurrency,
	formatNumber,
	formatPercent,
	legendBins,
	median,
	weightedChangePct,
} from './lib/math';
import type {
	DataManifest,
	GeometryPayload,
	GroupBy,
	LegendBinId,
	PropertyRecord,
	RecordsPayload,
} from './lib/types';
import { cn } from './lib/utils';
import { useAppStore } from './store';

type AppData = {
	records: PropertyRecord[];
	geometry: GeometryPayload | null;
	manifest: DataManifest;
};

type LoadState =
	| { status: 'loading' }
	| { status: 'error'; message: string }
	| { status: 'ready'; data: AppData };

const defaultCenter: [number, number] = [41.8956, -87.8168];

export default function App() {
	const [loadState, setLoadState] = useState<LoadState>({ status: 'loading' });
	const theme = useAppStore((state) => state.theme);
	const [systemDark, setSystemDark] = useState(false);

	useEffect(() => {
		const query = window.matchMedia('(prefers-color-scheme: dark)');
		const sync = () => setSystemDark(query.matches);
		sync();
		query.addEventListener('change', sync);
		return () => query.removeEventListener('change', sync);
	}, []);

	const isDarkMode = theme === 'dark' || (theme === 'system' && systemDark);

	useEffect(() => {
		document.documentElement.classList.toggle('dark', isDarkMode);
		document.documentElement.style.colorScheme = isDarkMode ? 'dark' : 'light';
	}, [isDarkMode]);

	useEffect(() => {
		let cancelled = false;
		async function load() {
			try {
				const [recordsResponse, geometryResponse] = await Promise.all([
					fetch(`${import.meta.env.BASE_URL}data/records.json`),
					fetch(`${import.meta.env.BASE_URL}data/geometry.geojson`),
				]);
				if (!recordsResponse.ok) {
					throw new Error(`records.json returned HTTP ${recordsResponse.status}`);
				}
				if (!geometryResponse.ok) {
					throw new Error(`geometry.geojson returned HTTP ${geometryResponse.status}`);
				}
				const recordsPayload = (await recordsResponse.json()) as RecordsPayload;
				const geometry = (await geometryResponse.json()) as GeometryPayload;
				if (!cancelled) {
					setLoadState({
						status: 'ready',
						data: {
							records: recordsPayload.records,
							manifest: recordsPayload.manifest,
							geometry,
						},
					});
				}
			} catch (error) {
				if (!cancelled) {
					setLoadState({
						status: 'error',
						message:
							error instanceof Error
								? error.message
								: 'The data files could not be loaded.',
					});
				}
			}
		}
		load();
		return () => {
			cancelled = true;
		};
	}, []);

	if (loadState.status === 'error') {
		return <AppShell isDarkMode={isDarkMode} loadError={loadState.message} />;
	}

	if (loadState.status === 'loading') {
		return <AppShell isDarkMode={isDarkMode} />;
	}

	return <AppShell data={loadState.data} isDarkMode={isDarkMode} />;
}

function AppShell({
	data,
	isDarkMode,
	loadError,
}: {
	data?: AppData;
	isDarkMode: boolean;
	loadError?: string;
}) {
	const filtersOpen = useAppStore((state) => state.filtersOpen);
	const setFiltersOpen = useAppStore((state) => state.setFiltersOpen);
	const filtered = useFilteredRecords(data?.records ?? []);
	const highlightedId = useAppStore((state) => state.highlightedId);
	const highlighted =
		data?.records.find((record) => record.id === highlightedId) ?? null;

	return (
		<div className="relative flex h-dvh overflow-hidden bg-background text-foreground">
			<a
				href="#map"
				className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-[1000] focus:rounded-md focus:bg-background focus:px-3 focus:py-2 focus:ring-2 focus:ring-ring"
			>
				Skip to map
			</a>
			<aside
				className={cn(
					'fixed inset-y-0 left-0 z-[900] w-[min(92vw,390px)] border-r border-border bg-background shadow-xl transition-transform md:static md:z-auto md:w-[390px] md:translate-x-0 md:shadow-none',
					filtersOpen ? 'translate-x-0' : '-translate-x-full',
				)}
			>
				<Sidebar data={data} filtered={filtered} loadError={loadError} />
			</aside>
			{!filtersOpen && (
				<Button
					type="button"
					variant="default"
					className="fixed left-0 top-24 z-[850] h-10 rounded-l-none md:hidden"
					onClick={() => setFiltersOpen(true)}
					aria-label="Open filters"
				>
					<Filter className="size-4" />
					Filters
				</Button>
			)}
			<main className="relative min-w-0 flex-1">
				<div id="map" className="h-full">
					<MapView
						records={filtered.mapRecords}
						allFilteredRecords={filtered.records}
						geometry={data?.geometry ?? null}
						highlighted={highlighted}
						isDarkMode={isDarkMode}
						loading={!data && !loadError}
					/>
				</div>
				{data && (
					<MobileKpis
						records={filtered.records}
						currentYear={data.manifest.currentYear}
						previousYear={data.manifest.previousYear}
					/>
				)}
			</main>
		</div>
	);
}

function Sidebar({
	data,
	filtered,
	loadError,
}: {
	data?: AppData;
	filtered: ReturnType<typeof useFilteredRecords>;
	loadError?: string;
}) {
	const setFiltersOpen = useAppStore((state) => state.setFiltersOpen);
	const resetFilters = useAppStore((state) => state.resetFilters);
	const groupBy = useAppStore((state) => state.groupBy);
	const setGroupBy = useAppStore((state) => state.setGroupBy);
	const theme = useAppStore((state) => state.theme);
	const setTheme = useAppStore((state) => state.setTheme);
	const [infoOpen, setInfoOpen] = useState(false);

	return (
		<div className="flex h-full flex-col">
			<header className="border-b border-border px-4 py-3">
				<div className="flex items-start justify-between gap-3">
					<div>
						<h1 className="text-base font-semibold leading-tight">
							River Forest Reassessment Explorer
						</h1>
						<p className="mt-1 text-xs text-muted-foreground">
							{data
								? `Estimated market value change, ${data.manifest.currentYear} vs. ${data.manifest.previousYear}. Data as of ${new Date(
										data.manifest.generatedAt,
									).toLocaleDateString()}`
								: 'Loading public assessment records'}
						</p>
					</div>
					<div className="flex gap-1">
						<Button
							variant="ghost"
							size="icon"
							type="button"
							aria-label="Change theme"
							title="Change theme"
							onClick={() =>
								setTheme(
									theme === 'system' ? 'dark' : theme === 'dark' ? 'light' : 'system',
								)
							}
						>
							{theme === 'light' ? (
								<Sun className="size-4" />
							) : (
								<Moon className="size-4" />
							)}
						</Button>
						<Button
							variant="ghost"
							size="icon"
							type="button"
							aria-label="Open data sources"
							onClick={() => setInfoOpen((open) => !open)}
							aria-expanded={infoOpen}
						>
							<CircleHelp className="size-4" />
						</Button>
						<Button
							variant="ghost"
							size="icon"
							type="button"
							className="md:hidden"
							aria-label="Close filters"
							onClick={() => setFiltersOpen(false)}
						>
							<PanelLeftClose className="size-4" />
						</Button>
					</div>
				</div>
				{infoOpen && data && <InfoPanel manifest={data.manifest} />}
			</header>
			<div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
				{loadError ? (
					<ErrorPanel message={loadError} />
				) : data ? (
					<>
						<Kpis
							records={filtered.records}
							currentYear={data.manifest.currentYear}
							previousYear={data.manifest.previousYear}
						/>
						<SearchBox records={data.records} />
						<Legend />
						<FilterSection
							title="Class"
							options={filtered.classOptions}
							selected={filtered.selectedClasses}
							onChange={filtered.setClasses}
						/>
						<FilterSection
							title="Neighborhood"
							options={filtered.neighborhoodOptions}
							selected={filtered.selectedNeighborhoods}
							onChange={filtered.setNeighborhoods}
						/>
						<div className="mt-4 flex items-center justify-between gap-2">
							<div className="text-sm font-medium">Summary</div>
							<div className="flex rounded-md border border-border p-0.5">
								<ToggleButton
									active={groupBy === 'neighborhood'}
									onClick={() => setGroupBy('neighborhood')}
								>
									Neighborhood
								</ToggleButton>
								<ToggleButton
									active={groupBy === 'class'}
									onClick={() => setGroupBy('class')}
								>
									Class
								</ToggleButton>
							</div>
						</div>
						<SummaryTable records={filtered.records} groupBy={groupBy} />
						{filtered.records.length === 0 && (
							<div className="mt-4 rounded-md border border-border bg-muted p-3 text-sm">
								No records match the active filters.
								<Button
									type="button"
									variant="secondary"
									className="mt-3 w-full"
									onClick={resetFilters}
								>
									<RotateCcw className="size-4" />
									Reset filters
								</Button>
							</div>
						)}
					</>
				) : (
					<LoadingSidebar />
				)}
			</div>
			<footer className="border-t border-border px-4 py-3">
				<Button
					variant="outline"
					className="w-full"
					type="button"
					onClick={() => navigator.clipboard.writeText(window.location.href)}
				>
					<Copy className="size-4" />
					Share this view
				</Button>
			</footer>
		</div>
	);
}

function useFilteredRecords(records: PropertyRecord[]) {
	const selectedClasses = useAppStore((state) => state.selectedClasses);
	const selectedNeighborhoods = useAppStore((state) => state.selectedNeighborhoods);
	const selectedBins = useAppStore((state) => state.selectedBins);
	const setClasses = useAppStore((state) => state.setClasses);
	const setNeighborhoods = useAppStore((state) => state.setNeighborhoods);

	return useMemo(() => {
		const classOptions = optionCounts(records, (record) => record.classCode);
		const neighborhoodOptions = optionCounts(records, (record) => record.neighborhood);
		const recordsByFilter = records.filter((record) => {
			const classOk =
				selectedClasses.length === 0 || selectedClasses.includes(record.classCode);
			const neighborhoodOk =
				selectedNeighborhoods.length === 0 ||
				selectedNeighborhoods.includes(record.neighborhood);
			return classOk && neighborhoodOk;
		});
		const mapRecords =
			selectedBins.length === 0
				? recordsByFilter
				: recordsByFilter.filter((record) =>
						selectedBins.includes(classifyChange(record.changePct)),
					);
		return {
			records: recordsByFilter,
			mapRecords,
			classOptions,
			neighborhoodOptions,
			selectedClasses,
			selectedNeighborhoods,
			setClasses,
			setNeighborhoods,
		};
	}, [
		records,
		selectedClasses,
		selectedNeighborhoods,
		selectedBins,
		setClasses,
		setNeighborhoods,
	]);
}

function optionCounts<T extends string>(
	records: PropertyRecord[],
	getValue: (record: PropertyRecord) => T,
) {
	const counts = new Map<T, number>();
	for (const record of records) {
		const value = getValue(record);
		counts.set(value, (counts.get(value) ?? 0) + 1);
	}
	return [...counts.entries()]
		.map(([value, count]) => ({ value, count }))
		.sort((a, b) => a.value.localeCompare(b.value));
}

function Kpis({
	records,
	currentYear,
	previousYear,
}: {
	records: PropertyRecord[];
	currentYear: number;
	previousYear: number;
}) {
	const avg = average(records.map((record) => record.changePct));
	const med = median(records.map((record) => record.changePct));
	const weighted = weightedChangePct(records);
	return (
		<section className="grid grid-cols-2 gap-2">
			<KpiCard label="Average market change" value={formatPercent(avg)} />
			<KpiCard label="Median market change" value={formatPercent(med)} />
			<KpiCard
				label={`${previousYear}-${currentYear} base-weighted`}
				value={formatPercent(weighted)}
				compact
			/>
			<KpiCard label="Filtered parcels" value={formatNumber(records.length)} compact />
		</section>
	);
}

function MobileKpis({
	records,
	currentYear,
	previousYear,
}: {
	records: PropertyRecord[];
	currentYear: number;
	previousYear: number;
}) {
	return (
		<div className="pointer-events-none absolute left-3 right-3 top-3 z-[500] grid grid-cols-2 gap-2 md:hidden">
			<Kpis records={records} currentYear={currentYear} previousYear={previousYear} />
		</div>
	);
}

function KpiCard({
	label,
	value,
	compact,
}: {
	label: string;
	value: string;
	compact?: boolean;
}) {
	return (
		<div className="rounded-md border border-border bg-background/95 p-3 shadow-sm">
			<div className="text-xs text-muted-foreground">{label}</div>
			<div className={cn('mt-1 font-semibold', compact ? 'text-sm' : 'text-base')}>
				{value}
			</div>
		</div>
	);
}

function SearchBox({ records }: { records: PropertyRecord[] }) {
	const search = useAppStore((state) => state.search);
	const setSearch = useAppStore((state) => state.setSearch);
	const setHighlightedId = useAppStore((state) => state.setHighlightedId);
	const matches = useMemo(() => {
		const query = search.trim().toUpperCase();
		if (query.length < 2) {
			return [];
		}
		return records
			.filter(
				(record) =>
					record.pin.includes(query) || record.address.toUpperCase().includes(query),
			)
			.slice(0, 8);
	}, [records, search]);

	return (
		<section className="mt-4">
			<label className="text-sm font-medium" htmlFor="search">
				Find a property
			</label>
			<div className="relative mt-2">
				<Search className="pointer-events-none absolute left-2 top-2 size-4 text-muted-foreground" />
				<input
					id="search"
					className="h-8 w-full rounded-md border border-border bg-background pl-8 pr-8 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
					value={search}
					onChange={(event) => setSearch(event.target.value)}
					placeholder="PIN or address"
				/>
				{search && (
					<Button
						type="button"
						variant="ghost"
						size="icon"
						className="absolute right-0 top-0"
						aria-label="Clear search"
						onClick={() => setSearch('')}
					>
						<X className="size-4" />
					</Button>
				)}
			</div>
			{matches.length > 0 && (
				<div className="mt-2 overflow-hidden rounded-md border border-border">
					{matches.map((record) => (
						<button
							type="button"
							key={record.id}
							className="flex w-full flex-col border-b border-border px-2 py-1.5 text-left text-xs last:border-b-0 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
							onClick={() => {
								setHighlightedId(record.id);
								setSearch(record.address);
							}}
						>
							<span className="font-medium">{record.address}</span>
							<span className="text-muted-foreground">{record.pin}</span>
						</button>
					))}
				</div>
			)}
		</section>
	);
}

function Legend() {
	const selectedBins = useAppStore((state) => state.selectedBins);
	const setBins = useAppStore((state) => state.setBins);
	const active = new Set(selectedBins);
	return (
		<section className="mt-4">
			<div className="mb-2 flex items-center justify-between">
				<div className="text-sm font-medium">Map legend</div>
				{selectedBins.length > 0 && (
					<Button type="button" variant="ghost" size="sm" onClick={() => setBins([])}>
						All
					</Button>
				)}
			</div>
			<div className="grid grid-cols-2 gap-1.5">
				{legendBins.map((bin) => {
					const pressed = active.has(bin.id);
					return (
						<button
							type="button"
							key={bin.id}
							aria-pressed={pressed}
							className={cn(
								'flex h-8 items-center gap-2 rounded-md border border-border px-2 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring',
								pressed ? 'bg-muted' : 'bg-background',
							)}
							onClick={() =>
								setBins(
									pressed
										? selectedBins.filter((id) => id !== bin.id)
										: [...selectedBins, bin.id],
								)
							}
							title={bin.range}
						>
							<span
								className="size-3 rounded-sm border border-border"
								style={{ backgroundColor: bin.color }}
							/>
							<span>{bin.label}</span>
						</button>
					);
				})}
			</div>
		</section>
	);
}

function FilterSection({
	title,
	options,
	selected,
	onChange,
}: {
	title: string;
	options: Array<{ value: string; count: number }>;
	selected: string[];
	onChange: (values: string[]) => void;
}) {
	const [open, setOpen] = useState(true);
	const selectedSet = new Set(selected);
	return (
		<section className="mt-4 rounded-md border border-border">
			<div className="flex h-9 items-center justify-between border-b border-border px-2">
				<button
					type="button"
					className="flex min-w-0 items-center gap-1 text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring"
					aria-expanded={open}
					onClick={() => setOpen((value) => !value)}
				>
					<ChevronRight
						className={cn('size-4 transition-transform', open && 'rotate-90')}
					/>
					<span>{title}</span>
					<span className="text-xs text-muted-foreground">
						{selected.length || options.length} / {options.length}
					</span>
				</button>
				<div className="flex gap-1">
					<Button
						type="button"
						variant="ghost"
						size="sm"
						onClick={() => onChange(options.map((option) => option.value))}
					>
						All
					</Button>
					<Button type="button" variant="ghost" size="sm" onClick={() => onChange([])}>
						None
					</Button>
				</div>
			</div>
			{open && (
				<div className="max-h-44 overflow-y-auto p-1">
					{options.map((option) => (
						<label
							key={option.value}
							className="flex min-h-8 items-center gap-2 rounded-sm px-2 text-xs hover:bg-muted"
							title={option.value}
						>
							<input
								type="checkbox"
								className="size-4 accent-primary"
								checked={selectedSet.has(option.value)}
								onChange={(event) => {
									if (event.target.checked) {
										onChange([...selected, option.value]);
										return;
									}
									onChange(selected.filter((value) => value !== option.value));
								}}
							/>
							<span className="min-w-0 flex-1 truncate">{option.value}</span>
							<span className="text-muted-foreground">{option.count}</span>
						</label>
					))}
				</div>
			)}
		</section>
	);
}

function ToggleButton({
	active,
	onClick,
	children,
}: {
	active: boolean;
	onClick: () => void;
	children: React.ReactNode;
}) {
	return (
		<button
			type="button"
			aria-pressed={active}
			className={cn(
				'h-7 rounded-sm px-2 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring',
				active ? 'bg-primary text-primary-foreground' : 'hover:bg-muted',
			)}
			onClick={onClick}
		>
			{children}
		</button>
	);
}

function SummaryTable({
	records,
	groupBy,
}: {
	records: PropertyRecord[];
	groupBy: GroupBy;
}) {
	const rows = useMemo(() => {
		const groups = new Map<string, PropertyRecord[]>();
		for (const record of records) {
			const key =
				groupBy === 'class'
					? `${record.classCode} ${record.classDescription}`
					: record.neighborhood;
			const current = groups.get(key) ?? [];
			current.push(record);
			groups.set(key, current);
		}
		return [...groups.entries()]
			.map(([label, groupRecords]) => ({
				label,
				count: groupRecords.length,
				median: median(groupRecords.map((record) => record.changePct)),
				weighted: weightedChangePct(groupRecords),
			}))
			.sort((a, b) => b.count - a.count);
	}, [records, groupBy]);

	return (
		<div className="mt-2 max-h-80 overflow-auto rounded-md border border-border">
			<table className="w-full border-collapse text-xs">
				<thead className="sticky top-0 bg-muted">
					<tr>
						<th className="border-b border-border px-2 py-2 text-left font-medium">
							{groupBy === 'class' ? 'Class' : 'Neighborhood'}
						</th>
						<th className="border-b border-border px-2 py-2 text-right font-medium">
							Count
						</th>
						<th className="border-b border-border px-2 py-2 text-right font-medium">
							Median
						</th>
					</tr>
				</thead>
				<tbody>
					{rows.map((row) => (
						<tr key={row.label} className="border-b border-border last:border-b-0">
							<td className="max-w-40 truncate px-2 py-2" title={row.label}>
								{row.label}
								<div className="text-muted-foreground">
									Weighted {formatPercent(row.weighted)}
								</div>
							</td>
							<td className="px-2 py-2 text-right">{formatNumber(row.count)}</td>
							<td className="px-2 py-2 text-right">{formatPercent(row.median)}</td>
						</tr>
					))}
				</tbody>
			</table>
		</div>
	);
}

function MapView({
	records,
	allFilteredRecords,
	geometry,
	highlighted,
	isDarkMode,
	loading,
}: {
	records: PropertyRecord[];
	allFilteredRecords: PropertyRecord[];
	geometry: GeometryPayload | null;
	highlighted: PropertyRecord | null;
	isDarkMode: boolean;
	loading: boolean;
}) {
	const [expandedKey, setExpandedKey] = useState<string | null>(null);
	const clusterRecords = useMemo(() => clusterByCoordinate(records), [records]);
	const tileUrl = isDarkMode
		? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
		: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png';

	return (
		<MapContainer
			center={defaultCenter}
			zoom={14}
			minZoom={12}
			scrollWheelZoom
			keyboard
			className="h-full w-full"
		>
			<TileLayer
				attribution="&copy; OpenStreetMap contributors &copy; CARTO"
				url={tileUrl}
			/>
			<Pane name="boundary" style={{ zIndex: 350 }} />
			<Pane name="parcels" style={{ zIndex: 410 }} />
			<Pane name="markers" style={{ zIndex: 430 }} />
			<Pane name="highlight" style={{ zIndex: 470 }} />
			{geometry && (
				<GeoJSON
					key={`${geometry.features.length}-${isDarkMode}`}
					data={geometry}
					pane="parcels"
					style={(feature) => parcelStyle(feature, isDarkMode)}
				/>
			)}
			{clusterRecords.map((cluster) => {
				if (expandedKey === cluster.key && cluster.records.length > 1) {
					return cluster.records.map((record, index) => (
						<RecordMarker
							key={record.id}
							record={record}
							position={offsetPosition(cluster.lat, cluster.lon, index)}
							isChild
						/>
					));
				}
				const aggregate = weightedChangePct(cluster.records);
				return (
					<CircleMarker
						key={cluster.key}
						center={[cluster.lat, cluster.lon]}
						radius={cluster.records.length > 1 ? 8 : 5}
						pathOptions={{
							color: binColor(classifyChange(aggregate)),
							fillColor: binColor(classifyChange(aggregate)),
							fillOpacity: 0.78,
							weight: 1.5,
						}}
						pane="markers"
						eventHandlers={{
							click: () => {
								if (cluster.records.length > 1) {
									setExpandedKey(expandedKey === cluster.key ? null : cluster.key);
								}
							},
						}}
					>
						<Tooltip>
							{cluster.records.length > 1
								? `${cluster.records.length} units, ${formatPercent(
										cluster.min,
									)} to ${formatPercent(cluster.max)}. Click to expand.`
								: `${cluster.records[0].address}: ${formatPercent(
										cluster.records[0].changePct,
									)}`}
						</Tooltip>
						{cluster.records.length === 1 && (
							<RecordPopup record={cluster.records[0]} />
						)}
					</CircleMarker>
				);
			})}
			{highlighted?.lat && highlighted.lon && <HighlightMarker record={highlighted} />}
			<MapController
				records={allFilteredRecords}
				highlighted={highlighted}
				loading={loading}
			/>
		</MapContainer>
	);
}

function parcelStyle(
	feature:
		| GeoJSON.Feature<
				GeoJSON.Geometry,
				{ avgChangePct?: number | null; boundary?: boolean }
		  >
		| undefined,
	isDarkMode: boolean,
): PathOptions {
	if (feature?.properties?.boundary) {
		return {
			color: isDarkMode ? '#d5dde7' : '#425466',
			weight: 2,
			opacity: 0.85,
			fillOpacity: 0,
		};
	}
	const color = binColor(classifyChange(feature?.properties?.avgChangePct));
	return {
		color: isDarkMode ? '#d5dde7' : '#425466',
		weight: 0.6,
		opacity: isDarkMode ? 0.35 : 0.3,
		fillColor: color,
		fillOpacity: isDarkMode ? 0.22 : 0.28,
	};
}

function RecordMarker({
	record,
	position,
	isChild,
}: {
	record: PropertyRecord;
	position?: [number, number];
	isChild?: boolean;
}) {
	if (!record.lat || !record.lon) {
		return null;
	}
	return (
		<CircleMarker
			center={position ?? [record.lat, record.lon]}
			radius={isChild ? 4 : 5}
			pathOptions={{
				color: binColor(classifyChange(record.changePct)),
				fillColor: binColor(classifyChange(record.changePct)),
				fillOpacity: 0.85,
				weight: 1.25,
			}}
			pane="markers"
		>
			<Tooltip>
				{record.address}: {formatPercent(record.changePct)}
			</Tooltip>
			<RecordPopup record={record} />
		</CircleMarker>
	);
}

function HighlightMarker({ record }: { record: PropertyRecord }) {
	return (
		<>
			<CircleMarker
				center={[record.lat!, record.lon!]}
				radius={16}
				pathOptions={{
					color: 'var(--ring)',
					fillOpacity: 0,
					weight: 3,
				}}
				pane="highlight"
			/>
			<CircleMarker
				center={[record.lat!, record.lon!]}
				radius={4}
				pathOptions={{
					color: 'var(--ring)',
					fillColor: 'var(--ring)',
					fillOpacity: 1,
					weight: 1,
				}}
				pane="highlight"
			>
				<RecordPopup record={record} />
			</CircleMarker>
		</>
	);
}

function RecordPopup({ record }: { record: PropertyRecord }) {
	const setHighlightedId = useAppStore((state) => state.setHighlightedId);
	return (
		<Popup>
			<div className="w-64 p-3 text-xs">
				<div className="text-sm font-semibold">{record.address}</div>
				<div className="mt-0.5 text-muted-foreground">{record.pin}</div>
				<div className="mt-3 grid grid-cols-2 gap-2">
					<PopupMetric
						label="Current market"
						value={formatCurrency(record.currentValue)}
					/>
					<PopupMetric
						label="Previous market"
						value={formatCurrency(record.previousValue)}
					/>
					<PopupMetric label="Change" value={formatCurrency(record.changeDollar)} />
					<PopupMetric label="Percent" value={formatPercent(record.changePct)} />
				</div>
				<div className="mt-3 text-muted-foreground" title={record.classDescription}>
					{record.classCode} {record.classDescription}
				</div>
				<div className="mt-1 text-muted-foreground">
					Assessment level {formatPercent(record.assessmentLevel)}
				</div>
				<div className="mt-3 flex gap-2">
					<Button
						type="button"
						variant="secondary"
						size="sm"
						onClick={() => setHighlightedId(record.id)}
					>
						<LocateFixed className="size-3.5" />
						Select
					</Button>
					<Button
						type="button"
						variant="outline"
						size="sm"
						onClick={() => {
							const url = new URL(window.location.href);
							url.search = '';
							url.searchParams.set('pin', record.id);
							navigator.clipboard.writeText(url.toString());
						}}
					>
						<Copy className="size-3.5" />
						Record
					</Button>
				</div>
			</div>
		</Popup>
	);
}

function PopupMetric({ label, value }: { label: string; value: string }) {
	return (
		<div>
			<div className="text-muted-foreground">{label}</div>
			<div className="font-medium">{value}</div>
		</div>
	);
}

function MapController({
	records,
	highlighted,
	loading,
}: {
	records: PropertyRecord[];
	highlighted: PropertyRecord | null;
	loading: boolean;
}) {
	const map = useMap();
	const didFit = useRef(false);
	useEffect(() => {
		if (highlighted?.lat && highlighted.lon) {
			map.setView([highlighted.lat, highlighted.lon], Math.max(map.getZoom(), 17), {
				animate: !window.matchMedia('(prefers-reduced-motion: reduce)').matches,
			});
			return;
		}
		if (!didFit.current && records.length > 0) {
			const points = records
				.filter((record) => record.lat && record.lon)
				.map((record) => [record.lat!, record.lon!] as [number, number]);
			if (points.length > 1) {
				map.fitBounds(points, { padding: [32, 32], maxZoom: 15 });
				didFit.current = true;
			}
		}
	}, [highlighted, map, records]);

	if (!loading) {
		return null;
	}
	return (
		<div className="leaflet-bottom leaflet-left">
			<div className="leaflet-control rounded-md border border-border bg-background/95 p-3 text-sm shadow-sm">
				Loading map data
			</div>
		</div>
	);
}

function clusterByCoordinate(records: PropertyRecord[]) {
	const clusters = new Map<
		string,
		{
			key: string;
			lat: number;
			lon: number;
			records: PropertyRecord[];
			min: number | null;
			max: number | null;
		}
	>();
	for (const record of records) {
		if (!record.lat || !record.lon) {
			continue;
		}
		const key = `${record.lat.toFixed(6)},${record.lon.toFixed(6)}`;
		const cluster = clusters.get(key) ?? {
			key,
			lat: record.lat,
			lon: record.lon,
			records: [],
			min: null,
			max: null,
		};
		cluster.records.push(record);
		if (Number.isFinite(record.changePct)) {
			cluster.min =
				cluster.min === null
					? record.changePct
					: Math.min(cluster.min, record.changePct!);
			cluster.max =
				cluster.max === null
					? record.changePct
					: Math.max(cluster.max, record.changePct!);
		}
		clusters.set(key, cluster);
	}
	return [...clusters.values()];
}

function offsetPosition(lat: number, lon: number, index: number): [number, number] {
	const angle = index * 2.399963229728653;
	const distance = 0.000045 * Math.sqrt(index + 1);
	return [lat + Math.sin(angle) * distance, lon + Math.cos(angle) * distance];
}

function InfoPanel({ manifest }: { manifest: DataManifest }) {
	return (
		<div className="mt-3 rounded-md border border-border bg-popover p-3 text-xs shadow-sm">
			<div className="font-medium">
				Data as of {new Date(manifest.generatedAt).toLocaleDateString()}
			</div>
			<div className="mt-2 space-y-2">
				{Object.entries(manifest.sources).map(([key, source]) => (
					<div key={key}>
						<a
							href={source.url}
							target="_blank"
							rel="noreferrer"
							className="font-medium text-primary underline-offset-2 hover:underline"
						>
							{source.label}
						</a>
						<div className="text-muted-foreground">
							{formatNumber(source.rowCount)} rows used
						</div>
					</div>
				))}
			</div>
			{manifest.knownGaps.length > 0 && (
				<div className="mt-3 border-t border-border pt-2 text-muted-foreground">
					{manifest.knownGaps.join(' ')}
				</div>
			)}
			<div className="mt-2 text-muted-foreground">
				Cook County open data and GIS attribution applies.
			</div>
		</div>
	);
}

function ErrorPanel({ message }: { message: string }) {
	return (
		<div className="rounded-md border border-destructive bg-background p-3 text-sm">
			<div className="font-medium">Data failed to load</div>
			<div className="mt-1 text-xs text-muted-foreground">{message}</div>
			<Button
				type="button"
				variant="secondary"
				className="mt-3 w-full"
				onClick={() => window.location.reload()}
			>
				Retry
			</Button>
		</div>
	);
}

function LoadingSidebar() {
	return (
		<div className="space-y-3">
			<div className="grid grid-cols-2 gap-2">
				{['kpi-a', 'kpi-b', 'kpi-c', 'kpi-d'].map((key) => (
					<div
						key={key}
						className="h-20 animate-pulse rounded-md border border-border bg-muted"
					/>
				))}
			</div>
			<div className="h-8 animate-pulse rounded-md bg-muted" />
			<div className="h-32 animate-pulse rounded-md bg-muted" />
			<div className="h-44 animate-pulse rounded-md bg-muted" />
		</div>
	);
}
