// 2アカウント (grok.com の アカウント1 / アカウント2 を同時にログインしたままにする): pure rules, no electron (test/accounts.test.js).
// The login the app always had (Electron's default session) is never moved or copied: it belongs to ONE of the accounts
// (settings.defaultAcct; none saved = account1) and the other account lives in its own persistent partition (persist:acct-<id>).
// A pane / favorite / listed Bot is saved with `acct` only when it is NOT the default session's account: a file written before this
// (no `acct` anywhere) reads as before, every pane on the login it had. Changing settings.defaultAcct renames the default session's
// login; nothing is logged in again and no cookie moves.
const LIST = [
  { id: 'account1', letter: 'A', label: 'アカウント1', partition: 'persist:acct-account1' },
  { id: 'account2', letter: 'B', label: 'アカウント2', partition: 'persist:acct-account2' },
];
const IDS = LIST.map(a => a.id), DEFAULT = IDS[0];
const isAcct = v => typeof v === 'string' && IDS.includes(v);
const get = id => LIST.find(a => a.id === id) || LIST[0];
// the account the default session's login is (settings.defaultAcct; unusable / none = account1)
const def = settings => (settings && isAcct(settings.defaultAcct) ? settings.defaultAcct : DEFAULT);
// a saved value (pane spec / favorite / Bot) -> its account; none / unknown = the default session's
const of = (v, d) => (isAcct(v) ? v : isAcct(d) ? d : DEFAULT);
// what is written for an account: nothing for the default session's (as every file before), else its id
const saved = (acct, d) => (isAcct(acct) && acct !== of(undefined, d) ? acct : undefined);
// its session: '' = the default session (the login from before), else the account's own partition
const partition = (acct, d) => (of(acct, d) === of(undefined, d) ? '' : get(of(acct, d)).partition);
const other = acct => IDS.find(id => id !== acct) || DEFAULT;
// what the UI shows: the round badge's letter and the account's name
const view = acct => { const a = get(acct); return { id: a.id, letter: a.letter, label: a.label }; };
const badge = (v, settings) => view(of(v, def(settings))).letter;   // a saved value -> the badge's letter (A / B)

module.exports = { LIST, IDS, DEFAULT, isAcct, def, of, saved, partition, other, view, badge };
