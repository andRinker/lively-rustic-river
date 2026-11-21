/**
 * Prep Prepper starter. Paste this once. You should not need to edit it again.
 *
 * What it does, in plain words:
 *   - Prep Prepper's real code is kept inside this script's saved settings (not in
 *     the editor). Your Tasks sheet and everything on it are untouched by updates.
 *   - "Prep Prepper > Check for updates" looks at the public GitHub page
 *     github.com/andRinker/lively-rustic-river, tells you what changed, and
 *     installs the new code only after you say yes.
 *   - "Undo last update" puts the previous version back.
 *
 * What it never does: send anything about your email, Drive, or students anywhere.
 * The only outside request is downloading the code (two public files).
 */

const PP_REPO = 'andRinker/lively-rustic-river';
const PP_BRANCH = 'main';
const PP_RAW = 'https://raw.githubusercontent.com/' + PP_REPO + '/' + PP_BRANCH + '/release/';
const PP_CHUNK = 2500;        // saved settings hold ~9 KB per entry, so code is stored in small pieces
const PP_MENU_SLOTS = 12;     // how many menu items the app may add
const PP_P = 'PPU_';          // prefix for everything the starter saves

// Which generation of starter this is. An update that needs a newer starter than the one
// in your Apps Script is refused with a plain message instead of half-working.
const PP_STARTER = 1;

let ppApp_;                   // the loaded app, remembered for the length of one run

// ---------- Permissions ----------

/**
 * Never run. It exists so Google asks for every permission Prep Prepper's code can
 * need on the first authorization, instead of stopping an update halfway.
 */
function declareAccess_() {
  GmailApp.search('in:inbox', 0, 1);
  GmailApp.getThreadById('x');
  DriveApp.searchFiles('trashed = false');
  SpreadsheetApp.openById('x');
  UrlFetchApp.fetch('https://raw.githubusercontent.com/');
  ScriptApp.getProjectTriggers();
  Session.getActiveUser().getEmail();
}

// ---------- Menu ----------

function onOpen() {
  try {
    buildMenu_();
  } catch (e) {
    SpreadsheetApp.getUi().createMenu('Prep Prepper').addItem('Install Prep Prepper', 'ppCheckForUpdates').addToUi();
  }
}

function buildMenu_() {
  const app = loadApp_();
  const props = PropertiesService.getScriptProperties().getProperties();
  const menu = SpreadsheetApp.getUi().createMenu('Prep Prepper');
  if (app) {
    app.menu.slice(0, PP_MENU_SLOTS).forEach((item, i) => menu.addItem(item[0], 'ppMenu' + i));
    menu.addSeparator();
    const installed = installedVersion_();
    const ready = props[PP_P + 'LATEST'] && props[PP_P + 'LATEST'] !== props[PP_P + 'SKIP'] &&
      cmpVersion_(props[PP_P + 'LATEST'], installed) > 0;
    menu.addItem(ready ? 'Check for updates (new version ready)' : 'Check for updates', 'ppCheckForUpdates');
    if (props[PP_P + 'UNDO'] === '1') menu.addItem('Undo last update', 'ppUndoUpdate');
  } else {
    menu.addItem('Install Prep Prepper', 'ppCheckForUpdates');
  }
  menu.addToUi();
}

function runMenu_(i) {
  const app = loadApp_();
  if (!app || !app.menu[i]) {
    SpreadsheetApp.getUi().alert('Prep Prepper is not installed yet. Click Prep Prepper > Install Prep Prepper.');
    return;
  }
  app.menu[i][1]();
}

function ppMenu0() { runMenu_(0); }
function ppMenu1() { runMenu_(1); }
function ppMenu2() { runMenu_(2); }
function ppMenu3() { runMenu_(3); }
function ppMenu4() { runMenu_(4); }
function ppMenu5() { runMenu_(5); }
function ppMenu6() { runMenu_(6); }
function ppMenu7() { runMenu_(7); }
function ppMenu8() { runMenu_(8); }
function ppMenu9() { runMenu_(9); }
function ppMenu10() { runMenu_(10); }
function ppMenu11() { runMenu_(11); }

