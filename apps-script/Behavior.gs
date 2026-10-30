/**
 * Behavior log: a 10-second phone page for logging, plus pattern checks
 * that turn what you log into to-dos.
 *
 * Student names live only in this spreadsheet (Roster and Behavior tabs).
 */

const ROSTER_SHEET = 'Roster';
const BEHAVIOR_SHEET = 'Behavior';
const BEHAVIOR_HEADERS = ['ID', 'When', 'Period', 'Student', 'Tag', 'Note'];
const B = { id: 0, when: 1, period: 2, student: 3, tag: 4, note: 5 };

// kind: 'pos' counts toward positive notes home, 'neg' toward check-ins,
// 'att' (attendance) is logged but never triggers anything.
const TAGS = [
  { name: 'Positive', kind: 'pos' },
  { name: 'Redirect', kind: 'neg' },
  { name: 'Disruption', kind: 'neg' },
  { name: 'Absent/Late', kind: 'att' },
];

const PATTERN_DAYS = 7;          // about 5 school days
const NEG_THRESHOLD = 3;         // negatives in PATTERN_DAYS -> "check in or contact home"
const POS_THRESHOLD = 3;         // positives in PATTERN_DAYS -> "send a positive note home"
const POSITIVE_NOTES = true;

/** Creates the Roster and Behavior tabs. Paste your roster into Roster afterward. */
function setupBehavior() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let roster = ss.getSheetByName(ROSTER_SHEET);
  if (!roster) {
    roster = ss.insertSheet(ROSTER_SHEET);
    roster.getRange(1, 1, 1, 2).setValues([['Period', 'Student']]).setFontWeight('bold');
    roster.setFrozenRows(1);
  }
  let log = ss.getSheetByName(BEHAVIOR_SHEET);
  if (!log) {
    log = ss.insertSheet(BEHAVIOR_SHEET);
    log.getRange(1, 1, 1, BEHAVIOR_HEADERS.length).setValues([BEHAVIOR_HEADERS]).setFontWeight('bold');
    log.setFrozenRows(1);
    log.getRange('B:B').setNumberFormat('ddd mmm d h:mm am/pm');
  }
  SpreadsheetApp.getUi().alert(
    'Behavior log is set up.\n\nOpen the Roster tab and paste your classes: period in column A, ' +
      'student name in column B, one student per row. Then open your Prep Prepper page and tap "Log behavior".'
  );
}

function hub_() {
  return SpreadsheetApp.openById(PropertiesService.getScriptProperties().getProperty('HUB_ID'));
}

/** Roster grouped by period, plus the tag buttons, for the log page. */
function getRoster() {
  const sheet = hub_().getSheetByName(ROSTER_SHEET);
  if (!sheet) throw new Error('Run Prep Prepper > 4. Set up behavior log first.');
  const periods = {};
  if (sheet.getLastRow() >= 2) {
    sheet.getRange(2, 1, sheet.getLastRow() - 1, 2).getValues().forEach(r => {
      const period = String(r[0]).trim();
      const student = String(r[1]).trim();
      if (!period || !student) return;
      (periods[period] = periods[period] || []).push(student);
    });
  }
  Object.keys(periods).forEach(p => periods[p].sort());
  return { periods: periods, tags: TAGS.map(t => t.name), today: todaysCounts_() };
}

/** Saves one entry and returns its ID so the page can offer Undo. */
function logBehavior(period, student, tag, note) {
  if (!TAGS.some(t => t.name === tag)) throw new Error('Unknown tag: ' + tag);
  const id = Utilities.getUuid();
  hub_().getSheetByName(BEHAVIOR_SHEET).appendRow([id, new Date(), period, student, tag, note || '']);
  checkPatterns_();
  return { id: id, today: todaysCounts_() };
}

