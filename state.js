export const state = {
    cardIds: [],
    allCards: new Map(),
    currentIndex: 0,
    playlists: new Map(),
    activeTab: 'feed',
    isFetching: false,
    currentTopic: 'おすすめ',
    searchHistory: []
};

export const ALL_CARDS_KEY = 'sl_allCards_v9';
export const SEARCH_HISTORY_KEY = 'sl_searchHistory_v9';
let localStorageAvailable = false;

export function checkLocalStorage() {
    try {
        localStorage.setItem('t', 't');
        localStorage.removeItem('t');
        localStorageAvailable = true;
    } catch {
        localStorageAvailable = false;
    }
}

export function loadState() {
    if (!localStorageAvailable) return;
    const all = localStorage.getItem(ALL_CARDS_KEY);
    if (all) state.allCards = new Map(JSON.parse(all));
    const hist = localStorage.getItem(SEARCH_HISTORY_KEY);
    if (hist) state.searchHistory = JSON.parse(hist);
}

export function saveState() {
    if (!localStorageAvailable) return;
    try {
        localStorage.setItem(ALL_CARDS_KEY, JSON.stringify(Array.from(state.allCards.entries())));
        localStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(state.searchHistory));
    } catch {}
}
