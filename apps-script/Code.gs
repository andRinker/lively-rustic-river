/**
 * Prep Prepper hub.
 *
 * Lives inside a Google Sheet (Extensions > Apps Script) in your school
 * account. Nothing here sends data outside school Google.
 *
 * What it does:
 *   - keeps every to-do in the Tasks sheet
 *   - scans Gmail and Drive every hour for things that need you to act
 *   - routes announcements to a "Need to know" list instead of your to-dos
 *   - takes Gemini's tasks and one-line gists of the announcements
 *   - shows one checklist, soonest deadline first, plus a brain-dump box
 */

const TASKS_SHEET = 'Tasks';
const HEADERS = ['ID', 'Task', 'Due', 'Minutes', 'Source', 'Link', 'Status', 'Added', 'Key', 'Kind', 'Summary'];
const COL = { id: 0, task: 1, due: 2, minutes: 3, source: 4, link: 5, status: 6, added: 7, key: 8, kind: 9, summary: 10 };
const MAX_KNOW_SHOWN = 20;
const QUICK_MINUTES = 5;
const FIRST_SCAN_DAYS = 3;
const MAX_THREADS_PER_SCAN = 75;

// ---------- Menu and setup ----------

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Prep Prepper')
    .addItem('1. Set up', 'setup')
    .addItem('2. Test Gmail and Drive access', 'testAccess')
    .addItem('3. Turn on hourly scan', 'installTriggers')
    .addItem('4. Set up behavior log', 'setupBehavior')
    .addSeparator()
    .addItem('Scan Gmail and Drive now', 'scanNowFromMenu')
    .addItem('Re-check my list with the latest rules', 'recheckFromMenu')
    .addToUi();
}

/** Creates the Tasks sheet and remembers which spreadsheet is the hub. */
function setup() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  PropertiesService.getScriptProperties().setProperty('HUB_ID', ss.getId());
  ensureTasksSheet_(ss);
  SpreadsheetApp.getUi().alert(
    'Prep Prepper is set up.\n\nNext: run "3. Turn on hourly scan" from the Prep Prepper menu.'
  );
}

function ensureTasksSheet_(ss) {
  let sheet = ss.getSheetByName(TASKS_SHEET);
  if (!sheet) sheet = ss.insertSheet(TASKS_SHEET);
  // Writing the full header row also upgrades older sheets that lack the newer columns.
  sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]).setFontWeight('bold');
  sheet.setFrozenRows(1);
  sheet.getRange('C:C').setNumberFormat('ddd mmm d');
  return sheet;
}

/**
 * Checks whether this script may read Gmail and Drive.
 * Only counts items; it doesn't open or store any message contents.
 */
function testAccess() {
  const lines = [];

  try {
    const threads = GmailApp.search('in:inbox newer_than:1d', 0, 100);
    lines.push('Gmail: OK. ' + threads.length + ' inbox conversation(s) in the last 24 hours.');
  } catch (e) {
    lines.push('Gmail: BLOCKED. ' + e.message);
  }

  try {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const files = DriveApp.searchFiles('modifiedDate > "' + since + '" and trashed = false');
    let count = 0;
    while (files.hasNext() && count < 100) {
      files.next();
      count++;
    }
    lines.push('Drive: OK. ' + count + ' file(s) changed in the last 24 hours.');
  } catch (e) {
    lines.push('Drive: BLOCKED. ' + e.message);
  }

  SpreadsheetApp.getUi().alert('Access test\n\n' + lines.join('\n'));
}

/** Runs scanAll every hour, so the list is fresh before any prep. */
function installTriggers() {
  ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === 'scanAll')
    .forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('scanAll').timeBased().everyHours(1).create();
  const result = scanAll();
  SpreadsheetApp.getUi().alert(
    'Hourly scan is on.\n\nFirst scan just ran: ' + result.added + ' new item(s) from the last ' +
      FIRST_SCAN_DAYS + ' days.'
  );
}