function undoBehavior(id) {
  const sheet = hub_().getSheetByName(BEHAVIOR_SHEET);
  if (sheet.getLastRow() >= 2) {
    const ids = sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getValues();
    const i = ids.findIndex(r => String(r[0]) === String(id));
    if (i >= 0) sheet.deleteRow(i + 2);
  }
  return { today: todaysCounts_() };
}

/** How many entries each student has today, so the page can show a small count. */
function todaysCounts_() {
  const counts = {};
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  behaviorRowsSince_(start).forEach(r => {
    const k = r[B.student];
    counts[k] = (counts[k] || 0) + 1;
  });
  return counts;
}

function behaviorRowsSince_(since) {
  const sheet = hub_().getSheetByName(BEHAVIOR_SHEET);
  if (!sheet || sheet.getLastRow() < 2) return [];
  return sheet.getRange(2, 1, sheet.getLastRow() - 1, BEHAVIOR_HEADERS.length).getValues()
    .filter(r => r[B.when] instanceof Date && r[B.when] >= since);
}

/**
 * Turns patterns into to-dos. At most one check-in task and one positive-note
 * task per student every PATTERN_DAYS days.
 */
function checkPatterns_() {
  const since = new Date(Date.now() - PATTERN_DAYS * 864e5);
  const kindOf = {};
  TAGS.forEach(t => { kindOf[t.name] = t.kind; });

  const tally = {};
  behaviorRowsSince_(since).forEach(r => {
    const s = r[B.student];
    const t = tally[s] = tally[s] || { neg: 0, pos: 0, tags: {}, period: r[B.period] };
    const kind = kindOf[r[B.tag]];
    if (kind === 'neg' || kind === 'pos') t[kind]++;
    t.tags[r[B.tag]] = (t.tags[r[B.tag]] || 0) + 1;
  });

  if (!Object.keys(tally).length) return;
  const recent = recentBehaviorTaskKeys_(since);
  const link = hub_().getUrl() + '#gid=' + hub_().getSheetByName(BEHAVIOR_SHEET).getSheetId();
  const today = new Date();
  const inDays = n => new Date(today.getFullYear(), today.getMonth(), today.getDate() + n);
  const stamp = Utilities.formatDate(today, Session.getScriptTimeZone(), 'yyyy-MM-dd');

  Object.keys(tally).forEach(student => {
    const t = tally[student];
    if (t.neg >= NEG_THRESHOLD && !recent.has('behavior-neg:' + student)) {
      const detail = Object.keys(t.tags)
        .filter(tag => kindOf[tag] === 'neg')
        .map(tag => t.tags[tag] + ' ' + tag.toLowerCase())
        .join(', ');
      addTask_({
        task: 'Check in or contact home: ' + student + ' (' + detail + ' this week)',
        due: inDays(2),
        minutes: 10,
        source: 'Behavior log, period ' + t.period,
        link: link,
        key: 'behavior-neg:' + student + ':' + stamp,
      });
    }
    if (POSITIVE_NOTES && t.pos >= POS_THRESHOLD && !recent.has('behavior-pos:' + student)) {
      addTask_({
        task: 'Send a positive note home: ' + student + ' (' + t.pos + ' positives this week)',
        due: inDays(3),
        minutes: 2,
        source: 'Behavior log, period ' + t.period,
        link: link,
        key: 'behavior-pos:' + student + ':' + stamp,
      });
    }
  });
}

/** "behavior-neg:Name" / "behavior-pos:Name" for behavior tasks added since the given date. */
function recentBehaviorTaskKeys_(since) {
  const sheet = tasksSheet_();
  const keys = new Set();
  if (sheet.getLastRow() < 2) return keys;
  sheet.getRange(2, 1, sheet.getLastRow() - 1, HEADERS.length).getValues().forEach(r => {
    const key = String(r[COL.key] || '');
    if (key.indexOf('behavior-') !== 0 || !(r[COL.added] instanceof Date) || r[COL.added] < since) return;
    keys.add(key.slice(0, key.lastIndexOf(':')));
  });
  return keys;
}
