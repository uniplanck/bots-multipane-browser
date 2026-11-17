// node test/close-guard.test.js — アプリを閉じるとき (xG-Bots_261116_002): "TypeError: Object has been destroyed at WebContents.<anonymous>"
// came from a pane's before-mouse-event calling tipWindow?.isVisible() on the tip window destroyed with its parent (`?.` stops null only), again
// at every mouse move. The real handlers of main.js run in a vm against destroyed fakes (any call but isDestroyed throws as Electron does): the
// panes' / the sidebar's / the window's own mouse handlers, handleKey and the auto-reload tick. No Electron; the real close is a manual check.
const fs = require('fs'), path = require('path'), vm = require('vm');
const main = fs.readFileSync(path.join(__dirname, '..', 'src', 'main.js'), 'utf8');
let bad = 0; const t = (n, ok) => { if (!ok) bad++; console.log(ok ? 'ok  ' : 'FAIL', n); };
const tryRun = f => { try { f(); return null; } catch (e) { return e; } };
// a destroyed BrowserWindow / WebContents: isDestroyed() is true, every other call throws like Electron's
const DESTROYED = () => new Proxy({}, { get: (_, k) => (k === 'isDestroyed' ? () => true : k === 'then' ? undefined : () => { throw new TypeError('Object has been destroyed'); }) });
// the whole call that starts at main.indexOf(head, from): up to its matching ')' (the handlers hold no unbalanced paren in a string)
function call(head, from = 0) {
  const a = main.indexOf(head, from); if (a < 0) throw Error('missing ' + head);
  let d = 0, i = main.indexOf('(', a);
  for (; i < main.length; i++) { if (main[i] === '(') d++; else if (main[i] === ')' && --d === 0) break; }
  return { code: main.slice(a, i + 1) + ';', end: i + 1 };
}
const TIP = (main.match(/const tipShown = \(\) => [^\n;]*;/) || ['const tipShown = () => false;'])[0].replace('const tipShown', 'var tipShown');   // none (before the fix): a stand-in
const all = head => { const out = []; for (let at = 0; ;) { const i = main.indexOf(head, at); if (i < 0) return out; const c = call(head, i); out.push(c.code); at = c.end; } };

t('source: no ?.isVisible() on a window any more (the tip goes through tipShown)', !/tipWindow\?\.isVisible\(\)/.test(main) && !/\?\.isVisible\(\)/.test(main)
  && (main.match(/m\.type === 'mouseMove' && tipShown\(\)/g) || []).length === 2);

// ---- tipShown itself ----
{ const ctx = vm.createContext({ tipWindow: null }); vm.runInContext(TIP, ctx);
  const none = ctx.tipShown();
  ctx.tipWindow = DESTROYED(); const gone = tryRun(() => { if (ctx.tipShown() !== false) throw Error('not false'); });
  ctx.tipWindow = { isDestroyed: () => false, isVisible: () => true }; const shown = ctx.tipShown();
  ctx.tipWindow = { isDestroyed: () => false, isVisible: () => false }; const hidden = ctx.tipShown();
  t('tipShown: none / destroyed -> false without a call on it; alive -> its visibility', none === false && gone === null && shown === true && hidden === false); }

// ---- every before-mouse-event handler of a pane / the sidebar, after the window and its tip are gone (their views outlive the window while the
// app quits). The window's own page (win.webContents) is gone with the window: no event of it comes after ----
{ const handlers = all("wc.on('before-mouse-event', (e, m) =>");
  const box = { hs: [], calls: [] };
  const rec = name => () => box.calls.push(name);
  const fakeWc = { on: (ev, f) => box.hs.push(f) };
  const ctx = vm.createContext({ wc: fakeWc, win: null, tipWindow: null, p: { sleeping: false, cmpAt: 1 }, panes: [],
    focusPane: rec('focusPane'), sideClear: rec('sideClear'), closeInstruct: rec('closeInstruct'), splitEnd: rec('splitEnd') });
  vm.runInContext('var dismissTip = () => { hideTip(); }; var hideTip = () => { if (tipWindow && !tipWindow.isDestroyed()) tipWindow.hide(); };', ctx);
  vm.runInContext(TIP, ctx);
  ctx.win = DESTROYED(); ctx.tipWindow = DESTROYED();
  handlers.forEach(h => vm.runInContext(h, ctx));
  t(`found the mouse handlers (${box.hs.length}: 4 per pane, the sidebar's)`, box.hs.length === 5);
  const errs = [];
  for (const type of ['mouseMove', 'mouseDown', 'mouseUp', 'mouseWheel']) box.hs.forEach((h, i) => { const e = tryRun(() => h({}, { type, x: 1, y: 1 })); if (e) errs.push(`${i}:${type}: ${e.message}`); });
  t('window and tip destroyed: no mouse event throws (was: TypeError: Object has been destroyed at every move)' + (errs.length ? ' — ' + errs.join(' / ') : ''), !errs.length);
  t('… and the sidebar\'s handler does nothing on the gone window (no instruct box / split end)', !box.calls.some(c => c === 'closeInstruct' || c === 'splitEnd'));
  // the window alive, the tip shown: a move still hides it; a click still focuses the pane
  box.calls = []; let hid = 0;
  ctx.win = { isDestroyed: () => false }; ctx.tipWindow = { isDestroyed: () => false, isVisible: () => true, hide: () => hid++ };
  box.hs.forEach(h => h({}, { type: 'mouseMove' })); box.hs[0]({}, { type: 'mouseDown' });
  t('window alive: a move over a pane / the sidebar still hides the shown tip, a click still focuses the pane', hid === 2 && box.calls.includes('focusPane')); }

// ---- handleKey: a key while the window closes ----
{ const src = main.slice(main.indexOf('function handleKey(input, pane) {'), main.indexOf('\n}', main.indexOf('function handleKey(input, pane) {')) + 2);
  const ctx = vm.createContext({ win: DESTROYED() }); vm.runInContext(src, ctx);
  let r; const e = tryRun(() => { r = ctx.handleKey({ type: 'keyDown', key: 'w', meta: true }); });
  t('handleKey: window destroyed -> false, nothing touched (no throw)', e === null && r === false); }

// ---- the auto-reload tick (every 15 s) while quitting: the last window stays in ctxs, its views destroyed ----
{ const a = main.indexOf('// ---- auto reload'), code = call('setInterval(', a).code;
  const box = { fn: null, reloads: 0 };
  const ctx = vm.createContext({ setInterval: f => { box.fn = f; }, Date, TYPING_GRACE_MS: 0, RP: { view: () => ({ gone: false }) },
    ctxs: [{ win: DESTROYED(), panes: [{ reloadMinutes: 1, lastReload: 0, lastTyping: 0, view: { webContents: DESTROYED() } }], autoReload: () => box.reloads++ },
      { win: { isDestroyed: () => false }, panes: [{ reloadMinutes: 1, lastReload: 0, lastTyping: 0, view: { webContents: { isDestroyed: () => false, isLoading: () => false } } }], autoReload: () => box.reloads++ }] });
  vm.runInContext(code, ctx);
  const e = tryRun(box.fn);
  t('auto reload: a destroyed window / view is skipped (no throw); a live one still reloads', e === null && box.reloads === 1); }

console.log(bad ? `${bad} failed` : 'all passed'); process.exit(bad ? 1 : 0);