function scanNowFromMenu() {
  const result = scanAll();
  SpreadsheetApp.getUi().alert('Scan done: ' + result.added + ' new item(s).');
}

// ---------- Web page ----------

function doGet(e) {
  const log = e && e.parameter && e.parameter.page === 'log';
  return HtmlService.createHtmlOutputFromFile(log ? 'Log' : 'Index')
    .setTitle(log ? 'Log behavior' : 'Prep Prepper')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

let sheetCache_ = null;

function tasksSheet_() {
  if (sheetCache_) return sheetCache_;
  const id = PropertiesService.getScriptProperties().getProperty('HUB_ID');
  if (!id) throw new Error('Open the spreadsheet and run Prep Prepper > 1. Set up first.');
  sheetCache_ = SpreadsheetApp.openById(id).getSheetByName(TASKS_SHEET);
  return sheetCache_;
}

/** Everything the page needs: open tasks, announcements, and when the last scan ran. */
function getState() {
  const last = PropertiesService.getScriptProperties().getProperty('LAST_SCAN');
  return {
    tasks: getTasks(),
    know: getKnow_(),
    logUrl: ScriptApp.getService().getUrl() + '?page=log',
    lastScan: last ? Utilities.formatDate(new Date(Number(last)), Session.getScriptTimeZone(), 'EEE h:mm a') : '',
  };
}

/** Open tasks, soonest deadline first; tasks with no deadline go last. */
function getTasks() {
  const sheet = tasksSheet_();
  if (sheet.getLastRow() < 2) return [];
  const rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, HEADERS.length).getValues();
  const tz = Session.getScriptTimeZone();

  return rows
    .filter(r => r[COL.id] && (r[COL.status] === 'open' || r[COL.status] === '') && r[COL.kind] !== 'know')
    .map(r => {
      const due = r[COL.due] instanceof Date ? r[COL.due] : null;
      const minutes = Number(r[COL.minutes]) || null;
      return {
        id: String(r[COL.id]),
        task: String(r[COL.task]),
        due: due ? Utilities.formatDate(due, tz, 'yyyy-MM-dd') : '',
        minutes: minutes,
        quick: minutes !== null && minutes <= QUICK_MINUTES,
        source: String(r[COL.source] || ''),
        link: String(r[COL.link] || ''),
      };
    })
    .sort((a, b) => {
      if (a.due && b.due) return a.due < b.due ? -1 : a.due > b.due ? 1 : 0;
      return a.due ? -1 : b.due ? 1 : 0;
    });
}

/** Announcements you haven't marked "got it" yet, newest first. */
function getKnow_() {
  const sheet = tasksSheet_();
  if (sheet.getLastRow() < 2) return [];
  const tz = Session.getScriptTimeZone();
  return sheet.getRange(2, 1, sheet.getLastRow() - 1, HEADERS.length).getValues()
    .filter(r => r[COL.id] && r[COL.status] === 'open' && r[COL.kind] === 'know')
    .reverse()
    .slice(0, MAX_KNOW_SHOWN)
    .map(r => ({
      id: String(r[COL.id]),
      headline: String(r[COL.task]),
      summary: String(r[COL.summary] || ''),
      source: String(r[COL.source] || ''),
      link: String(r[COL.link] || ''),
      added: r[COL.added] instanceof Date ? Utilities.formatDate(r[COL.added], tz, 'EEE MMM d') : '',
    }));
}

/**
 * Adds one task per line from the brain-dump box.
 * Understands deadlines like "today", "tomorrow", "by Thursday", "10/31", "Oct 31",
 * and time estimates like "5 min".
 */
function addFromBrainDump(text) {
  const now = new Date();
  String(text || '').split('\n').map(s => s.trim()).filter(Boolean).forEach(line => {
    addTask_({
      task: line,
      due: parseDue_(line, now),
      minutes: parseMinutes_(line),
      source: 'Brain dump',
    });
  });
  return getState();
}