/** Prep Prepper > Check for updates (and the first install). */
function ppCheckForUpdates() {
  const ui = SpreadsheetApp.getUi();
  const status = updateStatus_(true);
  if (status.error) {
    ui.alert('Could not check for updates', status.error + '\n\nNothing was changed.', ui.ButtonSet.OK);
    return;
  }
  const first = status.installed === 'none';
  if (!first && !status.newer) {
    ui.alert('Prep Prepper is up to date', 'You have version ' + status.installed + ', the newest one.', ui.ButtonSet.OK);
    return;
  }
  const lines = status.notes.map(n => '• ' + n).join('\n');
  const title = first ? 'Install Prep Prepper ' + status.latest + '?' : 'Update to version ' + status.latest + '?';
  if (ui.alert(title, lines + '\n\nYour tasks and settings stay exactly as they are.', ui.ButtonSet.YES_NO) !== ui.Button.YES) return;
  try {
    const result = installLatest_();
    buildMenu_();
    ui.alert('Done', 'Prep Prepper is now on version ' + result.installed + '.' +
      (first ? '\n\nNext: click Prep Prepper > 1. Set up.' : '\n\nReload your Prep Prepper page to see it.') +
      '\n\nIf anything looks wrong, Prep Prepper > Undo last update puts the old version back.', ui.ButtonSet.OK);
  } catch (e) {
    ui.alert('Update failed. Nothing was changed.', String(e.message || e), ui.ButtonSet.OK);
  }
}

/** Prep Prepper > Undo last update. */
function ppUndoUpdate() {
  const ui = SpreadsheetApp.getUi();
  try {
    const before = installedVersion_();
    if (ui.alert('Go back to the previous version?', 'You are on version ' + before + '. Your tasks stay as they are.', ui.ButtonSet.YES_NO) !== ui.Button.YES) return;
    const result = undoLast_();
    buildMenu_();
    ui.alert('Back on version ' + result.installed + '. Reload your Prep Prepper page.');
  } catch (e) {
    ui.alert('Could not undo', String(e.message || e), ui.ButtonSet.OK);
  }
}

// ---------- Web page and hourly job ----------

function doGet(e) {
  const app = loadApp_();
  if (!app) {
    return HtmlService.createHtmlOutput(
      '<p style="font:16px system-ui;padding:24px">Prep Prepper is not installed yet. ' +
      'Open your Prep Prepper sheet and click <b>Prep Prepper &gt; Install Prep Prepper</b>.</p>'
    );
  }
  return app.doGet(e);
}

/** The one door the web page uses. Only the actions the app lists, plus the two update actions. */
function api(name, args) {
  if (name === 'pp.updateStatus') return updateStatus_(false);
  if (name === 'pp.installUpdate') return installLatest_();
  const app = loadApp_();
  if (!app) throw new Error('Prep Prepper is not installed yet. In the sheet, click Prep Prepper > Install Prep Prepper.');
  if (!Object.prototype.hasOwnProperty.call(app.api, name)) throw new Error('Unknown action: ' + name);
  return app.api[name].apply(null, args || []);
}

/** Runs every hour: note whether an update exists, then do the app's hourly scan. */
function ppTick() {
  try { updateStatus_(true); } catch (e) { /* offline is fine */ }
  const app = loadApp_();
  if (app) app.tick();
}

/** Older versions ran an hourly job named scanAll. Keep any leftover trigger working. */
function scanAll() { ppTick(); }

// ---------- Loading the saved code ----------

function loadApp_() {
  if (ppApp_ !== undefined) return ppApp_;
  ppApp_ = null;
  const bundle = readSlot_(PropertiesService.getScriptProperties().getProperties(), currentSlot_());
  if (bundle) {
    try { ppApp_ = compile_(bundle); } catch (e) { ppApp_ = null; }
  }
  return ppApp_;
}

