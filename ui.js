import { state } from './state.js';

const DEBUG_SHOW_RAW_RESPONSE = false;

export const dom = {};

export function cacheDom() {
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

export function escapeHtml(unsafe) {
  if (typeof unsafe !== 'string') return '';
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export function setDebugRaw(s) {
  if (!DEBUG_SHOW_RAW_RESPONSE) return;
  dom.debugPre.textContent = String(s).slice(0, 10000);
}

export function hideInitialLoader() {
  dom.initialLoader.style.opacity = '0';
  setTimeout(() => (dom.initialLoader.style.display = 'none'), 500);
}

export function updateTopicTitle() {
  dom.topicTitle.textContent =
    state.currentTopic === 'おすすめ'
      ? 'ショート学習'
      : `「${state.currentTopic}」の学習`;
}

export function updateActiveTab() {
  dom.tabs.forEach(t =>
    t.classList.toggle('active', t.dataset.tab === state.activeTab)
  );
  dom.panels.forEach(p =>
    p.classList.toggle('active', p.id.startsWith(state.activeTab))
  );
}

export function renderSearchHistory(handleSearch) {
  dom.historyList.innerHTML = '';
  state.searchHistory.forEach(term => {
    const li = document.createElement('li');
    li.className = 'history-item';
    li.textContent = term;
    li.addEventListener('click', () => handleSearch(term));
    dom.historyList.appendChild(li);
  });
}

export function switchView(view) {
  if (view === 'search') {
    dom.searchHomePanel.classList.remove('hidden');
    dom.mainContent.classList.add('hidden');
  } else {
    dom.searchHomePanel.classList.add('hidden');
    dom.mainContent.classList.remove('hidden');
  }
}

export function showBanner(message, type = 'info', timeout = 4000) {
  if (!dom.messageBanner) return;
  dom.messageBanner.textContent = message;
  dom.messageBanner.className = `message-banner ${type}`;
  dom.messageBanner.classList.remove('hidden');
  if (timeout) setTimeout(() => dom.messageBanner.classList.add('hidden'), timeout);
}

export function showError(message, showRetry = false) {
  hideInitialLoader();
  const retry = showRetry
    ? `<button id="error-retry-btn" style="margin-top:12px;background:var(--ai-accent-color);color:#fff;border:none;padding:8px 12px;border-radius:8px;cursor:pointer">検索に戻る</button>`
    : '';
  dom.cardContainer.innerHTML = `<div class="card current" style="justify-content:center;align-items:center"><div style="max-width:420px;text-align:center"><p>${escapeHtml(String(message))}</p>${retry}</div></div>`;
  if (showRetry) {
    document
      .getElementById('error-retry-btn')
      .addEventListener('click', () => switchView('search'));
  }
  switchView('main');
}

export function renderCurrentCardView(explainHandler) {
  dom.cardContainer.innerHTML = '';
  const currentId = state.cardIds[state.currentIndex];
  if (!currentId) {
    dom.cardContainer.innerHTML = `<div class="card current" style="justify-content:center;align-items:center"><p class="empty-placeholder">カードがありません。検索してみてください。</p></div>`;
    return;
  }
  const prevId = state.cardIds[state.currentIndex - 1];
  const nextId = state.cardIds[state.currentIndex + 1];
  if (prevId)
    dom.cardContainer.appendChild(
      createCardElement(state.allCards.get(prevId), 'previous', explainHandler)
    );
  dom.cardContainer.appendChild(
    createCardElement(state.allCards.get(currentId), 'current', explainHandler)
  );
  if (nextId)
    dom.cardContainer.appendChild(
      createCardElement(state.allCards.get(nextId), 'next', explainHandler)
    );
}

export function createCardElement(cardData, pos, explainHandler) {
  if (!cardData) return document.createDocumentFragment();
  const el = document.createElement('div');
  el.className = `card ${pos}`;
  el.dataset.id = cardData.id || '';
  const aiBtn = cardData.code
    ? `<button class="ai-explain-button" data-code="${escapeHtml(cardData.code)}">✨ AIで詳しく解説</button>`
    : '';
  el.innerHTML = `
      <div class="card-title">${escapeHtml(cardData.title)}</div>
      <div class="card-point">${escapeHtml(cardData.point)}</div>
      ${cardData.detail ? `<div class="card-detail">${escapeHtml(cardData.detail)}</div>` : ''}
      ${cardData.code ? `<pre class="card-code"><code>${escapeHtml(cardData.code)}</code></pre>` : ''}
      ${aiBtn ? `<div class="card-actions">${aiBtn}</div>` : ''}`;
  const explainBtn = el.querySelector('.ai-explain-button');
  if (explainBtn) explainBtn.addEventListener('click', explainHandler);
  return el;
}