/** "done" when finished, "dismissed" when it was never a real task. Either way it never comes back. */
function setStatus(id, status) {
  if (status !== 'done' && status !== 'dismissed') throw new Error('Unknown status: ' + status);
  const sheet = tasksSheet_();
  if (sheet.getLastRow() < 2) return getState();
  const ids = sheet.getRange(2, COL.id + 1, sheet.getLastRow() - 1, 1).getValues();
  const i = ids.findIndex(r => String(r[0]) === String(id));
  if (i >= 0) sheet.getRange(i + 2, COL.status + 1).setValue(status);
  return getState();
}

function addTask_(t) {
  tasksSheet_().appendRow([
    Utilities.getUuid(),
    t.task,
    t.due || '',
    t.minutes || '',
    t.source || '',
    t.link || '',
    'open',
    new Date(),
    t.key || '',
    t.kind || 'task',
    t.summary || '',
  ]);
}

/** Keys of every task ever added, open or not, so nothing gets added twice. */
function existingKeys_() {
  const sheet = tasksSheet_();
  const keys = new Set();
  if (sheet.getLastRow() < 2) return keys;
  sheet.getRange(2, COL.key + 1, sheet.getLastRow() - 1, 1).getValues()
    .forEach(r => { if (r[0]) keys.add(String(r[0])); });
  return keys;
}

// ---------- Scanning Gmail and Drive ----------

/** Scans everything since the last scan. Runs hourly, and from the page's Refresh button. */
function scanAll() {
  const props = PropertiesService.getScriptProperties();
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30 * 1000)) return { added: 0, state: getState() };
  try {
    const last = Number(props.getProperty('LAST_SCAN')) || 0;
    // Overlap by an hour so nothing slips between runs; keys stop duplicates.
    const since = last ? new Date(last - 60 * 60 * 1000) : new Date(Date.now() - FIRST_SCAN_DAYS * 864e5);
    autoClose_();
    const keys = existingKeys_();
    const found = scanGmail_(since, keys).concat(scanDrive_(since, keys));
    found.forEach(addTask_);
    checkPatterns_();
    props.setProperty('LAST_SCAN', String(Date.now()));
    return { added: found.length, state: getState() };
  } finally {
    lock.releaseLock();
  }
}

/** For the page's Refresh button. */
function refreshNow() {
  return scanAll().state;
}