/** Turns downloaded code into a working app, or throws if it is broken. */
function compile_(bundle) {
  const PP = {
    version: bundle.version,
    starter: PP_STARTER,
    html: function (name) {
      const file = /\.html$/.test(name) ? name : name + '.html';
      if (typeof bundle.files[file] !== 'string') throw new Error('Missing page: ' + name);
      return bundle.files[file];
    },
  };
  const app = new Function('PP', bundle.files['Code.js'] + '\n;return PP_APP;')(PP);
  const ok = app && Array.isArray(app.menu) && typeof app.doGet === 'function' &&
    typeof app.tick === 'function' && app.api && typeof app.api === 'object' &&
    app.menu.every(m => Array.isArray(m) && typeof m[0] === 'string' && typeof m[1] === 'function');
  if (!ok) throw new Error('The downloaded code is not shaped the way the starter expects.');
  return app;
}

function currentSlot_() {
  const slot = PropertiesService.getScriptProperties().getProperty(PP_P + 'SLOT');
  return slot === 'A' || slot === 'B' ? slot : '';
}

function installedVersion_() {
  const slot = currentSlot_();
  const bundle = slot ? readSlot_(PropertiesService.getScriptProperties().getProperties(), slot) : null;
  return bundle ? bundle.version : '';
}

// ---------- Saving code in script properties (two slots: current and previous) ----------

function readSlot_(all, slot) {
  if (!slot) return null;
  const n = Number(all[PP_P + slot + '_n']);
  if (!n) return null;
  let text = '';
  for (let i = 0; i < n; i++) {
    const part = all[PP_P + slot + '_' + i];
    if (part === undefined) return null;
    text += part;
  }
  try {
    const bundle = JSON.parse(text);
    return hashOf_(bundle.files) === bundle.sha256 ? bundle : null;
  } catch (e) {
    return null;
  }
}

function writeSlot_(slot, bundle) {
  const props = PropertiesService.getScriptProperties();
  const old = props.getProperties();
  const text = JSON.stringify(bundle);
  const out = {};
  let n = 0;
  for (let i = 0; i < text.length; n++) {
    let end = Math.min(i + PP_CHUNK, text.length);
    const last = text.charCodeAt(end - 1);
    if (end < text.length && last >= 0xD800 && last <= 0xDBFF) end--; // never split an emoji
    out[PP_P + slot + '_' + n] = text.slice(i, end);
    i = end;
  }
  out[PP_P + slot + '_n'] = String(n);
  props.setProperties(out, false);
  for (let i = n; old[PP_P + slot + '_' + i] !== undefined; i++) props.deleteProperty(PP_P + slot + '_' + i);
}

function sha256_(text) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, text, Utilities.Charset.UTF_8)
    .map(b => ('0' + ((b + 256) % 256).toString(16)).slice(-2)).join('');
}

function hashOf_(files) {
  return sha256_(files['Code.js'] + '\u0000' + files['Index.html']);
}

// ---------- Checking, installing, undoing ----------

function cmpVersion_(a, b) {
  const x = String(a).split('.').map(Number);
  const y = String(b).split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0) ? 1 : -1;
  }
  return 0;
}

function fetchJson_(url) {
  let res;
  try {
    res = UrlFetchApp.fetch(url, { muteHttpExceptions: true, followRedirects: true });
  } catch (e) {
    throw new Error('This account could not reach GitHub from Google Sheets (' + (e.message || e) +
      '). Tell Claude exactly what this says.');
  }
  if (res.getResponseCode() !== 200) {
    throw new Error('GitHub answered ' + res.getResponseCode() + ' for ' + url.replace(PP_RAW, '').split('?')[0] + '.');
  }
  return JSON.parse(res.getContentText());
}

/** The small "what is the newest version and what changed" file. Cached for 5 minutes unless fresh. */
function fetchManifest_(fresh) {
  const cache = CacheService.getScriptCache();
  if (!fresh) {
    const hit = cache.get(PP_P + 'MANIFEST');
    if (hit) return JSON.parse(hit);
  }
  const m = fetchJson_(PP_RAW + 'manifest.json?t=' + Date.now());
  if (!/^\d+\.\d+\.\d+$/.test(String(m.version)) || !/^[0-9a-f]{64}$/.test(String(m.sha256)) || !Array.isArray(m.history)) {
    throw new Error('The update information on GitHub looks wrong, so nothing was changed.');
  }
  cache.put(PP_P + 'MANIFEST', JSON.stringify(m), 300);
  return m;
}

