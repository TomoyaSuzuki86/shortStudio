import { state, checkLocalStorage, loadState, saveState } from './state.js';
import {
  dom,
  cacheDom,
  hideInitialLoader,
  updateTopicTitle,
  updateActiveTab,
  renderSearchHistory,
  switchView,
  showBanner,
  showError,
  renderCurrentCardView
} from './ui.js';
import {
  callLLM,
  generateCardsFromAI,
  createFallbackCards,
  setupFirebase
} from './api.js';

function showSearchView() {
  switchView('search');
  renderSearchHistory(handleSearch);
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
    state.searchHistory.unshift(topic);
    if (state.searchHistory.length > 10) state.searchHistory.pop();
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
    state.currentIndex = 0;
    state.currentTopic = topic;
    saveState();
    startApp();
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
  if (index < 0) {
    snapCardsBack();
    return;
  }
  if (index >= state.cardIds.length) {
    if (!state.isFetching) await addMoreCards();
    if (index >= state.cardIds.length) {
      snapCardsBack();
      return;
    }
  }
  if (fromTab) {
    state.currentIndex = index;
    state.activeTab = 'feed';
    updateActiveTab();
    updateTopicTitle();
    renderCurrentCardView(handleExplainClick);
    saveState();
    return;
  }
  if (index === state.currentIndex) return;
  const dir = index > state.currentIndex ? 1 : -1;
  const cur = dom.cardContainer.querySelector('.card.current');
  if (dir === 1) {
    const next = dom.cardContainer.querySelector('.card.next');
    if (cur) cur.className = 'card previous';
    if (next) next.className = 'card current';
  } else {
    const prev = dom.cardContainer.querySelector('.card.previous');
    if (cur) cur.className = 'card next';
    if (prev) prev.className = 'card current';
  }
  state.currentIndex = index;
  setTimeout(() => {
    renderCurrentCardView(handleExplainClick);
    saveState();
    if (!state.isFetching && state.currentIndex >= state.cardIds.length - 2)
      addMoreCards();
  }, 300);
}

function snapCardsBack() {
  document.querySelectorAll('.card').forEach(c => {
    if (c) c.style.transition = 'transform .3s';
  });
  const cur = dom.cardContainer.querySelector('.card.current');
  if (cur) cur.style.transform = 'translateY(0)';
  const prev = dom.cardContainer.querySelector('.card.previous');
  if (prev) prev.style.transform = 'translateY(-100%)';
  const next = dom.cardContainer.querySelector('.card.next');
  if (next) next.style.transform = 'translateY(100%)';
}

async function addMoreCards() {
  if (state.isFetching) return;
  state.isFetching = true;
  dom.fetchingText.textContent = '追加生成中...';
  dom.fetchingIndicator.classList.add('visible');
  try {
    const more = await generateCardsFromAI(3, state.currentTopic);
    const toAdd = more && more.length > 0 ? more : createFallbackCards(state.currentTopic);
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

function setupEventListeners() {
  dom.homeIcon.addEventListener('click', () => showSearchView());
  dom.searchButton.addEventListener('click', () => {
    const q = (dom.searchInput.value || '').trim();
    if (q) handleSearch(q);
  });
  dom.searchInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') dom.searchButton.click();
  });
  dom.aiModalClose.addEventListener('click', () => dom.aiModal.classList.remove('visible'));

  // Swipe
  let startY = 0,
    startX = 0,
    isDragging = false;
  const swipeThreshold = 50,
    angleThreshold = 20;
  dom.cardContainer.addEventListener('pointerdown', e => {
    if (state.cardIds.length === 0) return;
    startY = e.clientY;
    startX = e.clientX;
    isDragging = true;
    document.querySelectorAll('.card').forEach(c => {
      if (c) c.style.transition = 'none';
    });
  });
  dom.cardContainer.addEventListener('pointermove', e => {
    if (!isDragging) return;
    const dy = e.clientY - startY;
    const c = dom.cardContainer.querySelector('.card.current');
    const p = dom.cardContainer.querySelector('.card.previous');
    const n = dom.cardContainer.querySelector('.card.next');
    if (c) c.style.transform = `translateY(${dy}px)`;
    if (p) p.style.transform = `translateY(calc(-100% + ${dy}px))`;
    if (n) n.style.transform = `translateY(calc(100% + ${dy}px))`;
  });
  const end = e => {
    if (!isDragging) return;
    isDragging = false;
    const dy = e.clientY - startY;
    const dx = e.clientX - startX;
    const angle = Math.abs((Math.atan2(dx, dy) * 180) / Math.PI);
    if (Math.abs(90 - angle) > 90 - angleThreshold) {
      if (Math.abs(dy) > swipeThreshold) {
        if (dy < 0) navigateTo(state.currentIndex + 1);
        else navigateTo(state.currentIndex - 1);
      } else snapCardsBack();
    } else snapCardsBack();
  };
  dom.cardContainer.addEventListener('pointerup', end);
  dom.cardContainer.addEventListener('pointerleave', end);

  // Key / wheel
  window.addEventListener('keydown', e => {
    if (state.activeTab !== 'feed') return;
    if (e.key === 'ArrowUp') navigateTo(state.currentIndex - 1);
    else if (e.key === 'ArrowDown') navigateTo(state.currentIndex + 1);
  });
  let isWheeling = false;
  window.addEventListener(
    'wheel',
    e => {
      if (state.activeTab !== 'feed' || isWheeling) return;
      isWheeling = true;
      if (e.deltaY > 0) navigateTo(state.currentIndex + 1);
      else if (e.deltaY < 0) navigateTo(state.currentIndex - 1);
      setTimeout(() => (isWheeling = false), 350);
    },
    { passive: false }
  );
}

function startApp() {
  updateTopicTitle();
  renderCurrentCardView(handleExplainClick);
  updateActiveTab();
}

async function init() {
  checkLocalStorage();
  cacheDom();
  loadState();
  renderSearchHistory(handleSearch);
  setupEventListeners();
  await setupFirebase();
}

window.addEventListener('DOMContentLoaded', init);
