import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";

/* ===== 設定 ===== */
const DEBUG_BYPASS_AI = false;       // 完成版: false
const DEBUG_SHOW_RAW_RESPONSE = false;

// ここはそのまま使える（あなたのURL制限つきキーを直書き）
const LLM_API_KEY = "AIzaSyA58TjdqTNxnBrIEIoP_Xwp-cgbMqvTZz4";

const firebaseConfig = {
    apiKey: "AIzaSyD81oPn5HUBGmkHWId2KVpPdbGvJ9St_og",
    authDomain: "shortstudio-59078.firebaseapp.com",
    projectId: "shortstudio-59078",
    storageBucket: "shortstudio-59078.firebasestorage.app",
    messagingSenderId: "366522463743",
    appId: "1:366522463743:web:c782685bf99baf24aaa3ca",
    measurementId: "G-G6X5PXXP2S"
};

/* ===== 共有DOM ===== */
// DOM 要素の取得を遅延させ、DOMContentLoaded 後に確実に存在するようにする
// (検索時に要素が null となり処理が進まない問題を防止)
const dom = {};
function cacheDom() {
    dom.initialLoader = document.getElementById('initial-loader');
    dom.searchHomePanel = document.getElementById('search-home-panel');
    dom.mainContent = document.getElementById('main-content');
    dom.searchInput = document.getElementById('search-input');
    dom.searchButton = document.getElementById('search-button');
    dom.historyList = document.getElementById('history-list');
    dom.homeIcon = document.getElementById('home-icon');
    dom.topicTitle = document.getElementById('topic-title');
    dom.fetchingIndicator = document.getElementById('fetching-indicator');
    dom.fetchingText = document.getElementById('fetching-text');
    dom.tabs = document.querySelectorAll('.tab-item');
    dom.panels = document.querySelectorAll('.content-panel');
    dom.cardContainer = document.getElementById('card-container');
    dom.messageBanner = document.getElementById('message-banner');
    dom.aiModal = document.getElementById('ai-modal');
    dom.aiModalClose = document.getElementById('ai-modal-close');
    dom.aiModalBody = document.getElementById('ai-modal-body');
    dom.debugPanel = document.getElementById('debug-panel');
    dom.debugPre = document.getElementById('debug-pre');
    dom.debugToggle = document.getElementById('debug-toggle');
}

/* ===== 状態 ===== */
const state = {
    cardIds: [], allCards: new Map(), currentIndex: 0,
    playlists: new Map(), activeTab: 'feed', isFetching: false,
    currentTopic: 'おすすめ',
    searchHistory: []
};
const ALL_CARDS_KEY = 'sl_allCards_v9';
const SEARCH_HISTORY_KEY = 'sl_searchHistory_v9';
let localStorageAvailable = false;
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

/* ===== ユーティリティ ===== */
function escapeHtml(unsafe) { if (typeof unsafe !== 'string') return ''; return unsafe.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;"); }
function setDebugRaw(s) { if (!DEBUG_SHOW_RAW_RESPONSE) return; dom.debugPre.textContent = String(s).slice(0, 10000); }
function hideInitialLoader() { dom.initialLoader.style.opacity = '0'; setTimeout(() => dom.initialLoader.style.display = 'none', 500); }
function checkLocalStorage() { try { localStorage.setItem('t', 't'); localStorage.removeItem('t'); localStorageAvailable = true; } catch { localStorageAvailable = false; } }
function loadState() {
    if (!localStorageAvailable) return;
    const all = localStorage.getItem(ALL_CARDS_KEY); if (all) state.allCards = new Map(JSON.parse(all));
    const hist = localStorage.getItem(SEARCH_HISTORY_KEY); if (hist) state.searchHistory = JSON.parse(hist);
}
function saveState() {
    if (!localStorageAvailable) return;
    try {
        localStorage.setItem(ALL_CARDS_KEY, JSON.stringify(Array.from(state.allCards.entries())));
        localStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(state.searchHistory));
    } catch { }
}

// JSON配列だけ抜いてパース
function safeParseJsonArray(maybeJson) {
    if (Array.isArray(maybeJson)) return maybeJson;
    let s = String(maybeJson || '').trim();
    s = s.replace(/^```json\s*/i, '').replace(/```$/i, '').trim();
    const m = s.match(/\[[\s\S]*\]/);
    if (!m) throw new Error('JSON配列が見つかりません');
    return JSON.parse(m[0]);
}

