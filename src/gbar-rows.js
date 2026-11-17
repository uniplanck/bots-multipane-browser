// Grokバー 2段 (xG-Bots_261116_003): the bar has one row per account, A (account1) above and B (アカウント2) below. Pure; shared by the
// renderer's plain script (index.html, before renderer.js) and the Node tests. Items carry their badge letter in `acct` (main: AC.badge); none /
// anything else is A, as the item badges (renderer acctLetter). Each row keeps the bar's own order: its pins, its favorites, then the sections
// (a section's Bots split by account; a section left with none is not in that row). Nothing here measures or pages: each row does that itself.
const GbarRows = (() => {
  const ROWS = ['A', 'B'];
  const letter = v => (v === 'B' ? 'B' : 'A');
  const arr = v => (Array.isArray(v) ? v : []);
  function split(pins, favs, sections) {
    const out = {};
    ROWS.forEach(r => { out[r] = { pins: [], favs: [], sections: [] }; });
    arr(pins).forEach(b => out[letter(b && b.acct)].pins.push(b));
    arr(favs).forEach(f => out[letter(f && f.acct)].favs.push(f));
    arr(sections).forEach(s => ROWS.forEach(r => {
      const items = arr(s && s.items).filter(b => letter(b && b.acct) === r);
      if (items.length) out[r].sections.push({ ...s, items });
    }));
    return out;
  }
  // how many items a row holds (a collapsed section's Bots count: its heading stands for them)
  const count = row => row.pins.length + row.favs.length + row.sections.reduce((a, s) => a + s.items.length, 0);
  return { ROWS, letter, split, count };
})();
if (typeof module === 'object' && module.exports) module.exports = GbarRows;
