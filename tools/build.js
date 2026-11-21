#!/usr/bin/env node
// Builds release/manifest.json and release/bundle.json from app/.
//   node tools/build.js           write the release files
//   node tools/build.js --check   fail if they are out of date (used by CI)
//
// To ship a change: edit app/Code.js or app/Index.html, add a NEW entry at the top of
// app/changes.json (newer version, plain-language notes), then run this.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const root = path.join(__dirname, '..');
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');
const SEMVER = /^\d+\.\d+\.\d+$/;

function cmp(a, b) {
  const x = a.split('.').map(Number);
  const y = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] > y[i] ? 1 : -1;
  return 0;
}

function build() {
  const code = read('app/Code.js');
  const html = read('app/Index.html');
  const changes = JSON.parse(read('app/changes.json'));

  if (!Array.isArray(changes) || !changes.length) throw new Error('app/changes.json needs at least one entry.');
  changes.forEach((c, i) => {
    if (!SEMVER.test(c.version)) throw new Error('Bad version in changes.json: ' + c.version);
    if (!Array.isArray(c.notes) || !c.notes.length || c.notes.some(n => typeof n !== 'string' || !n.trim())) {
      throw new Error('Version ' + c.version + ' needs plain-language notes.');
    }
    if (i && cmp(changes[i - 1].version, c.version) <= 0) throw new Error('changes.json must list newest first.');
  });

  // An entry may say "needsStarter": 2 when the app can't run on the starter people already have.
  const needsStarter = changes[0].needsStarter === undefined ? 1 : changes[0].needsStarter;
  if (!Number.isInteger(needsStarter) || needsStarter < 1) throw new Error('needsStarter must be a whole number, 1 or more.');
  const starterNow = Number((read('starter/Code.gs').match(/const PP_STARTER = (\d+);/) || [])[1]);
  if (!starterNow) throw new Error('Could not find PP_STARTER in starter/Code.gs.');
  if (needsStarter > starterNow) {
    throw new Error('This release needs starter ' + needsStarter + ' but starter/Code.gs is generation ' + starterNow + '. Bump PP_STARTER there too.');
  }

  // Must match hashOf_ in starter/Code.gs.
  const sha256 = crypto.createHash('sha256').update(code + '\u0000' + html, 'utf8').digest('hex');
  const version = changes[0].version;
  return {
    version,
    sha256,
    files: {
      'release/bundle.json': JSON.stringify({ version, sha256, files: { 'Code.js': code, 'Index.html': html } }) + '\n',
      'release/manifest.json': JSON.stringify({ version, sha256, needsStarter, history: changes.slice(0, 10).map(({ version, notes }) => ({ version, notes })) }, null, 2) + '\n',
    },
  };
}

function main() {
  const built = build();
  if (process.argv.includes('--check')) {
    let bad = false;
    for (const [rel, text] of Object.entries(built.files)) {
      const have = fs.existsSync(path.join(root, rel)) ? read(rel) : null;
      if (have !== text) {
        console.error(rel + ' is out of date. Run: node tools/build.js');
        bad = true;
      }
    }
    // Same code under the same version number would never reach anyone who is already on it.
    try {
      const main = JSON.parse(execFileSync('git', ['show', 'origin/main:release/manifest.json'], { cwd: root, stdio: ['ignore', 'pipe', 'ignore'] }).toString());
      if (main.sha256 !== built.sha256 && main.version === built.version) {
        console.error('The app code changed but the version is still ' + built.version + '. Add a new entry to app/changes.json.');
        bad = true;
      }
      if (cmp(built.version, main.version) < 0) {
        console.error('Version ' + built.version + ' is older than the one on main (' + main.version + ').');
        bad = true;
      }
    } catch (e) { /* no main to compare with yet */ }
    if (bad) process.exit(1);
    console.log('Release files are up to date (version ' + built.version + ').');
    return;
  }
  fs.mkdirSync(path.join(root, 'release'), { recursive: true });
  for (const [rel, text] of Object.entries(built.files)) fs.writeFileSync(path.join(root, rel), text);
  console.log('Built version ' + built.version + ' (' + built.sha256.slice(0, 12) + ').');
}

main();