/* ===== LLM 呼び出し（直叩き・フォールバック付き）===== */
async function callLLM(prompt, schema = null) {
    if (DEBUG_BYPASS_AI) {
        const sample = JSON.stringify([
            { title: "サンプル: 要点整理", point: "PFCを意識", detail: "たんぱく質/脂質/炭水化物のバランス", code: "" },
            { title: "サンプル: 睡眠のコツ", point: "就寝1時間前は画面オフ", detail: "入眠を妨げる要因を減らす", code: "" }
        ]);
        setDebugRaw("DEBUG_BYPASS_AI\n" + sample);
        return sample;
    }

    const models = [
        "gemini-2.5-flash-preview-05-20",
        "gemini-1.5-flash"
    ];

    const payloadBase = { contents: [{ role: "user", parts: [{ text: prompt }] }] };
    if (schema) payloadBase.generationConfig = { responseMimeType: "application/json", responseSchema: schema };

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    try {
        let lastErr;
        for (const model of models) {
            const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${LLM_API_KEY}`;
            try {
                const res = await fetch(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payloadBase),
                    signal: controller.signal
                });
                const raw = await res.text();
                setDebugRaw(`[${model}] HTTP ${res.status}\n${raw.slice(0, 5000)}`);
                if (!res.ok) { lastErr = new Error(`[${model}] ${res.status} ${raw.slice(0, 300)}`); continue; }
                let json; try { json = JSON.parse(raw); } catch { throw new Error(`[${model}] 非JSON応答`); }
                const part = json?.candidates?.[0]?.content?.parts?.find(p => typeof p.text === 'string');
                if (!part) throw new Error(`[${model}] 応答に text がありません`);
                return part.text;
            } catch (e) {
                lastErr = e;
                // 次のモデルへ
            }
        }
        throw lastErr || new Error('LLM呼び出しに失敗しました');
    } finally {
        clearTimeout(timeout);
    }
}

/* ===== カード生成 ===== */
async function generateCardsFromAI(count, topic = '全般') {
    const prompt =
        `あなたは専門家です。モバイル学習アプリ向けに、トピック「${topic}」の学習カードを${count}個、` +
        `JSON配列で生成してください。各要素は { "title": "...", "point": "...", "detail": "...", "code": "..." } を含めること。`;
    const schema = {
        type: "ARRAY",
        items: {
            type: "OBJECT",
            properties: {
                title: { type: "STRING" }, point: { type: "STRING" }, detail: { type: "STRING" }, code: { type: "STRING" }
            },
            required: ["title", "point"]
        }
    };

    let resultText;
    try {
        resultText = await callLLM(prompt, schema);
    } catch (err) {
        console.error(err);
        throw err;
    }
    setDebugRaw('RAW:\n' + String(resultText).slice(0, 5000));

    let arr;
    try {
        arr = safeParseJsonArray(resultText);
    } catch (parseErr) {
        console.error(parseErr);
        throw parseErr;
    }

    const now = Date.now();
    return arr.map((raw, i) => {
        const title = String(raw.title || raw.heading || `学習カード ${i + 1}`).slice(0, 120);
        const point = String(raw.point || raw.summary || '要点').slice(0, 200);
        const detail = raw.detail ? String(raw.detail) : '';
        const code = raw.code ? String(raw.code) : '';
        return { id: `${topic}-${now}-${i}`, title, point, detail, code };
    });
}

function createFallbackCards(topic) {
    const now = Date.now();
    return [
        { id: `${topic}-${now}-f1`, title: `フォールバック: ${topic} 1`, point: '生成失敗のため暫定', detail: '', code: '' },
        { id: `${topic}-${now}-f2`, title: `フォールバック: ${topic} 2`, point: '生成失敗のため暫定', detail: '', code: '' }
    ];
}
/* ===== 表示系 ===== */
function updateTopicTitle() { dom.topicTitle.textContent = state.currentTopic === 'おすすめ' ? 'ショート学習' : `「${state.currentTopic}」の学習`; }
function updateActiveTab() {
    dom.tabs.forEach(t => t.classList.toggle('active', t.dataset.tab === state.activeTab));
    dom.panels.forEach(p => p.classList.toggle('active', p.id.startsWith(state.activeTab)));
}
function renderSearchHistory() {
    dom.historyList.innerHTML = '';
    state.searchHistory.forEach(term => {
        const li = document.createElement('li'); li.className = 'history-item'; li.textContent = term;
        li.addEventListener('click', () => handleSearch(term));
        dom.historyList.appendChild(li);
    });
}
function switchView(view) {
    if (view === 'search') { dom.searchHomePanel.classList.remove('hidden'); dom.mainContent.classList.add('hidden'); renderSearchHistory(); }
    else { dom.searchHomePanel.classList.add('hidden'); dom.mainContent.classList.remove('hidden'); }
}
function showBanner(message, type = 'info', timeout = 4000) {
    if (!dom.messageBanner) return;
    dom.messageBanner.textContent = message;
    dom.messageBanner.className = `message-banner ${type}`;
    dom.messageBanner.classList.remove('hidden');
    if (timeout) setTimeout(() => dom.messageBanner.classList.add('hidden'), timeout);
}
function showError(message, showRetry = false) {
    hideInitialLoader();
    const retry = showRetry ? `<button id="error-retry-btn" style="margin-top:12px;background:var(--ai-accent-color);color:#fff;border:none;padding:8px 12px;border-radius:8px;cursor:pointer">検索に戻る</button>` : '';
    dom.cardContainer.innerHTML = `<div class="card current" style="justify-content:center;align-items:center"><div style="max-width:420px;text-align:center"><p>${escapeHtml(String(message))}</p>${retry}</div></div>`;
    if (showRetry) { document.getElementById('error-retry-btn').addEventListener('click', () => switchView('search')); }
    switchView('main');
}
function renderCurrentCardView() {
    dom.cardContainer.innerHTML = '';
    const currentId = state.cardIds[state.currentIndex];
    if (!currentId) {
        dom.cardContainer.innerHTML = `<div class="card current" style="justify-content:center;align-items:center"><p class="empty-placeholder">カードがありません。検索してみてください。</p></div>`;
        return;
    }
    const prevId = state.cardIds[state.currentIndex - 1];
    const nextId = state.cardIds[state.currentIndex + 1];
    if (prevId) dom.cardContainer.appendChild(createCardElement(state.allCards.get(prevId), 'previous'));
    dom.cardContainer.appendChild(createCardElement(state.allCards.get(currentId), 'current'));
    if (nextId) dom.cardContainer.appendChild(createCardElement(state.allCards.get(nextId), 'next'));
}
function createCardElement(cardData, pos) {
    if (!cardData) return document.createDocumentFragment();
    const el = document.createElement('div'); el.className = `card ${pos}`; el.dataset.id = cardData.id || '';
    const aiBtn = cardData.code ? `<button class="ai-explain-button" data-code="${escapeHtml(cardData.code)}">✨ AIで詳しく解説</button>` : '';
    el.innerHTML = `
      <div class="card-title">${escapeHtml(cardData.title)}</div>
      <div class="card-point">${escapeHtml(cardData.point)}</div>
      ${cardData.detail ? `<div class="card-detail">${escapeHtml(cardData.detail)}</div>` : ''}
      ${cardData.code ? `<pre class="card-code"><code>${escapeHtml(cardData.code)}</code></pre>` : ''}
      ${aiBtn ? `<div class="card-actions">${aiBtn}</div>` : ''}`;
    const explainBtn = el.querySelector('.ai-explain-button'); if (explainBtn) explainBtn.addEventListener('click', handleExplainClick);
    return el;
}
/* ===== ハンドラ ===== */
function handleTabClick(e) { state.activeTab = e.currentTarget.dataset.tab; updateActiveTab(); }
function handleLikeClick(e) {
    e.stopPropagation();
    const cardId = e.currentTarget.dataset.id;
    dom.playlistModal.dataset.cardId = cardId;
    renderPlaylistModal();
    dom.playlistModal.classList.add('visible');
}
function renderPlaylistModal() {
    const cardId = dom.playlistModal.dataset.cardId || '';
    dom.playlistModalList.innerHTML = '';
    if (state.playlists.size === 0) {
        dom.playlistModalList.innerHTML = '<div class="empty-placeholder">プレイリストがありません。新規作成してください。</div>';
    }
    state.playlists.forEach((cardIds, name) => {
        const isChecked = cardIds.has(cardId);
        const row = document.createElement('div'); row.style.display = 'flex'; row.style.alignItems = 'center'; row.style.padding = '6px 0';
        row.innerHTML = `<input type="checkbox" id="pl-${escapeHtml(name)}" ${isChecked ? 'checked' : ''} /><label for="pl-${escapeHtml(name)}" style="margin-left:8px">${escapeHtml(name)}</label>`;
        row.querySelector('input').addEventListener('change', (ev) => updateCardInPlaylist(cardId, name, ev.target.checked));
        dom.playlistModalList.appendChild(row);
    });
}
function updateCardInPlaylist(cardId, playlistName, shouldBeIn) {
    const pl = state.playlists.get(playlistName); if (!pl) return; if (shouldBeIn) pl.add(cardId); else pl.delete(cardId);
}
function createNewPlaylist() {
    const name = (dom.newPlaylistInput.value || '').trim(); if (!name) return;
    if (!state.playlists.has(name)) state.playlists.set(name, new Set());
    dom.newPlaylistInput.value = '';
}
function handleLikedItemClick(cardId) {
    const topic = (cardId || '').split('-')[0];
    const topicCards = Array.from(state.allCards.values()).filter(c => c.id && c.id.startsWith(topic));
    const ids = topicCards.map(c => c.id);
    const idx = ids.indexOf(cardId);
    if (idx !== -1) {
        state.cardIds = ids; state.currentTopic = topic; state.activeTab = 'feed';
        navigateTo(idx, true); updateActiveTab(); updateTopicTitle(); switchView('main');
    }
}
async function handleExplainClick(e) {
    e.stopPropagation();
    const code = e.currentTarget.dataset.code;
    dom.aiModalBody.innerHTML = '<div class="loader"></div>';
    dom.aiModal.classList.add('visible');
    const prompt = `以下のコードを初心者にも分かるように、各行の役割を具体的に解説してください。\n\n\`\`\`javascript\n${code}\n\`\`\``;
    try {
        const text = await callLLM(prompt);
        dom.aiModalBody.textContent = text || '（応答が空でした）';
    } catch (err) {
        dom.aiModalBody.textContent = 'エラー: ' + String(err.message || err);
    }
}

async function handleSearch(topic, isInitial = false) {
    if (state.isFetching) return;
    state.isFetching = true;
    if (!isInitial) {
        switchView('main');
        dom.fetchingText.textContent = 'AI応答待ち...';
        dom.fetchingIndicator.classList.add('visible');
        dom.cardContainer.innerHTML = `<div class="card current" style="justify-content:center;align-items:center"><div class="loader"></div></div>`;
    }
    if (!state.searchHistory.includes(topic)) {
        state.searchHistory.unshift(topic); if (state.searchHistory.length > 10) state.searchHistory.pop();
    }
    let cards = [];
    try {
        cards = await generateCardsFromAI(10, topic);
    } catch (err) {
        console.error(err);
        showBanner('AI生成に失敗したため代替カードを表示しています', 'error');
        cards = createFallbackCards(topic);
    }
    dom.fetchingText.textContent = 'カード表示中...';
    try {
        if (!cards || cards.length === 0) throw new Error('No cards generated');
        cards.forEach(c => state.allCards.set(c.id, c));
        state.cardIds = cards.map(c => c.id);
        state.currentIndex = 0; state.currentTopic = topic; saveState(); startApp();
    } catch (err) {
        showError(`学習カードの生成に失敗: ${String(err.message || err)}`, true);
    } finally {
        state.isFetching = false;
        if (isInitial) hideInitialLoader();
        dom.fetchingIndicator.classList.remove('visible');
        if (dom.fetchingText) dom.fetchingText.textContent = '';
    }
}

async function navigateTo(index, fromTab = false) {
    if (index < 0) { snapCardsBack(); return; }
    if (index >= state.cardIds.length) {
        if (!state.isFetching) await addMoreCards();
        if (index >= state.cardIds.length) { snapCardsBack(); return; }
    }
    if (fromTab) {
        state.currentIndex = index; state.activeTab = 'feed'; updateActiveTab(); updateTopicTitle(); renderCurrentCardView(); saveState(); return;
    }
    if (index === state.currentIndex) return;
    const dir = index > state.currentIndex ? 1 : -1;
    const cur = dom.cardContainer.querySelector('.card.current');
    if (dir === 1) {
        const next = dom.cardContainer.querySelector('.card.next'); if (cur) cur.className = 'card previous'; if (next) next.className = 'card current';
    } else {
        const prev = dom.cardContainer.querySelector('.card.previous'); if (cur) cur.className = 'card next'; if (prev) prev.className = 'card current';
    }
    state.currentIndex = index;
    setTimeout(() => { renderCurrentCardView(); saveState(); if (!state.isFetching && state.currentIndex >= state.cardIds.length - 2) addMoreCards(); }, 300);
}
function snapCardsBack() {
    document.querySelectorAll('.card').forEach(c => { if (c) c.style.transition = 'transform .3s'; });
    const cur = dom.cardContainer.querySelector('.card.current'); if (cur) cur.style.transform = 'translateY(0)';
    const prev = dom.cardContainer.querySelector('.card.previous'); if (prev) prev.style.transform = 'translateY(-100%)';
    const next = dom.cardContainer.querySelector('.card.next'); if (next) next.style.transform = 'translateY(100%)';
}
async function addMoreCards() {
    if (state.isFetching) return;
    state.isFetching = true;
    dom.fetchingText.textContent = '追加生成中...';
    dom.fetchingIndicator.classList.add('visible');
    try {
        const more = await generateCardsFromAI(3, state.currentTopic);
        const toAdd = (more && more.length > 0) ? more : createFallbackCards(state.currentTopic);
        toAdd.forEach(c => state.allCards.set(c.id, c));
        state.cardIds.push(...toAdd.map(c => c.id));
        saveState();
        if (!more || more.length === 0) {
            showBanner('AI生成に失敗したためフォールバックを表示しています', 'error');
        }
    } catch (err) {
        console.error(err);
        const fallback = createFallbackCards(state.currentTopic);
        fallback.forEach(c => state.allCards.set(c.id, c));
        state.cardIds.push(...fallback.map(c => c.id));
        showBanner('追加生成に失敗しました。フォールバックを表示します', 'error');
    } finally {
        state.isFetching = false;
        dom.fetchingIndicator.classList.remove('visible');
        if (dom.fetchingText && dom.fetchingText.textContent === '追加生成中...') {
            dom.fetchingText.textContent = '';
        }
    }
}

/* ===== イベント結線 ===== */
function setupEventListeners() {
    dom.homeIcon.addEventListener('click', () => switchView('search'));
    dom.searchButton.addEventListener('click', () => { const q = (dom.searchInput.value || '').trim(); if (q) handleSearch(q); });
    dom.searchInput.addEventListener('keydown', e => { if (e.key === 'Enter') dom.searchButton.click(); });
    dom.aiModalClose.addEventListener('click', () => dom.aiModal.classList.remove('visible'));

    // スワイプ
    let startY = 0, startX = 0, isDragging = false; const swipeThreshold = 50, angleThreshold = 20;
    dom.cardContainer.addEventListener('pointerdown', e => { if (state.cardIds.length === 0) return; startY = e.clientY; startX = e.clientX; isDragging = true; document.querySelectorAll('.card').forEach(c => { if (c) c.style.transition = 'none'; }); });
    dom.cardContainer.addEventListener('pointermove', e => { if (!isDragging) return; const dy = e.clientY - startY; const c = dom.cardContainer.querySelector('.card.current'); const p = dom.cardContainer.querySelector('.card.previous'); const n = dom.cardContainer.querySelector('.card.next'); if (c) c.style.transform = `translateY(${dy}px)`; if (p) p.style.transform = `translateY(calc(-100% + ${dy}px))`; if (n) n.style.transform = `translateY(calc(100% + ${dy}px))`; });
    const end = e => { if (!isDragging) return; isDragging = false; const dy = e.clientY - startY; const dx = e.clientX - startX; const angle = Math.abs(Math.atan2(dx, dy) * 180 / Math.PI); if (Math.abs(90 - angle) > (90 - angleThreshold)) { if (Math.abs(dy) > swipeThreshold) { if (dy < 0) navigateTo(state.currentIndex + 1); else navigateTo(state.currentIndex - 1); } else snapCardsBack(); } else snapCardsBack(); };
    dom.cardContainer.addEventListener('pointerup', end); dom.cardContainer.addEventListener('pointerleave', end);

    // キー/ホイール
    window.addEventListener('keydown', e => { if (state.activeTab !== 'feed') return; if (e.key === 'ArrowUp') navigateTo(state.currentIndex - 1); else if (e.key === 'ArrowDown') navigateTo(state.currentIndex + 1); });
    let isWheeling = false; window.addEventListener('wheel', e => { if (state.activeTab !== 'feed' || isWheeling) return; isWheeling = true; if (e.deltaY > 0) navigateTo(state.currentIndex + 1); else if (e.deltaY < 0) navigateTo(state.currentIndex - 1); setTimeout(() => isWheeling = false, 350); }, { passive: false });
}

/* ===== Firebase init ===== */
function setupFirebase() {
    return new Promise(resolve => {
        onAuthStateChanged(auth, () => {
            if (dom.initialLoader.style.display !== 'none') { hideInitialLoader(); switchView('search'); }
            resolve();
        });
        signInAnonymously(auth).catch(() => { hideInitialLoader(); switchView('search'); resolve(); });
    });
}

/* ===== 起動 ===== */
function startApp() { updateTopicTitle(); renderCurrentCardView(); updateActiveTab(); }
async function init() {
    checkLocalStorage();
    cacheDom();
    loadState();
    setupEventListeners();
    await setupFirebase();
}

window.addEventListener('DOMContentLoaded', init);

