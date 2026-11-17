// node test/accounts.test.js — 2アカウント (account1 / アカウント2 signed in to grok.com at the same time): the pure rules (src/accounts.js), what
// panes.json keeps (state-schema.js), the Bot list per account (grok-bots.js), and the main.js / renderer.js / style.css side as source contracts
// plus the real swapAcct / askAcct / acctSync run in a vm with the views stubbed. No Electron, no profile, no network; synthetic URLs only.
// Not covered here: the real sessions (cookies of a partition), the real grok.com sign-in and how the badges look in the running app.
const fs = require('fs'), path = require('path'), vm = require('vm');
const AC = require('../src/accounts');
const S = require('../src/state-schema');
const GB = require('../src/grok-bots');
const DL = require('../src/dock-layout');
const DG = require('../src/draft-guard');
const read = f => fs.readFileSync(path.join(__dirname, '..', 'src', f), 'utf8');
const main = read('main.js'), ren = read('renderer.js'), css = read('style.css');
let bad = 0; const t = (n, ok) => { if (!ok) bad++; console.log(ok ? 'ok  ' : 'FAIL', n); };
const J = JSON.stringify;
const fn = name => { const i = main.indexOf(`function ${name}(`); if (i < 0) return ''; let d = 0, j = main.indexOf('{', main.indexOf(')', i)); for (; j < main.length; j++) { if (main[j] === '{') d++; else if (main[j] === '}' && --d === 0) break; } return main.slice(i, j + 1); };

// ---- the rules ----
t('two accounts: account1 = A, アカウント2 = B, each with its own persistent partition', J(AC.LIST.map(a => [a.id, a.letter, a.label, a.partition]))
  === J([['account1', 'A', 'アカウント1', 'persist:acct-account1'], ['account2', 'B', 'アカウント2', 'persist:acct-account2']]) && new Set(AC.LIST.map(a => a.partition)).size === 2 && AC.LIST.every(a => /^persist:/.test(a.partition)));
t('the default session\'s account: settings.defaultAcct, none / unusable = account1', AC.def({}) === 'account1' && AC.def(null) === 'account1' && AC.def({ defaultAcct: 'account2' }) === 'account2' && AC.def({ defaultAcct: 'x' }) === 'account1' && AC.def({ defaultAcct: 7 }) === 'account1');
t('a saved value -> its account: none / unknown = the default session\'s', AC.of(undefined, 'account1') === 'account1' && AC.of(undefined, 'account2') === 'account2' && AC.of('account2', 'account1') === 'account2' && AC.of('__proto__', 'account2') === 'account2' && AC.of(null, 'bogus') === 'account1');
t('the session: the default one for the default account (the login from before is used as it is), the partition for the other',
  AC.partition('account1', 'account1') === '' && AC.partition(undefined, 'account1') === '' && AC.partition('account2', 'account1') === 'persist:acct-account2'
  && AC.partition('account2', 'account2') === '' && AC.partition('account1', 'account2') === 'persist:acct-account1' && AC.partition(undefined, 'account2') === '');
t('saved: nothing for the default session\'s account (a file from before reads the same), the id for the other', AC.saved('account1', 'account1') === undefined && AC.saved('account2', 'account1') === 'account2'
  && AC.saved('account2', 'account2') === undefined && AC.saved('account1', 'account2') === 'account1' && AC.saved('x', 'account1') === undefined && AC.saved(undefined, 'account2') === undefined);
t('badge letters / names; the other account', AC.badge(undefined, {}) === 'A' && AC.badge('account2', {}) === 'B' && AC.badge(undefined, { defaultAcct: 'account2' }) === 'B' && AC.badge('account1', { defaultAcct: 'account2' }) === 'A'
  && AC.view('account2').label === 'アカウント2' && AC.other('account1') === 'account2' && AC.other('account2') === 'account1' && AC.isAcct('account2') && !AC.isAcct('Account2') && !AC.isAcct(undefined));

