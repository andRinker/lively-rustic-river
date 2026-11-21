// Runs the real starter (starter/Code.gs) and the real app inside a pretend Apps Script,
// so install, update, undo, and failure paths are exercised without a Google account.
//   node --test test/

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const root = path.join(__dirname, '..');
const starterSource = fs.readFileSync(path.join(root, 'starter/Code.gs'), 'utf8');

// ---------- A pretend Google ----------

function makeWorld(remote) {
  const store = {};
  const cacheStore = {};
  const triggers = [];
  const alerts = [];
  let answer = 'YES';
  let menus = {};

  const props = {
    getProperty: k => (k in store ? store[k] : null),
    getProperties: () => ({ ...store }),
    setProperty: (k, v) => { store[k] = String(v); },
    setProperties(obj, del) {
      if (del) Object.keys(store).forEach(k => delete store[k]);
      Object.entries(obj).forEach(([k, v]) => {
        // Google's real limit is about 9 KB per value (bytes, not characters).
        assert.ok(Buffer.byteLength(String(v)) <= 9 * 1024, 'property too large: ' + k);
        store[k] = String(v);
      });
      const total = Object.entries(store).reduce((n, [k, v]) => n + Buffer.byteLength(k + v), 0);
      assert.ok(total <= 500 * 1024, 'properties over 500 KB');
    },
    deleteProperty: k => { delete store[k]; },
  };

  const ui = {
    ButtonSet: { OK: 'OK', YES_NO: 'YES_NO' },
    Button: { YES: 'YES', NO: 'NO' },
    createMenu(name) {
      const items = [];
      const b = {
        addItem: (label, fn) => (items.push([label, fn]), b),
        addSeparator: () => b,
        addToUi: () => { menus[name] = items; },
      };
      return b;
    },
    alert(...a) { alerts.push(a); return answer; },
  };

  const sheetRows = [['ID']];
  const fakeSheet = {
    getLastRow: () => sheetRows.length,
    appendRow: r => { sheetRows.push(r); },
    getRange: (row, col, nr, nc) => ({
      getValues: () => sheetRows.slice(row - 1, row - 1 + nr).map(r => r.slice(col - 1, col - 1 + nc).concat(Array(Math.max(0, nc - r.length)).fill(''))),
      setValue: v => { sheetRows[row - 1][col - 1] = v; },
    }),
  };

  const ctx = {
    console,
    PropertiesService: { getScriptProperties: () => props },
    CacheService: { getScriptCache: () => ({ get: k => cacheStore[k] || null, put: (k, v) => { cacheStore[k] = v; } }) },
    LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock() {} }) },
    Utilities: {
      DigestAlgorithm: { SHA_256: 'SHA_256' },
      Charset: { UTF_8: 'UTF_8' },
      computeDigest: (alg, text) => Array.from(crypto.createHash('sha256').update(text, 'utf8').digest()).map(b => (b > 127 ? b - 256 : b)),
      getUuid: () => crypto.randomUUID(),
      formatDate: d => d.toISOString().slice(0, 10),
    },
    UrlFetchApp: {
      fetch(url) {
        ctx.fetched.push(url);
        const r = remote(url.replace(/\?.*$/, '').split('/').pop());
        if (r instanceof Error) throw r;
        return { getResponseCode: () => r.code, getContentText: () => r.body };
      },
    },
    SpreadsheetApp: { getUi: () => ui, openById: () => ({ getSheetByName: () => fakeSheet }) },
    ScriptApp: {
      getService: () => ({ getUrl: () => 'https://script.google.com/macros/s/TEST/exec' }),
      getProjectTriggers: () => triggers.slice(),
      deleteTrigger: t => { triggers.splice(triggers.indexOf(t), 1); },
      newTrigger: fn => ({ timeBased: () => ({ everyHours: () => ({ create: () => { triggers.push({ getHandlerFunction: () => fn }); } }) }) }),
    },
    HtmlService: {
      createHtmlOutput: html => { const o = { html, setTitle: () => o, addMetaTag: () => o }; return o; },
    },
    Session: { getScriptTimeZone: () => 'America/Chicago', getActiveUser: () => ({ getEmail: () => 'andrew@school.test' }) },
    GmailApp: {}, DriveApp: {},
    fetched: [],
  };
  vm.createContext(ctx);
  vm.runInContext(starterSource, ctx);
  const run = code => vm.runInContext(code, ctx);

  return {
    ctx, run, store, props, alerts, triggers,
    menu: () => menus['Prep Prepper'],
    setAnswer: a => { answer = a; },
    rows: sheetRows,
    clearCache: () => Object.keys(cacheStore).forEach(k => delete cacheStore[k]),
  };
}

// ---------- Release builder, so tests can make versions ----------

