/**
 * Prep Prepper hub, step 1.
 *
 * Lives inside a Google Sheet (Extensions > Apps Script) in your school
 * account. Nothing here sends data outside school Google.
 *
 * Step 1 gives you:
 *   - a Tasks sheet that holds every to-do
 *   - a web page with your checklist (soonest deadline first) and a brain-dump box
 *   - a one-time test that checks whether your district lets scripts read Gmail and Drive
 */

const TASKS_SHEET = 'Tasks';
const HEADERS = ['ID', 'Task', 'Due', 'Minutes', 'Source', 'Link', 'Status', 'Added'];
const COL = { id: 0, task: 1, due: 2, minutes: 3, source: 4, link: 5, status: 6, added: 7 };
const QUICK_MINUTES = 5;

// ---------- Menu and setup ----------

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Prep Prepper')
    .addItem('1. Set up', 'setup')
    .addItem('2. Test Gmail and Drive access', 'testAccess')
    .addToUi();
}

/** Creates the Tasks sheet and remembers which spreadsheet is the hub. */
function setup() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  PropertiesService.getScriptProperties().setProperty('HUB_ID', ss.getId());

  let sheet = ss.getSheetByName(TASKS_SHEET);
  if (!sheet) sheet = ss.insertSheet(TASKS_SHEET);
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(HEADERS);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, HEADERS.length).setFontWeight('bold');
    sheet.getRange('C:C').setNumberFormat('ddd mmm d');
  }

  SpreadsheetApp.getUi().alert(
    'Prep Prepper is set up.\n\nNext: run "2. Test Gmail and Drive access" from the Prep Prepper menu.'
  );
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

// ---------- Web page ----------

function doGet() {
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('Prep Prepper')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function tasksSheet_() {
  const id = PropertiesService.getScriptProperties().getProperty('HUB_ID');
  if (!id) throw new Error('Open the spreadsheet and run Prep Prepper > 1. Set up first.');
  return SpreadsheetApp.openById(id).getSheetByName(TASKS_SHEET);
}

/** Open tasks, soonest deadline first; tasks with no deadline go last. */
function getTasks() {
  const sheet = tasksSheet_();
  if (sheet.getLastRow() < 2) return [];
  const rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, HEADERS.length).getValues();
  const tz = Session.getScriptTimeZone();

  return rows
    .filter(r => r[COL.id] && r[COL.status] !== 'done')
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

/**
 * Adds one task per line from the brain-dump box.
 * Understands deadlines like "today", "tomorrow", "by Thursday", "10/31", "Oct 31",
 * and time estimates like "5 min".
 */
function addFromBrainDump(text) {
  const sheet = tasksSheet_();
  const lines = String(text || '').split('\n').map(s => s.trim()).filter(Boolean);
  const now = new Date();
  lines.forEach(line => {
    sheet.appendRow([
      Utilities.getUuid(),
      line,
      parseDue_(line, now) || '',
      parseMinutes_(line) || '',
      'Brain dump',
      '',
      'open',
      now,
    ]);
  });
  return getTasks();
}

function completeTask(id) {
  const sheet = tasksSheet_();
  if (sheet.getLastRow() < 2) return getTasks();
  const ids = sheet.getRange(2, COL.id + 1, sheet.getLastRow() - 1, 1).getValues();
  const i = ids.findIndex(r => String(r[0]) === String(id));
  if (i >= 0) sheet.getRange(i + 2, COL.status + 1).setValue('done');
  return getTasks();
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