// ---- panes.json ----
const A = 'https://a.example/', B = 'https://b.example/';
const spec = (url, x = {}) => ({ url, reloadMinutes: 0, name: '', color: 'none', muted: false, zoom: 1, zoomIndiv: false, sleep: true, ...x });
const win = panes => ({ layout: '2x2', focused: 0, panes, rows: [panes.length], window: { bounds: null, maximized: false } });
const file = (over = {}) => ({ schema: 1, windows: [win([spec(A), spec(B)])], favorites: [{ url: A, label: 'a' }], settings: { theme: 'dark' }, workspaces: {}, ...over });
{ const old = file(), r = S.migrate(old);
  t('a file from before (no acct anywhere): read as it is, no repair', r.ok && !r.fixes.length && J(r.doc.windows) === J(old.windows) && J(r.doc.favorites) === J(old.favorites) && J(r.doc.settings) === J(old.settings));
  const f = file({ windows: [win([spec(A), spec(B, { acct: 'account2' })])], favorites: [{ url: A, label: 'a', acct: 'account2' }], settings: { defaultAcct: 'account2' }, workspaces: { w: { layout: '2x1', panes: [spec(A, { acct: 'account1' })], rows: [1] } } });
  const k = S.migrate(f), back = S.parse(S.serialize(k.doc));
  t('acct of a pane / favorite / workspace pane and settings.defaultAcct are kept, and survive a write + read', k.ok && !k.fixes.length && k.doc.windows[0].panes[1].acct === 'account2' && k.doc.windows[0].panes[0].acct === undefined
    && k.doc.favorites[0].acct === 'account2' && k.doc.settings.defaultAcct === 'account2' && k.doc.workspaces.w.panes[0].acct === 'account1' && back.ok && J(back.doc) === J(k.doc)
    && JSON.parse(S.serialize(k.doc)).panes[1].acct === 'account2');
  const b = S.migrate(file({ windows: [win([spec(A, { acct: 'someone' }), spec(B, { acct: 5 })])], favorites: [{ url: A, label: 'a', acct: 'x' }], settings: { defaultAcct: 'root' }, workspaces: { w: { layout: '2x1', panes: [spec(A, { acct: '' })], rows: [1] } } }));
  t('an unknown account is never fatal: dropped as a repair (the pane is on the default login again), the rest kept', b.ok && b.fixes.length === 5 && b.doc.windows[0].panes.every(s => !('acct' in s)) && b.doc.windows[0].panes[1].url === B
    && !('acct' in b.doc.favorites[0]) && !('defaultAcct' in b.doc.settings) && !('acct' in b.doc.workspaces.w.panes[0]) && !/someone|root/.test(J(b.fixes)));
  const doc = S.migrate(file()).doc;
  t('validate (before every write) refuses an unknown account', S.validate({ ...doc, windows: [win([spec(A, { acct: 'x' })])] }).length === 1 && S.validate({ ...doc, favorites: [{ url: A, acct: 'x' }] }).length === 1
    && S.validate({ ...doc, settings: { defaultAcct: 'x' } }).length === 1 && S.validate({ ...doc, settings: { defaultAcct: 'account2' } }).length === 0); }