function release({ code, html, version, notes, needsStarter }) {
  const sha = crypto.createHash('sha256').update(code + '\u0000' + html, 'utf8').digest('hex');
  return {
    manifest: JSON.stringify({ version, sha256: sha, needsStarter, history: [{ version, notes: notes || ['Test change'] }] }),
    bundle: JSON.stringify({ version, sha256: sha, files: { 'Code.js': code, 'Index.html': html } }),
  };
}

const realCode = fs.readFileSync(path.join(root, 'app/Code.js'), 'utf8');
const realHtml = fs.readFileSync(path.join(root, 'app/Index.html'), 'utf8');

function serve(rel) {
  return name => {
    if (name === 'manifest.json') return { code: 200, body: rel.manifest };
    if (name === 'bundle.json') return { code: 200, body: rel.bundle };
    return { code: 404, body: '' };
  };
}

// ---------- Tests ----------

test('the committed release files are in step with app/', () => {
  execFileSync('node', [path.join(root, 'tools/build.js'), '--check'], { stdio: 'pipe' });
});

test('first install: menu starts as Install, then shows the full app menu', () => {
  const w = makeWorld(serve(release({ code: realCode, html: realHtml, version: '1.0.0' })));
  w.run('onOpen()');
  assert.deepEqual(w.menu().map(i => i[0]), ['Install Prep Prepper']);

  w.run('ppCheckForUpdates()');
  assert.match(w.alerts[0][0], /Install Prep Prepper 1\.0\.0/);
  assert.match(w.alerts[1][1], /version 1\.0\.0/);
  assert.deepEqual(w.menu().map(i => i[0]), [
    '1. Set up', '2. Test Gmail and Drive access', '3. Turn on hourly scan',
    'Scan Gmail and Drive now', 'Re-check my list with the latest rules', 'Check for updates',
  ]);
  // Every menu entry points at a function that exists.
  w.menu().forEach(([, fn]) => assert.equal(w.run('typeof ' + fn), 'function', fn));
});

test('the page works through the single api door, and nothing outside the allowlist runs', () => {
  const w = makeWorld(serve(release({ code: realCode, html: realHtml, version: '1.0.0' })));
  w.run('ppCheckForUpdates()');
  w.store.HUB_ID = 'sheet-id';

  const state = w.run("api('getState', [])");
  assert.equal(state.tasks.length, 0);

  const after = w.run("api('addFromBrainDump', ['Order chart paper tomorrow 5 min'])");
  assert.equal(after.tasks.length, 1);
  assert.equal(after.tasks[0].minutes, 5);
  assert.equal(after.tasks[0].quick, true);

  assert.throws(() => w.run("api('setup', [])"), /Unknown action/);
  assert.throws(() => w.run("api('constructor', [])"), /Unknown action/);
  assert.throws(() => w.run("api('hasOwnProperty', [])"), /Unknown action/);

  const html = w.run('doGet({})').html;
  assert.match(html, /Prep Prepper/);
  assert.match(html, /pp\.installUpdate/);
});

