import test from 'node:test';
import assert from 'node:assert';
import { state, saveState, loadState, checkLocalStorage } from '../state.js';

test('saveState and loadState persist search history', () => {
  globalThis.localStorage = {
    store: {},
    getItem(k) { return this.store[k] ?? null; },
    setItem(k, v) { this.store[k] = String(v); },
    removeItem(k) { delete this.store[k]; },
    clear() { this.store = {}; }
  };
  checkLocalStorage();
  state.searchHistory = ['テーマ'];
  saveState();
  state.searchHistory = [];
  loadState();
  assert.strictEqual(state.searchHistory[0], 'テーマ');
});
