import { create } from 'zustand';
import type { GroupBy, LegendBinId } from './lib/types';
import { readUrlState, writeUrlState } from './lib/urlState';

const initial = typeof window === 'undefined' ? null : readUrlState();

type AppState = {
	selectedClasses: string[];
	selectedNeighborhoods: string[];
	selectedBins: LegendBinId[];
	groupBy: GroupBy;
	highlightedId: string | null;
	search: string;
	filtersOpen: boolean;
	theme: 'system' | 'light' | 'dark';
	setClasses: (values: string[]) => void;
	setNeighborhoods: (values: string[]) => void;
	setBins: (values: LegendBinId[]) => void;
	setGroupBy: (value: GroupBy) => void;
	setHighlightedId: (value: string | null) => void;
	setSearch: (value: string) => void;
	setFiltersOpen: (value: boolean) => void;
	setTheme: (value: 'system' | 'light' | 'dark') => void;
	resetFilters: () => void;
};

export const useAppStore = create<AppState>((set, get) => ({
	selectedClasses: initial?.classes ?? [],
	selectedNeighborhoods: initial?.neighborhoods ?? [],
	selectedBins: initial?.bins ?? [],
	groupBy: initial?.groupBy ?? 'neighborhood',
	highlightedId: initial?.pin ?? null,
	search: '',
	filtersOpen: false,
	theme: initial?.theme ?? 'system',
	setClasses: (selectedClasses) => {
		set({ selectedClasses });
		commitUrl(get());
	},
	setNeighborhoods: (selectedNeighborhoods) => {
		set({ selectedNeighborhoods });
		commitUrl(get());
	},
	setBins: (selectedBins) => {
		set({ selectedBins });
		commitUrl(get());
	},
	setGroupBy: (groupBy) => {
		set({ groupBy });
		commitUrl(get());
	},
	setHighlightedId: (highlightedId) => {
		set({ highlightedId });
		commitUrl(get());
	},
	setSearch: (search) => set({ search }),
	setFiltersOpen: (filtersOpen) => set({ filtersOpen }),
	setTheme: (theme) => {
		set({ theme });
		commitUrl(get());
	},
	resetFilters: () => {
		set({
			selectedClasses: [],
			selectedNeighborhoods: [],
			selectedBins: [],
			highlightedId: null,
			search: '',
		});
		commitUrl(get());
	},
}));

function commitUrl(state: AppState) {
	window.clearTimeout((commitUrl as { timer?: number }).timer);
	(commitUrl as { timer?: number }).timer = window.setTimeout(() => {
		writeUrlState({
			classes: state.selectedClasses,
			neighborhoods: state.selectedNeighborhoods,
			bins: state.selectedBins,
			groupBy: state.groupBy,
			pin: state.highlightedId,
			theme: state.theme,
		});
	}, 150);
}