// Words that mean an email wants something from you. Soft words like "please" and
// "reminder" are left out on purpose: announcements use them constantly.
const ACTION_RE = /\b(due|deadline|submit|fill out|fill in|sign|signature|rsvp|respond by|reply by|please (?:reply|respond|confirm|complete|let me know)|no later than|action (?:needed|required)|need(?:ed)? from you|turn in|register|sign up|by (?:mon|tues|wednes|thurs|fri)day|by end of day|eod)\b/i;
const FORM_RE = /https:\/\/(?:forms\.gle\/[\w-]+|docs\.google\.com\/forms\/[^\s"'<>)]+)/i;

function scanGmail_(since, keys) {
  const me = Session.getActiveUser().getEmail().toLowerCase();
  const query = 'in:inbox after:' + Math.floor(since.getTime() / 1000) +
    ' -category:promotions -category:social -from:me';
  const tasks = [];

  GmailApp.search(query, 0, MAX_THREADS_PER_SCAN).forEach(thread => {
    const key = 'gmail:' + thread.getId();
    if (keys.has(key)) return;
    const task = gmailTaskFor_(thread, me);
    if (!task) return;
    keys.add(key);
    tasks.push(task);
  });

  return tasks;
}

/**
 * What an email thread is for you: a task (it asks you to do something),
 * an announcement for "Need to know", or null (nothing for you).
 */
function gmailTaskFor_(thread, me) {
  const messages = thread.getMessages();
  const msg = messages[messages.length - 1];
  if (msg.getFrom().toLowerCase().indexOf(me) >= 0) return null; // you already replied last

  const subject = msg.getSubject() || '(no subject)';
  const body = msg.getPlainBody().slice(0, 6000);
  const form = body.match(FORM_RE);
  const actionLines = body.split(/[\n.!?]+/).filter(s => ACTION_RE.test(s));
  const asks = form || ACTION_RE.test(subject) || actionLines.length > 0;
  const bulk = isBulk_(msg, me);
  if (!asks && !bulk) return null;

  const sent = msg.getDate();
  const due = asks ? (parseDue_(subject, sent) ||
    actionLines.map(s => parseDue_(s, sent)).find(Boolean) ||
    parseDue_(body.slice(0, 1500), sent)) : null;

  // Newsletters and all-staff mail go to "Need to know" unless there's a form or a real deadline.
  if (bulk && !form && !due) {
    return {
      kind: 'know',
      task: truncate_(subject, 120),
      source: senderName_(msg.getFrom()),
      link: 'https://mail.google.com/mail/u/0/#all/' + thread.getId(),
      key: 'gmail:' + thread.getId(),
    };
  }

  const lower = (subject + ' ' + actionLines.join(' ')).toLowerCase();
  let verb = 'Handle';
  let minutes = null;
  if (form) { verb = 'Fill out form'; minutes = 5; }
  else if (/\brsvp\b/.test(lower)) { verb = 'RSVP'; minutes = 2; }
  else if (/\bsign(ature)?\b/.test(lower)) { verb = 'Sign'; minutes = 5; }
  else if (/\b(reply|respond)\b/.test(lower)) { verb = 'Reply'; minutes = 5; }
  else if (/\b(submit|turn in)\b/.test(lower)) { verb = 'Submit'; }
  else if (/\b(register|sign up)\b/.test(lower)) { verb = 'Sign up'; minutes = 5; }

  return {
    task: verb + ': ' + truncate_(subject, 90),
    due: due,
    minutes: minutes,
    source: 'Email from ' + senderName_(msg.getFrom()),
    link: form ? form[0] : 'https://mail.google.com/mail/u/0/#all/' + thread.getId(),
    key: 'gmail:' + thread.getId(),
    kind: 'task',
  };
}

/**
 * Runs today's rules over the email items already in the sheet (open or filtered
 * by an older rule): each becomes a task, a "Need to know" item, or "filtered".
 * Use it after the rules change.
 */
function recheckOpenTasks() {
  const sheet = tasksSheet_();
  if (sheet.getLastRow() < 2) return 0;
  autoClose_();
  const me = Session.getActiveUser().getEmail().toLowerCase();
  const rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, HEADERS.length).getValues();
  let removed = 0;
  rows.forEach((r, i) => {
    const key = String(r[COL.key] || '');
    if ((r[COL.status] !== 'open' && r[COL.status] !== 'filtered') || key.indexOf('gmail:') !== 0) return;
    let thread = null;
    try { thread = GmailApp.getThreadById(key.slice(6)); } catch (e) { /* deleted */ }
    if (!thread) return;
    const item = gmailTaskFor_(thread, me);
    if (!item) {
      if (r[COL.status] === 'open') removed++;
      sheet.getRange(i + 2, COL.status + 1).setValue('filtered');
      return;
    }
    sheet.getRange(i + 2, COL.status + 1).setValue('open');
    sheet.getRange(i + 2, COL.kind + 1).setValue(item.kind);
    if (item.kind === 'know') sheet.getRange(i + 2, COL.task + 1).setValue(item.task);
  });
  return removed;
}

function recheckFromMenu() {
  const before = getTasks().length;
  recheckOpenTasks();
  const after = getTasks().length;
  SpreadsheetApp.getUi().alert('Re-check done. Your to-do list went from ' + before + ' to ' + after +
    ' tasks. Announcements are now under "Need to know" (' + getKnow_().length + ').');
}

/**
 * Announcements: mailing lists, all-staff groups, and anything that reached you
 * by BCC or a group address rather than to you by name.
 */
function isBulk_(msg, me) {
  const precedence = (msg.getHeader('Precedence') || '').toLowerCase();
  const toMe = (msg.getTo() + ',' + msg.getCc()).toLowerCase().indexOf(me) >= 0;
  return !toMe || Boolean(msg.getHeader('List-Unsubscribe') || msg.getHeader('List-Id')) ||
    precedence === 'bulk' || precedence === 'list';
}

/**
 * Closes email tasks you've clearly dealt with: you replied last, or the
 * email is no longer in your inbox (archived or deleted). They're marked
 * "auto-done" in the Tasks sheet, so you can reopen one by changing it to "open".
 */
function autoClose_() {
  const sheet = tasksSheet_();
  if (sheet.getLastRow() < 2) return;
  const me = Session.getActiveUser().getEmail().toLowerCase();
  const rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, HEADERS.length).getValues();
  let checked = 0;

  rows.forEach((r, i) => {
    const key = String(r[COL.key] || '');
    if (r[COL.status] !== 'open' || key.indexOf('gmail:') !== 0 || checked >= 100) return;
    checked++;
    let thread = null;
    try { thread = GmailApp.getThreadById(key.slice(6)); } catch (e) { /* deleted */ }
    let handled = !thread || !thread.isInInbox();
    if (!handled) {
      const messages = thread.getMessages();
      handled = messages[messages.length - 1].getFrom().toLowerCase().indexOf(me) >= 0;
    }
    if (handled) sheet.getRange(i + 2, COL.status + 1).setValue('auto-done');
  });
}