function requireStarter_(m) {
  if (Number(m.needsStarter || 1) > PP_STARTER) {
    throw new Error('Version ' + m.version + ' needs a newer Prep Prepper starter than the one in your Apps Script. ' +
      'Nothing was changed and your current version keeps working. Ask Claude for the new starter file.');
  }
}

/** What the page and the menu show. Never throws; problems come back as status.error. */
function updateStatus_(fresh) {
  const installed = installedVersion_();
  const status = { installed: installed || 'none', latest: '', available: false, newer: false, notes: [], url: '', error: '' };
  try { status.url = ScriptApp.getService().getUrl() || ''; } catch (e) { /* not deployed yet */ }
  try {
    const m = fetchManifest_(fresh);
    requireStarter_(m);
    const props = PropertiesService.getScriptProperties();
    props.setProperty(PP_P + 'LATEST', m.version);
    status.latest = m.version;
    status.newer = !installed || cmpVersion_(m.version, installed) > 0;
    status.available = status.newer && props.getProperty(PP_P + 'SKIP') !== m.version;
    const entries = installed ? m.history.filter(h => cmpVersion_(h.version, installed) > 0) : m.history.slice(0, 1);
    entries.forEach(h => (h.notes || []).forEach(n => status.notes.push(String(n))));
  } catch (e) {
    status.error = String(e.message || e);
  }
  return status;
}

/** Downloads the newest code, checks it, and switches to it only if every check passes. */
function installLatest_() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) throw new Error('Another update is running. Try again in a minute.');
  try {
    const m = fetchManifest_(true);
    requireStarter_(m);
    const bundle = fetchJson_(PP_RAW + 'bundle.json?v=' + m.version);
    if (bundle.version !== m.version || bundle.sha256 !== m.sha256 || !bundle.files || hashOf_(bundle.files) !== m.sha256) {
      throw new Error('The download did not match what GitHub said it should be.');
    }
    compile_(bundle); // refuses code that will not even load

    const props = PropertiesService.getScriptProperties();
    const current = currentSlot_();
    const target = current === 'A' ? 'B' : 'A';
    const hadPrevious = !!readSlot_(props.getProperties(), current);
    writeSlot_(target, bundle);
    const saved = readSlot_(props.getProperties(), target);
    if (!saved || saved.sha256 !== m.sha256) throw new Error('The update could not be saved.');

    props.setProperties({ [PP_P + 'SLOT']: target, [PP_P + 'UNDO']: hadPrevious ? '1' : '', [PP_P + 'SKIP']: '', [PP_P + 'LATEST']: m.version }, false);
    migrateTriggers_();
    ppApp_ = undefined;
    return { installed: m.version };
  } finally {
    lock.releaseLock();
  }
}

function undoLast_() {
  const props = PropertiesService.getScriptProperties();
  const all = props.getProperties();
  if (all[PP_P + 'UNDO'] !== '1') throw new Error('There is no earlier version to go back to.');
  const current = currentSlot_();
  const other = current === 'A' ? 'B' : 'A';
  const previous = readSlot_(all, other);
  if (!previous) throw new Error('The earlier version could not be found.');
  const undone = installedVersion_();
  props.setProperties({ [PP_P + 'SLOT']: other, [PP_P + 'UNDO']: '', [PP_P + 'SKIP']: undone }, false);
  ppApp_ = undefined;
  return { installed: previous.version, undone: undone };
}

/** If the old hourly job (scanAll) was on, point it at ppTick so it keeps working. */
function migrateTriggers_() {
  const triggers = ScriptApp.getProjectTriggers();
  const old = triggers.filter(t => t.getHandlerFunction() === 'scanAll');
  old.forEach(t => ScriptApp.deleteTrigger(t));
  if (old.length && !triggers.some(t => t.getHandlerFunction() === 'ppTick')) {
    ScriptApp.newTrigger('ppTick').timeBased().everyHours(1).create();
  }
}
