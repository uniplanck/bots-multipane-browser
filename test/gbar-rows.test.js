// node test/gbar-rows.test.js — Grokバー 2段 (xG-Bots_261116_003): A's items on the upper row, B's on the lower, each led by its badge.
// The pure split (src/gbar-rows.js); then main's real gbView + renderer.js' bar block in a vm on a tiny fake DOM with both rows: each row holds
// its own account's pins / favorites / sections, pages on its own (its own 次へ), keeps collapse / pins / presence, an empty row says 未ログイン;
// and the wiring (index.html, style.css, main.js TOPBAR = the 2-row bar). Not covered: the real bar on screen (fonts, Chromium widths).
const fs = require('fs'), path = require('path'), vm = require('vm');
const R = require('../src/gbar-rows');
const read = f => fs.readFileSync(path.join(__dirname, '..', 'src', f), 'utf8');
const main = read('main.js'), ren = read('renderer.js'), css = read('style.css'), html = read('index.html');
let bad = 0; const t = (n, ok) => { if (!ok) bad++; console.log(ok ? 'ok  ' : 'FAIL', n); };
const J = JSON.stringify;

// ---- the split ----
const bot = (id, acct, o = {}) => ({ id, name: id, orig: id, url: 'https://grok.com/bot/' + id, icon: '', group: false, pinned: !!o.pinned, ...(acct ? { acct } : {}) });
{ const pins = [bot('p1', 'A', { pinned: 1 }), bot('p2', 'B', { pinned: 1 }), bot('p3', undefined, { pinned: 1 })];
  const favs = [{ id: 1, url: 'https://example.com/', acct: 'B' }, { id: 2, url: 'https://example.org/' }];
  const secs = [{ name: '仕事', collapsed: false, items: [bot('a', 'A'), bot('b', 'A')] }, { name: '仕事', collapsed: true, items: [bot('c', 'B')] },
    { name: 'mixed', items: [bot('d', 'A'), bot('e', 'B'), bot('f', 'A')] }, { name: '', items: [bot('g', 'B')] }, { name: 'none', items: [] }];
  const r = R.split(pins, favs, secs);
  t('rows: A above, B below', J(R.ROWS) === J(['A', 'B']));
  t('split: pins / favorites by their letter (none / anything else = A, as the item badges)', J(r.A.pins.map(b => b.id)) === J(['p1', 'p3']) && J(r.B.pins.map(b => b.id)) === J(['p2'])
    && J(r.A.favs.map(f => f.id)) === J([2]) && J(r.B.favs.map(f => f.id)) === J([1]) && R.letter('b') === 'A' && R.letter(undefined) === 'A' && R.letter('B') === 'B');
  t('split: sections keep their order, name and collapsed state; each row gets its own Bots; a section with none there is left out',
    J(r.A.sections.map(s => [s.name, !!s.collapsed, s.items.map(b => b.id)])) === J([['仕事', false, ['a', 'b']], ['mixed', false, ['d', 'f']]])
    && J(r.B.sections.map(s => [s.name, !!s.collapsed, s.items.map(b => b.id)])) === J([['仕事', true, ['c']], ['mixed', false, ['e']], ['', false, ['g']]]));
  t('split: the input is not changed', secs[2].items.length === 3 && pins.length === 3);
  t('count: pins + favorites + every section\'s Bots (a collapsed one too)', R.count(r.A) === 2 + 1 + 4 && R.count(r.B) === 1 + 1 + 3);
  t('split: nothing / junk -> two empty rows', [R.split(), R.split(null, 'x', [{}])].every(x => J(x) === J({ A: { pins: [], favs: [], sections: [] }, B: { pins: [], favs: [], sections: [] } }))); }