// ---- the Bot list ----
const bot = (id, x = {}) => ({ id, url: 'https://grok.com/bot/' + id, name: 'n-' + id, isGroup: false, section: '', order: 0, icon: '', ...x });
const items = ids => ({ items: ids.map(id => ({ t: 'bot', href: '/bot/' + id, name: 'n-' + id })) });
{ const g0 = GB.clean({ bots: [bot('n1'), bot('y1', { acct: 'account2' }), bot('z', { acct: 'who' })], aliases: {}, pins: ['y1'], at: 1 }).grok;
  t('clean: a Bot keeps a known account, an unknown one is dropped (the default login\'s); a list from before is unchanged', J(g0.bots.map(b => b.acct || '-')) === J(['-', 'account2', '-'])
    && GB.valid({ bots: [{ ...bot('a') }], aliases: {}, pins: [], at: 0 }) && GB.valid(g0));
  const A = { acct: 'account1', def: 'account1' }, B = { acct: 'account2', def: 'account1' };
  const g1 = { bots: [{ ...bot('n1') }, { ...bot('n2', { order: 1 }) }], aliases: { n1: '私の名前' }, pins: ['n2'], at: 1 };
  const m1 = GB.merge(g1, GB.parse(items(['y1', 'y2']), GB.part(g1, 'account2', 'account1')), 9, B);
  t('merge (account2 read): its Bots are added with acct, account1\'s list / names / pins are untouched', J(m1.grok.bots.map(b => b.id + ':' + (b.acct || '-'))) === J(['n1:-', 'n2:-', 'y1:account2', 'y2:account2'])
    && m1.added === 2 && m1.removed === 0 && J(m1.grok.pins) === J(['n2']) && m1.grok.aliases.n1 === '私の名前' && m1.grok.at === 9 && GB.valid(m1.grok));
  const m2 = GB.merge(m1.grok, GB.parse(items(['n2', 'n3']), GB.part(m1.grok, 'account1', 'account1')), 10, A);
  t('merge (account1 read): only account1\'s Bots are replaced (+1 −1), account2\'s stay; a pin of a Bot gone goes', J(m2.grok.bots.map(b => b.id + ':' + (b.acct || '-'))) === J(['n2:-', 'n3:-', 'y1:account2', 'y2:account2'])
    && m2.added === 1 && m2.removed === 1 && J(m2.grok.pins) === J(['n2']) && J(m2.grok.bots.map(b => b.order)) === J([0, 1, 2, 3]));
  const m3 = GB.merge(m2.grok, GB.parse(items(['y2']), GB.part(m2.grok, 'account2', 'account1')), 11, B);
  t('merge (account2 read again): account2\'s Bot gone from the page leaves, account1\'s are not counted as removed', J(m3.grok.bots.map(b => b.id)) === J(['n2', 'n3', 'y2']) && m3.removed === 1 && m3.added === 0);
  const m4 = GB.merge(m2.grok, GB.parse(items(['n2', 'y1']), GB.part(m2.grok, 'account1', 'account1')), 12, A);
  t('a Bot id is listed once: under the account read last', J(m4.grok.bots.map(b => b.id + ':' + (b.acct || '-'))) === J(['n2:-', 'y1:-', 'y2:account2']));
  const D = { acct: 'account2', def: 'account2' };
  t('the default login is account2: its read is saved without acct, account1\'s with', J(GB.merge(GB.empty(), GB.parse(items(['a'])), 1, D).grok.bots.map(b => b.acct || '-')) === J(['-'])
    && J(GB.merge(GB.empty(), GB.parse(items(['a'])), 1, { acct: 'account1', def: 'account2' }).grok.bots.map(b => b.acct || '-')) === J(['account1']));
  t('merge without an account (as before): the whole list is replaced', J(GB.merge(g1, GB.parse(items(['q'])), 3).grok.bots.map(b => b.id)) === J(['q']));
  t('part: one account\'s Bots alone (none saved = the default login\'s)', J(GB.part(m2.grok, 'account2', 'account1').bots.map(b => b.id)) === J(['y1', 'y2']) && J(GB.part(m2.grok, 'account1', 'account1').bots.map(b => b.id)) === J(['n2', 'n3'])
    && J(GB.part(m2.grok, 'account2', 'account2').bots.map(b => b.id)) === J(['n2', 'n3', 'y1', 'y2']) && GB.part(null, 'account2', 'account1').bots.length === 0);
  const closed = GB.parse({ items: [{ t: 'sec', text: 'チーム', closed: true }] }, GB.part({ ...m2.grok, bots: m2.grok.bots.map(b => ({ ...b, section: 'チーム' })) }, 'account2', 'account1'));
  t('a section closed in grok.com keeps only the Bots of the account being read', J(closed.map(b => b.id)) === J(['y1', 'y2']));
  const v = GB.view({ ...m2.grok, pins: ['y1'] });
  t('view: each item says its account (none = the default login\'s); the accounts never share a section', J(v.sections.map(s => s.items.map(b => b.acct || '-'))) === J([['-', '-'], ['account2', 'account2']]) && v.pins[0].acct === 'account2' && !('acct' in v.sections[0].items[0])); }

// ---- the input guard ----
{ const d = DG.dialogText('ACCT', [{ label: 'x', codes: ['PRESENT'] }]);
  t('switching a pane\'s account asks like the other operations when the page holds input (default = やめる)', /アカウントを切り替えると/.test(d.message + d.detail) && d.buttons.includes('切り替える') && d.actions[d.defaultId] === 'cancel' && d.actions[d.cancelId] === 'cancel'); }