test('the page only calls actions the app exposes', () => {
  const w = makeWorld(serve(release({ code: realCode, html: realHtml, version: '1.0.0' })));
  w.run('ppCheckForUpdates()');
  const called = [...realHtml.matchAll(/server\('([\w.]+)'/g)].map(m => m[1]);
  assert.ok(called.length > 5);
  const allowed = w.run("Object.keys(loadApp_().api).concat(['pp.updateStatus', 'pp.installUpdate'])");
  called.forEach(c => assert.ok(allowed.includes(c), 'page calls ' + c));
  assert.equal(w.run('google = undefined, 0'), 0); // sanity: context is isolated
});

test('an update is offered with its notes, installs, and can be undone', () => {
  let rel = release({ code: realCode, html: realHtml, version: '1.0.0' });
  const w = makeWorld(name => serve(rel)(name));
  w.run('ppCheckForUpdates()');

  w.alerts.length = 0;
  w.run('ppCheckForUpdates()');
  assert.match(w.alerts[0][0], /up to date/);

  const v2code = realCode.replace("source: 'Brain dump'", "source: 'Brain dump v2'");
  assert.notEqual(v2code, realCode);
  rel = release({ code: v2code, html: realHtml, version: '1.1.0', notes: ['Brain dump now says v2.'] });

  w.alerts.length = 0;
  w.run('ppCheckForUpdates()');
  assert.match(w.alerts[0][0], /Update to version 1\.1\.0/);
  assert.match(w.alerts[0][1], /Brain dump now says v2/);
  assert.match(w.alerts[1][1], /version 1\.1\.0/);
  assert.ok(w.menu().some(i => i[0] === 'Undo last update'));

  w.store.HUB_ID = 'sheet-id';
  w.run("api('addFromBrainDump', ['Copy quiz'])");
  assert.equal(w.rows[1][4], 'Brain dump v2');

  // Undo goes back to 1.0.0, keeps tasks, and does not nag about 1.1.0 straight away.
  w.run('ppUndoUpdate()');
  assert.equal(w.run('installedVersion_()'), '1.0.0');
  assert.equal(w.rows.length, 2, 'tasks survive');
  w.run("api('addFromBrainDump', ['Copy test'])");
  assert.equal(w.rows[2][4], 'Brain dump');
  assert.equal(w.run("api('pp.updateStatus', []).available"), false);
  assert.ok(!w.menu().some(i => i[0] === 'Undo last update'));

  // Asking explicitly still offers it.
  w.alerts.length = 0;
  w.run('ppCheckForUpdates()');
  assert.match(w.alerts[0][0], /Update to version 1\.1\.0/);
  assert.equal(w.run('installedVersion_()'), '1.1.0');
});

test('the page banner: status reports newer versions, and installUpdate switches over', () => {
  let rel = release({ code: realCode, html: realHtml, version: '1.0.0' });
  const w = makeWorld(name => serve(rel)(name));
  w.run('ppCheckForUpdates()');
  rel = release({ code: realCode + '\n// v2', html: realHtml, version: '1.0.1', notes: ['A', 'B'] });
  w.clearCache();

  const s = w.run("api('pp.updateStatus', [])");
  assert.equal(s.available, true);
  assert.equal(s.latest, '1.0.1');
  assert.deepEqual(Array.from(s.notes), ['A', 'B']);
  assert.match(s.url, /script\.google\.com/);

  const r = w.run("api('pp.installUpdate', [])");
  assert.equal(r.installed, '1.0.1');
  assert.equal(w.run("api('pp.updateStatus', []).available"), false);
});

test('a download that does not match its checksum is refused and nothing changes', () => {
  let rel = release({ code: realCode, html: realHtml, version: '1.0.0' });
  const w = makeWorld(name => serve(rel)(name));
  w.run('ppCheckForUpdates()');

  const good = release({ code: realCode + '\n// x', html: realHtml, version: '1.1.0' });
  const tampered = JSON.parse(good.bundle);
  tampered.files['Code.js'] += '\n// sneaky';
  rel = { manifest: good.manifest, bundle: JSON.stringify(tampered) };

  w.alerts.length = 0;
  w.run('ppCheckForUpdates()');
  assert.match(w.alerts[1][0], /Update failed/);
  assert.equal(w.run('installedVersion_()'), '1.0.0');
});

test('code that does not even load is refused and the old version keeps running', () => {
  let rel = release({ code: realCode, html: realHtml, version: '1.0.0' });
  const w = makeWorld(name => serve(rel)(name));
  w.run('ppCheckForUpdates()');

  rel = release({ code: 'function broken( {', html: realHtml, version: '1.1.0' });
  w.alerts.length = 0;
  w.run('ppCheckForUpdates()');
  assert.match(w.alerts[1][0], /Update failed/);
  assert.equal(w.run('installedVersion_()'), '1.0.0');

  rel = release({ code: 'const nothing = 1;', html: realHtml, version: '1.1.0' });
  w.alerts.length = 0;
  w.run('ppCheckForUpdates()');
  assert.match(w.alerts[1][1], /does not|shaped|PP_APP/i);
  assert.equal(w.run('installedVersion_()'), '1.0.0');
});

test('no network or a blocked site gives a plain message and changes nothing', () => {
  let down = false;
  const rel = release({ code: realCode, html: realHtml, version: '1.0.0' });
  const w = makeWorld(name => (down ? new Error('Domain not allowed') : serve(rel)(name)));
  w.run('ppCheckForUpdates()');
  down = true;
  w.clearCache();
  w.alerts.length = 0;
  w.run('ppCheckForUpdates()');
  assert.match(w.alerts[0][1], /could not reach GitHub/i);
  assert.equal(w.run('installedVersion_()'), '1.0.0');
  assert.equal(w.run("api('pp.updateStatus', []).available"), false);
  // The page still works while offline.
  w.store.HUB_ID = 'sheet-id';
  assert.equal(w.run("api('getState', [])").tasks.length, 0);
});

test('an update that needs a newer starter is refused, and the current version keeps working', () => {
  let rel = release({ code: realCode, html: realHtml, version: '1.0.0' });
  const w = makeWorld(name => serve(rel)(name));
  w.run('ppCheckForUpdates()');
  w.store.HUB_ID = 'sheet-id';

  rel = release({ code: realCode + '\n// needs more', html: realHtml, version: '2.0.0', needsStarter: 2 });
  w.clearCache();
  w.alerts.length = 0;
  w.run('ppCheckForUpdates()');
  assert.match(w.alerts[0][1], /newer Prep Prepper starter/);
  assert.equal(w.run('installedVersion_()'), '1.0.0');

  const status = w.run("api('pp.updateStatus', [])");
  assert.equal(status.available, false);
  assert.match(status.error, /Ask Claude for the new starter/);
  assert.throws(() => w.run("api('pp.installUpdate', [])"), /newer Prep Prepper starter/);
  assert.equal(w.run("api('getState', [])").tasks.length, 0, 'app still works');
});

test('a starter push (what clasp does) leaves the installed app and its data alone', () => {
  const rel = release({ code: realCode, html: realHtml, version: '1.0.0' });
  const w = makeWorld(serve(rel));
  w.run('ppCheckForUpdates()');
  w.store.HUB_ID = 'sheet-id';
  w.run("api('addFromBrainDump', ['Keep me'])");
  const before = { ...w.store };

  // Pretend clasp replaced the starter code: a fresh run of the same starter over the same saved settings.
  const w2 = makeWorld(serve(rel));
  Object.assign(w2.store, before);
  assert.equal(w2.run('installedVersion_()'), '1.0.0');
  assert.equal(w2.run("api('getState', [])").tasks.length, 0, 'app still loads from saved settings');
  w2.run('onOpen()');
  assert.ok(w2.menu().some(i => i[0] === 'Check for updates'));
  assert.deepEqual(w2.store, before, 'starting the starter changes no saved settings');
});

test('declining the prompt installs nothing', () => {
  const w = makeWorld(serve(release({ code: realCode, html: realHtml, version: '1.0.0' })));
  w.setAnswer('NO');
  w.run('ppCheckForUpdates()');
  assert.equal(w.run('installedVersion_()'), '');
});

test('saved code survives the 9 KB property limit, emoji, and shrinking', () => {
  const big = realCode + '\n// ' + 'é✕⚡…😀'.repeat(3000);
  let rel = release({ code: big, html: realHtml, version: '1.0.0' });
  const w = makeWorld(name => serve(rel)(name));
  w.run('ppCheckForUpdates()');
  assert.equal(w.run('readSlot_(PropertiesService.getScriptProperties().getProperties(), currentSlot_()).files["Code.js"] === ' + JSON.stringify(big)), true);

  rel = release({ code: realCode, html: realHtml, version: '1.0.1' });
  w.run('ppCheckForUpdates()');
  rel = release({ code: realCode, html: realHtml, version: '1.0.2' });
  w.run('ppCheckForUpdates()'); // reuses the first slot; leftover pieces must be cleaned up
  const keys = Object.keys(w.store).filter(k => k.startsWith('PPU_') && /_\d+$/.test(k));
  const n = Object.entries(w.store).filter(([k]) => /^PPU_[AB]_n$/.test(k)).reduce((s, [, v]) => s + Number(v), 0);
  assert.equal(keys.length, n);
});

test('an old hourly trigger named scanAll is moved to ppTick on install', () => {
  const w = makeWorld(serve(release({ code: realCode, html: realHtml, version: '1.0.0' })));
  w.triggers.push({ getHandlerFunction: () => 'scanAll' });
  w.run('ppCheckForUpdates()');
  assert.deepEqual(w.triggers.map(t => t.getHandlerFunction()), ['ppTick']);
  // A fresh install does not turn scanning on by itself.
  const w2 = makeWorld(serve(release({ code: realCode, html: realHtml, version: '1.0.0' })));
  w2.run('ppCheckForUpdates()');
  assert.equal(w2.triggers.length, 0);
});

test('the old script properties are left alone', () => {
  const w = makeWorld(serve(release({ code: realCode, html: realHtml, version: '1.0.0' })));
  w.store.HUB_ID = 'abc';
  w.store.LAST_SCAN = '123';
  w.run('ppCheckForUpdates()');
  assert.equal(w.store.HUB_ID, 'abc');
  assert.equal(w.store.LAST_SCAN, '123');
});

test('the starter declares every Google service the app uses', () => {
  const services = ['GmailApp', 'DriveApp', 'SpreadsheetApp', 'ScriptApp', 'PropertiesService', 'LockService', 'HtmlService', 'Session', 'Utilities'];
  const declared = starterSource.slice(starterSource.indexOf('function declareAccess_'), starterSource.indexOf('// ---------- Menu'));
  const used = new Set(realCode.match(/\b(GmailApp|DriveApp|SpreadsheetApp|CalendarApp|ChatApp|UrlFetchApp|DocumentApp|SlidesApp|FormApp)\b/g));
  used.add('UrlFetchApp');
  used.forEach(s => assert.ok(starterSource.includes(s + '.'), s + ' is used by the app but never mentioned in the starter'));
  assert.ok(declared.includes('GmailApp.search'));
  assert.ok(services.length);
});