/** Files someone shared with you or changed since the last scan. */
function scanDrive_(since, keys) {
  const tasks = [];
  const files = DriveApp.searchFiles(
    'sharedWithMe and modifiedDate > "' + since.toISOString() + '" and trashed = false'
  );
  let n = 0;
  while (files.hasNext() && n < 50) {
    const file = files.next();
    n++;
    const key = 'drive:' + file.getId(); // once per file, so busy shared docs don't pile up
    if (keys.has(key)) continue;
    let owner = '';
    try { owner = file.getOwner() ? file.getOwner().getName() : ''; } catch (e) { /* shared drives have no owner */ }
    keys.add(key);
    tasks.push({
      task: 'Look over: ' + truncate_(file.getName(), 90),
      due: parseDue_(file.getName(), new Date()),
      minutes: null,
      source: 'Drive' + (owner ? ', shared by ' + owner : ''),
      link: file.getUrl(),
      key: key,
    });
  }
  return tasks;
}

function senderName_(from) {
  const m = from.match(/^\s*"?([^"<]+?)"?\s*</);
  return m ? m[1] : from;
}

function truncate_(s, n) {
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}

// ---------- Gemini ----------

/**
 * Takes Gemini's reply. The prompt on the page asks for two kinds of lines:
 *   TASK | what to do | YYYY-MM-DD or none | minutes | where it came from
 *   KNOW | the email's exact subject | one-sentence gist
 * A KNOW line fills in the gist of the matching "Need to know" item, or adds one.
 * Lines without a TASK/KNOW label are read as tasks.
 */