// ---- main.js ----
t('main: the other account\'s session is its partition, set up once like the default session; nothing is cleared or copied', /session\.fromPartition\(part\)/.test(fn('acctSes')) && /if \(paneSesSetup\) paneSesSetup\(ses\); acctSesMap\.set\(part, ses\);/.test(fn('acctSes'))
  && /const part = AC\.partition\(acct, defAcct\(\)\); if \(!part\) return undefined;/.test(fn('acctSes')) && /paneSesSetup\(session\.defaultSession\);\s*\n\s*startup\(\);/.test(main)
  && /paneSesSetup = ses => \{\s*\n\s*ses\.setUserAgent\(chromeUA\(\)\);\s*\n\s*ses\.setPermissionRequestHandler\(/.test(main) && /\n  ses\.setPermissionCheckHandler\(/.test(main) && /\n  ses\.on\('will-download'/.test(main)
  && !/session\.defaultSession\.(set|on)/.test(main) && (main.match(/clearStorageData|clearCache\(|cookies\./g) || []).length === 2 && !/acct[^\n]*clearStorageData|defaultSession\.clear/.test(main));
t('main: a pane view, its background check and the Bot list read each use the account\'s session', /const acct = AC\.of\(spec\.acct, defAcct\(\)\);/.test(fn('addPane')) && /\.\.\.acctPref\(acct\), contextIsolation: true/.test(fn('addPane'))
  && /view, acct, part: AC\.partition\(acct, defAcct\(\)\), url:/.test(fn('addPane')) && /webPreferences: \{ \.\.\.acctPref\(p\.acct\),/.test(fn('probePane')) && /webPreferences: \{ \.\.\.acctPref\(acct\), contextIsolation: true/.test(fn('grokRefresh'))
  && /for \(const a of gbAccts\(\)\) out\.push\(await read\(a\)\);/.test(fn('grokRefresh')) && /GB\.parse\(o, GB\.part\(grok, acct, defAcct\(\)\)\)/.test(fn('grokRefresh')));
t('main: saved in panes.json with the pane (window save, workspace, 複製, ⌘⇧T) and with a favorite', /sleep: p\.sleepOn !== false, \.\.\.acctSave\(p\.acct\) \}\);/.test(main) && /\.\.\.acctSave\(acct\) \}\)\), grok, settings, workspaces/.test(fn('stateDoc'))
  && /\.\.\.\(AC\.isAcct\(f\.acct\) \? \{ acct: f\.acct \} : \{\}\) \}\)\);/.test(fn('startup')) && require('../src/closed-panes').SPEC_KEYS.includes('acct'));