// ---- main's gbView (the badge letters) + the renderer's bar with both rows ----
{
  const rows = {};
  class El {
    constructor(tag) { this.tagName = tag.toUpperCase(); this.children = []; this.parent = null; this.className = ''; this.id = ''; this.dataset = {}; this.attrs = {}; this.style = {}; this._t = ''; this.on = {}; }
    get classList() { const el = this, set = () => new Set(el.className.split(/\s+/).filter(Boolean));
      return { contains: c => set().has(c), add(c) { this.toggle(c, true); }, remove(c) { this.toggle(c, false); }, toggle(c, v) { const s = set(), on = v === undefined ? !s.has(c) : !!v; if (on) s.add(c); else s.delete(c); el.className = [...s].join(' '); return on; } }; }
    setAttribute(k, v) { this.attrs[k] = String(v); }
    get textContent() { return this._t + this.children.map(c => c.textContent).join(''); }
    set textContent(v) { this.children.forEach(c => { c.parent = null; }); this.children = []; this._t = String(v); }
    set innerHTML(v) { this.textContent = ''; this.insertAdjacentHTML('beforeend', v); }
    insertAdjacentHTML(_, h) { for (const m of String(h).matchAll(/<span class="([^"]*)">([^<]*)<\/span>/g)) { const s = new El('span'); s.className = m[1]; s._t = m[2]; this.appendChild(s); } }
    appendChild(c) { c.remove(); c.parent = this; this.children.push(c); return c; }
    append(...cs) { cs.forEach(c => this.appendChild(c)); }
    remove() { if (this.parent) { const a = this.parent.children; a.splice(a.indexOf(this), 1); this.parent = null; } }
    get lastElementChild() { return this.children[this.children.length - 1]; }
    addEventListener(k, f) { (this.on[k] ||= []).push(f); }
    contains(e) { return this.children.includes(e); }
    focus() { doc.activeElement = this; }
    getBoundingClientRect() {
      if (this.row) return { width: this.w };
      let p = this; while (p && !p.row) p = p.parent;
      if (!p) return { width: 0 };
      if (/^gbar-next/.test(this.id)) return { width: 35 };
      if (this.classList.contains('gsep')) return { width: 1 };
      if (this.classList.contains('gsec')) return { width: this.textContent.length * 6 + 8 };
      return { width: 48 };
    }
  }
  const row = (id, w) => { const e = new El('div'); e.id = id; e.row = true; e.w = w; rows[id] = e; return e; };
  const elements = { '#favs': row('favs', 300), '#favs-y': row('favs-y', 300), '#fav-star': new El('button'), '#gbar-note': new El('span'), '#fav-hint': new El('span') };
  const doc = { createElement: tag => new El(tag), activeElement: null };
  const A = rows.favs, B = rows['favs-y'];
  // the saved list as main keeps it: Bots of the default login (account1) carry no acct, account2's carry 'account2'
  const makeBot = (id, sec, acct) => ({ id, url: 'https://grok.com/bot/' + id, name: id, isGroup: false, section: sec, ...(acct ? { acct } : {}) });
  const grok = { ...require('../src/grok-bots').empty(), bots: [makeBot('n1', '仕事'), makeBot('n2', '仕事'), makeBot('n3', '待機'), makeBot('y1', '仕事', 'account2'), ...Array.from({ length: 9 }, (_, i) => makeBot('y' + (i + 2), '仕事', 'account2')), makeBot('y20', '待機', 'account2')], pins: ['n1', 'y1'] };
  const box = { calls: [], gbar: null };
  const model = vm.createContext({ AC: require('../src/accounts'), GS: require('../src/gbar-sections'), GM: require('../src/gbar-mode'), GB: require('../src/grok-bots'),
    grok, settings: {}, gbRun: false, gbNote: '', save() {}, gbPush: () => box.gbar(model.gbView()) });
  vm.runInContext(main.match(/const gbView = \(\) => [^\n]*;/)[0].replace('const gbView', 'var gbView') + '\n' + main.match(/function gbSecToggle\(name\) \{[^\n]*\}/)[0], model);
  const mpb = new Proxy({}, { get: (_, k) => (k === 'onGbar' ? cb => { box.gbar = cb; } : (...a) => { box.calls.push([k, ...a]); if (k === 'gbarSecToggle') model.gbSecToggle(a[0]); }) });
  const ctx = vm.createContext({ $: s => elements[s], mpb, S: { favorites: [{ id: 7, url: 'https://example.com/', label: 'Ex', acct: 'B' }], focusedId: 21, panes: [{ id: 21, url: 'https://grok.com/bot/y3' }] },
    MOD: '⌘', renderSummaryTips() {}, URL, document: doc, setTimeout: () => 0, clearTimeout() {},
    GbarPresence: require('../src/gbar-presence'), GbarMode: require('../src/gbar-mode'), GbarPages: require('../src/gbar-pages'), GbarRows: R, GbarLongPress: require('../src/gbar-long-press'),
    getComputedStyle: e => (e.row ? { columnGap: '4px' } : { marginLeft: e.classList.contains('gsep') ? '4px' : '0', marginRight: e.classList.contains('gsep') ? '4px' : '0' }),
    ResizeObserver: class { constructor(cb) { this.cb = cb; } observe(x) { x.ro = this.cb; } } });
  vm.runInContext(ren.slice(ren.indexOf('function setTip('), ren.indexOf('function tipAttrs('))
    + ren.slice(ren.indexOf('// ---- short labels:'), ren.indexOf('function mk(id) {'))
    + ren.slice(ren.indexOf('// ---- お気に入りバー:'), ren.indexOf('// drop a link / URL text onto the favorites bar')), ctx);
  const run = s => vm.runInContext(s, ctx), lane = i => run(`gLanes[${i}]`);
  const ids = el => el.children.map(e => e.dataset.tip || e.className);
  const botsIn = L => [...new Set([...L.favs.children.slice(0, L.GP.pinN), ...L.GP.els].filter(e => /grok\.com\/bot\//.test(e.dataset.tipDetail || '')).map(e => e.dataset.tip))];   // a pin is in its section too
  box.gbar(model.gbView());
  const [LN, LY] = [lane(0), lane(1)];

  t('vm: two rows, A (#favs) above and B (#favs-y) below, each with its own 次へ', LN.acct === 'A' && LN.favs === A && LY.acct === 'B' && LY.favs === B
    && LN.next !== LY.next && LN.next.id === 'gbar-next' && LY.next.id === 'gbar-next-y' && typeof A.ro === 'function' && typeof B.ro === 'function');
  t('vm: each row holds its own account\'s pins and Bots only (pins first); no item carries an account badge (data-acct), its tooltip names its row\'s',
    J(botsIn(LN)) === J(['n1', 'n2']) && botsIn(LY)[0] === 'y1' && botsIn(LY).every(n => /^y/.test(n)) && botsIn(LY).length === 10
    && A.children[0].dataset.tip === 'n1' && B.children[0].dataset.tip === 'y1' && A.children[0].classList.contains('gpin') && B.children[0].classList.contains('gpin')
    && [[A, LN, 'A'], [B, LY, 'B']].every(([row, L, a]) => [...row.children, ...L.GP.els].every(e => !('acct' in e.dataset)
      && (!e.classList.contains('fav-btn') || !!e.id || new RegExp('(^|・)' + a + '・').test(e.dataset.tipDetail)))));
  t('vm: a favorite goes to its account\'s row', LY.GP.keys.includes('f7') && !LN.GP.keys.includes('f7'));
  t('vm: 待機 is collapsed by default in each row (a heading with the row\'s own count)', LN.GP.els.some(e => e.textContent === '待機 1▸') && LY.GP.els.some(e => e.textContent === '待機 1▸'));
  t('vm: rows page on their own: A fits (no 次へ), B has pages and its 次へ', LN.GP.pages.length === 1 && !A.contains(LN.next) && LY.GP.pages.length > 1 && B.contains(LY.next) && !A.contains(LY.next));
  { const nBefore = ids(A), yPage = LY.GP.page; LY.next.onclick();
    t('vm: B\'s 次へ turns B\'s page only', LY.GP.page === yPage + 1 && J(ids(A)) === J(nBefore) && LY.anchor && LN.anchor === null); }
  { const w = B.w; B.w = 2000; B.ro();
    t('vm: a wide B row: all in one page, its 次へ gone; A untouched', LY.GP.pages.length === 1 && !B.contains(LY.next));
    B.w = w; B.ro(); }
  t('vm: presence works in both rows (the focused pane\'s Bot is active in B)', LY.GP.els.find(e => e.dataset.tip === 'y3').classList.contains('gactive'));
  t('vm: both rows have items: no 未ログイン, no hint', !A.classList.contains('gnone') && !B.classList.contains('gnone') && elements['#fav-hint'].style.display === 'none');
  { const h = LY.GP.els.find(e => e.textContent === '待機 1▸'); h.onclick({ button: 0, stopPropagation() {} });
    t('vm: a heading click in the B row toggles that section (by name, as before) and the row is rebuilt', J(box.calls.at(-1)) === J(['gbarSecToggle', '待機'])
      && lane(1).GP.keys.includes('by20') && lane(0).GP.keys.includes('bn3')); }
  // B's Bots gone (not signed in / not read): its row says B 未ログイン; A as it was
  grok.bots = grok.bots.filter(b => !b.acct); grok.pins = ['n1']; ctx.S.favorites = []; box.gbar(model.gbView());
  t('vm: no B item while A has some: the B row is empty and says 未ログイン (.gnone), A as it was',
    B.classList.contains('gnone') && B.children.length === 0 && !A.classList.contains('gnone') && J(botsIn(lane(0))) === J(['n1', 'n2', 'n3']) && elements['#fav-hint'].style.display === 'none');
  grok.bots = []; grok.pins = []; box.gbar(model.gbView());
  t('vm: nothing at all: the hint (Grokボタンで…) instead, no row says 未ログイン', !A.classList.contains('gnone') && !B.classList.contains('gnone') && elements['#fav-hint'].style.display === '');
  grok.bots = [makeBot('y1', '仕事', 'account2')]; box.gbar(model.gbView());
  t('vm: only B has Bots: the A row says 未ログイン', A.classList.contains('gnone') && !B.classList.contains('gnone') && J(botsIn(lane(1))) === J(['y1']));
  { model.settings.defaultAcct = 'account2'; grok.bots = [makeBot('d1', '仕事'), makeBot('o1', '仕事', 'account1')]; box.gbar(model.gbView());
    t('vm: the default login is account2\'s: its Bots (no acct saved) go to the B row, account1\'s to A', J(botsIn(lane(0))) === J(['o1']) && J(botsIn(lane(1))) === J(['d1'])); }
}

// ---- wiring ----
t('index.html: the bar has two rows (A above, B below), no account badge leading them', /<div id="gbar-rows"><div class="grow"><div id="favs"[^>]*><\/div><\/div><div class="grow"><div id="favs-y"[^>]*><\/div><\/div><\/div>/.test(html)
  && !/class="acct/.test(html.slice(html.indexOf('<nav id="favbar"'), html.indexOf('</nav>'))));
t('index.html: gbar-rows.js before renderer.js', html.indexOf('<script src="gbar-rows.js">') > 0 && html.indexOf('<script src="gbar-rows.js">') < html.indexOf('<script src="renderer.js">'));
{ const favbarH = Number((css.match(/#favbar\{[^}]*height:(\d+)px/) || [])[1]), topH = Number((css.match(/#top\{[^}]*height:(\d+)px/) || [])[1]);
  const rowH = Number((css.match(/\.grow\{[^}]*height:(\d+)px/) || [])[1]), TOPBAR = Number((main.match(/const TOPBAR = (\d+);/) || [])[1]);
  t(`main.js TOPBAR (${TOPBAR}) = the top bar (${topH}) + the 2-row bar (${favbarH}); the two rows (${rowH} each) fit in it with its border`, TOPBAR === topH + favbarH && 2 * rowH + 1 <= favbarH && rowH >= 22 + 4);
  t('main.js: the pane area starts under the 2-row bar', /y: TOPBAR \+ GAP, w: w - 2 \* GAP, h: h - TOPBAR - GAP - BOTTOM_GAP/.test(main)); }
t('style.css: both rows get the bar\'s rules (modes / open / active frames / 次へ) and an empty row says A / B 未ログイン (text only)',
  ['#favs-y.gm-semi .fav-btn:not(#gbar-next-y)', '#favs-y.gm-compact .fav-btn:not(#gbar-next-y)', '#favs-y.gm-semi .gsec', '#favs-y .fav-btn.gopen', '#favs-y .fav-btn.gactive', '#gbar-next-y,#gbar-next{margin-left:auto', '#favs-y,#favs{display:flex']
    .every(s => css.includes(s)) && /#favs-y\.gnone::after,#favs\.gnone::after\{content:"A 未ログイン";[^}]*\}\s*#favs-y\.gnone::after\{content:"B 未ログイン"\}/.test(css)
    && !/\.gnone::after\{[^}]*border-radius/.test(css));
t('gbar-rows.js uses no app API (a helper)', !/mpb\.|ipcRenderer|require\(/.test(read('gbar-rows.js')));

console.log(bad ? `${bad} failed` : 'all passed'); process.exit(bad ? 1 : 0);