function addFromGemini(text) {
  const sheet = tasksSheet_();
  const keys = existingKeys_();
  const now = new Date();
  let added = 0;
  let gists = 0;

  String(text || '').split('\n').forEach(raw => {
    const line = raw.replace(/^\s*(?:[-*•☐]|\d+[.)])\s*/, '').replace(/\*\*/g, '').trim();
    let parts = line.split('|').map(s => s.trim());
    if (parts.length < 2 || !parts[0]) return;

    const label = parts[0].toUpperCase();
    if (label === 'KNOW') {
      const subject = parts[1] || '';
      const gist = parts.slice(2).join(' | ');
      if (!subject || /^(the )?email'?s exact subject$/i.test(subject)) return;
      const row = findKnowRow_(sheet, subject);
      if (row) {
        sheet.getRange(row, COL.summary + 1).setValue(gist);
        gists++;
        return;
      }
      const key = 'gemini-know:' + normalize_(subject);
      if (keys.has(key)) return;
      keys.add(key);
      addTask_({ kind: 'know', task: subject, summary: gist, source: 'Gemini', key: key });
      gists++;
      return;
    }

    if (label === 'TASK') parts = parts.slice(1);
    if (!parts[0] || /^(task|what to do)$/i.test(parts[0])) return;
    const key = 'gemini:' + normalize_(parts[0]);
    if (keys.has(key)) return;
    keys.add(key);

    const iso = (parts[1] || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
    addTask_({
      task: parts[0],
      due: iso ? new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3])) : parseDue_(parts[1] || '', now),
      minutes: Number(parts[2]) || null,
      source: 'Gemini' + (parts[3] ? ': ' + parts[3] : ''),
      key: key,
    });
    added++;
  });

  const state = getState();
  state.added = added;
  state.gists = gists;
  return state;
}

/** Sheet row number of the open "Need to know" item whose subject matches, or 0. */
function findKnowRow_(sheet, subject) {
  if (sheet.getLastRow() < 2) return 0;
  const want = normalize_(subject.replace(/^(re|fwd?):\s*/i, ''));
  if (want.length < 4) return 0;
  const rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, HEADERS.length).getValues();
  for (let i = rows.length - 1; i >= 0; i--) {
    const r = rows[i];
    if (r[COL.kind] !== 'know' || r[COL.status] !== 'open') continue;
    const have = normalize_(String(r[COL.task]).replace(/^(re|fwd?):\s*/i, ''));
    if (have && (have.indexOf(want) >= 0 || want.indexOf(have) >= 0)) return i + 2;
  }
  return 0;
}

function normalize_(s) {
  return String(s).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

// ---------- Parsing helpers ----------

const WEEKDAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

function parseDue_(text, now) {
  const s = text.toLowerCase();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const plusDays = n => new Date(today.getFullYear(), today.getMonth(), today.getDate() + n);

  if (/\b(today|tonight|asap)\b/.test(s)) return today;
  if (/\btomorrow\b/.test(s)) return plusDays(1);

  // "friday", "by thu", "due wed". Today's weekday means today.
  const wd = s.match(/\b(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/) ||
    s.match(/\b(?:by|on|due)\s+(sun|mon|tue|wed|thu|fri|sat)\b/);
  if (wd) {
    const target = WEEKDAYS.indexOf(wd[1].slice(0, 3));
    let diff = (target - today.getDay() + 7) % 7;
    if (/\bnext\s+\w*day\b/.test(s) && diff === 0) diff = 7;
    return plusDays(diff);
  }

  // 10/31 or 10/31/26
  const md = s.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/);
  if (md) {
    const year = md[3] ? (md[3].length === 2 ? 2000 + Number(md[3]) : Number(md[3])) : today.getFullYear();
    return rollForward_(new Date(year, Number(md[1]) - 1, Number(md[2])), today, !md[3]);
  }

  // Oct 31, October 31st
  const mn = s.match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})(?:st|nd|rd|th)?\b/);
  if (mn) {
    return rollForward_(new Date(today.getFullYear(), MONTHS.indexOf(mn[1]), Number(mn[2])), today, true);
  }

  return null;
}

/** A date with no year that is long past probably means next year. */
function rollForward_(date, today, yearGuessed) {
  const sixtyDays = 60 * 24 * 60 * 60 * 1000;
  if (yearGuessed && today - date > sixtyDays) date.setFullYear(date.getFullYear() + 1);
  return date;
}

function parseMinutes_(text) {
  const m = text.toLowerCase().match(/\b(\d{1,3})\s*(m|min|mins|minutes)\b/);
  return m ? Number(m[1]) : null;
}