t('main: chosen per pane (⋯ / tab menu, through the input guard), for a new pane (＋ right-click, ファイル menu) and the default login in 設定',
  (main.match(/submenu: acctItems\(p\.acct, a => askAcct\(p, a\)\)/g) || []).length === 2 && /guardRun\('ACCT', onlyPane\(p\)/.test(fn('askAcct')) && /^on\('add-menu', \(\) => addMenu\(\)\);/m.test(main)
  && /click: \(\) => newPane\('', a\.id\)/.test(fn('addMenu')) && /click: \(\) => cur\(\)\?\.newPane\('', a\.id\)/.test(fn('buildMenu')) && /checked: defAcct\(\) === a\.id, click: \(\) => setDefaultAcct\(a\.id\)/.test(fn('buildMenu'))
  && /dialog\.showMessageBox\(/.test(fn('setDefaultAcct')) && /if \(response === 0\) \{ settings\.defaultAcct = a; ctxs\.forEach\(c => c\.acctSync\(\)\); save\(\); gbPush\(\); \}/.test(fn('setDefaultAcct')));
t('main: the badge letter goes to the UI with each pane, favorite and Bot', /acct: AC\.view\(p\.acct\)\.letter, acctName: AC\.view\(p\.acct\)\.label,/.test(main) && /favorites: favorites\.map\(f => \(\{ \.\.\.f, acct: AC\.badge\(f\.acct, settings\) \}\)\)/.test(main)
  && (main.match(/acct: AC\.badge\(it\.acct, settings\)/g) || []).length === 2);
t('ipc: add-menu is a window-UI channel without arguments; preload sends it', /'add-menu': \{ roles: CHROME \}/.test(read('ipc-policy.js')) && /addMenu: \(\) => send\('add-menu'\)/.test(read('preload.js')) && /\$\('#add'\)\.oncontextmenu = e => \{ e\.preventDefault\(\); mpb\.addMenu\(\); \};/.test(ren));

// ---- swapAcct / askAcct / acctSync, run (views stubbed, the real dock-layout grid) ----
function setup(rows, { stacks = null, def = 'account1', focused = 0 } = {}) {
  const box = { disposed: [], adds: [], guards: [], drafts: [], saves: 0, allow: true };
  let id = 1;
  const pane = (acct, x = {}) => ({ id: id++, acct, part: AC.partition(acct, ctx ? AC.def(ctx.settings) : def), url: 'https://grok.com/bot/b' + id, name: 'p' + id, draftId: 'd' + id, ...x });
  let ctx = null;
  ctx = vm.createContext({ AC, DL, MAX: 10, settings: { defaultAcct: def }, panes: [], focused, maximizedId: null, maxMode: null, rowLens: rows, stackLens: stacks, dock: null, dockEnd() {},
    defAcct: () => AC.def(ctx.settings), getRows: () => ctx.rowLens, getStacks: () => ctx.stackLens, paneSpec: p => ({ url: p.url, name: p.name, ...(AC.saved(p.acct, AC.def(ctx.settings)) ? { acct: p.acct } : {}) }),
    draftStore: { remove: d => box.drafts.push(d) }, disposePane: p => { p.disposed = true; box.disposed.push(p.id); },
    addPane: s => { if (ctx.panes.length >= 10) return null; const acct = AC.of(s.acct, AC.def(ctx.settings)), p = pane(acct, { url: s.url, name: s.name }); box.adds.push(s); ctx.panes.push(p); ctx.rowLens = null; ctx.stackLens = null; return p; },
    newPane() {}, updateBadge() {}, relayout() {}, save: () => box.saves++, sendState() {}, onlyPane: p => () => (ctx.panes.includes(p) ? [p] : []),
    guardRun: (op, targets, run) => { box.guards.push(op); if (box.allow) run(targets()); } });
  vm.runInContext('var paneGrid = () => DL.toGrid(getRows(), getStacks(), panes.map(p => p.id));\n' + fn('applyGrid') + '\n' + fn('swapAcct') + '\n' + fn('askAcct') + '\n' + fn('acctSync'), ctx);
  const n = rows.reduce((a, b) => a + b, 0);
  for (let i = 0; i < n; i++) ctx.panes.push(pane('account1'));
  return { box, ctx, grid: () => J(DL.toGrid(ctx.rowLens, ctx.stackLens, ctx.panes.map(p => p.id))) };
}
{ const { box, ctx, grid } = setup([2, 1], { focused: 1 }), [a, b, c] = ctx.panes, g0 = grid();
  ctx.askAcct(b, 'account2');
  const q = ctx.panes[1];
  t('switch: through the guard; the pane is made again in the other account with its URL / name, in the same place of the rows', J(box.guards) === J(['ACCT']) && q !== b && q.acct === 'account2' && q.part === 'persist:acct-account2'
    && q.url === b.url && q.name === b.name && box.adds.length === 1 && box.adds[0].acct === 'account2' && ctx.panes[0] === a && ctx.panes[2] === c && J(ctx.rowLens) === J([2, 1]) && grid() === g0.replace(String(b.id), String(q.id)));
  t('switch: the old view is closed, its draft forgotten, the focus stays on that place, saved', J(box.disposed) === J([b.id]) && J(box.drafts) === J([b.draftId]) && ctx.focused === 1 && box.saves === 1);
  ctx.askAcct(q, 'account2'); ctx.askAcct(q, 'nobody'); ctx.askAcct(null, 'account2');
  t('switch to the same / an unknown account or no pane: nothing', box.guards.length === 1 && ctx.panes[1] === q);
  box.allow = false; ctx.askAcct(q, 'account1');
  t('switch refused in the guard (やめる): the pane stays as it is', ctx.panes[1] === q && q.acct === 'account2' && box.disposed.length === 1); }
{ const { box, ctx } = setup([3], { focused: 0 }), [a, b, c] = ctx.panes; ctx.maximizedId = c.id; ctx.maxMode = 'left';
  let got = null; ctx.askAcct(c, 'account2', { url: 'https://grok.com/bot/other' }, p => { got = p; });
  t('switch with another URL (a Bot / favorite of the other account opened in this pane): that URL, the caller gets the new pane; focus elsewhere and the half-maximize are kept',
    got === ctx.panes[2] && got.url === 'https://grok.com/bot/other' && got.acct === 'account2' && ctx.focused === 0 && ctx.panes[0] === a && ctx.maximizedId === got.id && ctx.maxMode === 'left'); }
{ const { ctx, grid } = setup([2, 1], { stacks: [[2], [1]] }), [a, b] = ctx.panes; ctx.askAcct(a, 'account2');
  t('switch of a stacked pane: it keeps its place in the stack', J(ctx.stackLens) === J([[2], [1]]) && ctx.panes[0].acct === 'account2' && ctx.panes[1] === b && ctx.panes.length === 3 && JSON.parse(grid())[0][0][0] === ctx.panes[0].id); }
{ const { ctx } = setup([1]); const a = ctx.panes[0]; ctx.askAcct(a, 'account2');
  t('switch of the only pane', ctx.panes.length === 1 && ctx.panes[0] !== a && ctx.panes[0].acct === 'account2' && ctx.focused === 0); }
{ const { box, ctx } = setup([5, 5]); const p = ctx.panes[9]; ctx.askAcct(p, 'account2');
  t('switch at 10 panes: still 10, the tenth is the new one', ctx.panes.length === 10 && ctx.panes[9].acct === 'account2' && ctx.panes[9] !== p && box.adds.length === 1); }
{ const { box, ctx } = setup([2, 1]), [a, b, c] = ctx.panes; ctx.askAcct(b, 'account2'); const y = ctx.panes[1]; box.disposed.length = 0; box.adds.length = 0;
  ctx.settings.defaultAcct = 'account2'; ctx.acctSync();
  t('the default login is now account2: panes on the default session keep their view and are account2\'s; the pane from account2\'s partition is made again on the default login',
    ctx.panes[0] === a && ctx.panes[2] === c && a.acct === 'account2' && c.acct === 'account2' && a.part === '' && J(box.disposed) === J([y.id]) && ctx.panes[1] !== y && ctx.panes[1].acct === 'account2' && ctx.panes[1].part === ''
    && ctx.panes.length === 3 && !('acct' in box.adds[0] && AC.saved(box.adds[0].acct, 'account2')));
  box.disposed.length = 0; ctx.acctSync();
  t('acctSync again: nothing left to do', !box.disposed.length); }

// ---- the UI ----
t('renderer: the header badge is the first thing in a pane\'s header (far from the count badge / ✕ at its right end), filled from the state',
  /<div class="head" draggable="true">\s*\n\s*<span class="acct"><\/span>\s*\n\s*<span class="fav"><\/span>/.test(ren) && ren.indexOf('<span class="acct">') < ren.indexOf('class="badge"')
  && /a\.textContent = acctLetter\(p\.acct\); a\.className = 'acct acct-' \+ acctLetter\(p\.acct\);/.test(ren));
t('renderer: no Bot / pin / favorite of the bar carries an account badge (its row says which); the tooltip still names it', !/dataset\.acct/.test(ren)
  && /`\$\{acctLetter\(b\.acct\)\}・/.test(ren) && /`\$\{acctLetter\(f\.acct\)\}・/.test(ren) && /const acctLetter = v => \(v === 'B' \? 'B' : 'A'\);/.test(ren));
{ const col = sel => (css.match(new RegExp(sel.replace(/[.[\]"=:]/g, '\\$&') + '\\{background:(#[0-9a-f]{6})')) || [])[1];
  const n = col('.acct-A'), y = col('.acct-B'), rgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16)), dist = (a, b) => Math.hypot(...rgb(a).map((v, i) => v - rgb(b)[i]));
  t(`style: the header's round badge, two clearly different colours (A ${n} / B ${y}); not the count badge's red; none drawn in the bar`, !!n && !!y && dist(n, y) > 200
    && dist(n, '#ff453a') > 120 && dist(y, '#ff453a') > 120 && /\.acct\{[^}]*border-radius:50%/.test(css) && !/\.acct\{[^}]*position:absolute/.test(css) && !/data-acct/.test(css)); }

console.log(bad ? bad + ' failed' : 'all passed'); process.exit(bad ? 1 : 0);
