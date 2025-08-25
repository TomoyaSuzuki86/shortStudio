import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

async function loadContext() {
  const elements = {};
  const createEl = () => ({
    classList: { add() {}, remove() {}, toggle() {} },
    style: {},
    innerHTML: '',
    textContent: '',
    dataset: {},
    children: [],
    appendChild(child) { this.children.push(child); },
    querySelector() { return null; },
    querySelectorAll() { return []; },
    addEventListener() {}
  });
  const document = {
    getElementById(id) { return elements[id] || (elements[id] = createEl()); },
    querySelectorAll(sel) {
      if (sel === '.tab-item' || sel === '.content-panel') {
        return [createEl(), createEl()];
      }
      return [];
    },
    createElement() { return createEl(); },
    createDocumentFragment() { return { appendChild() {} }; }
  };
  const windowObj = {
    localStorage: {
      store: {},
      getItem(k) { return this.store[k] ?? null; },
      setItem(k, v) { this.store[k] = String(v); },
      removeItem(k) { delete this.store[k]; },
      clear() { this.store = {}; }
    },
    addEventListener() {}
  };
  const context = {
    window: windowObj,
    document,
    console,
    localStorage: windowObj.localStorage,
    fetch: async () => { throw new Error('fetch not mocked'); },
    AbortController,
    setTimeout,
    clearTimeout,
    initializeApp: () => ({}),
    getAuth: () => ({}),
    signInAnonymously: () => Promise.resolve(),
    onAuthStateChanged: (auth, cb) => cb({ uid: 'u' }),
    getFirestore: () => ({}),
    doc: () => ({}),
    setDoc: async () => {},
    onSnapshot: (ref, cb) => cb({ exists: () => false, data: () => ({}) })
  };
  vm.createContext(context);
  const code = fs.readFileSync(path.resolve('script.js'), 'utf8');
  const sanitized = code.replace(/^import[^;]*;\n/gm, '') + '\nexport { state, dom, saveState, loadState, cacheDom, checkLocalStorage };';
  const module = new vm.SourceTextModule(sanitized, { context });
  await module.link(() => {});
  await module.evaluate();
  const ns = module.namespace;
  ns.cacheDom();
  ns.checkLocalStorage();
  return { ...ns, window: windowObj, context };
}

test('saveState and loadState persist search history', async () => {
  const ctx = await loadContext();
  ctx.state.searchHistory = ['テーマ'];
  ctx.saveState();
  ctx.state.searchHistory = [];
  ctx.loadState();
  assert.strictEqual(ctx.state.searchHistory[0], 'テーマ');
});

