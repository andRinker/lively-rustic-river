# Prep Prepper

Does a teacher's back-office busywork so they show up to prep with a short checklist of doable to-dos, ranked by deadline. Lesson planning, grading, and judgment calls stay with the teacher.

It runs entirely inside the school's Google Workspace: a Google Sheet plus Apps Script, so student data never leaves school Google. Gemini interprets email, data exports feed intervention groups, and a behavior form and a brain-dump box cover everything else.

## How installing and updating work

```
starter/Code.gs     pasted into Apps Script once; never changes
app/                the real app (Code.js, Index.html) and changes.json (what's new, in plain words)
release/            built from app/; the sheet downloads these two files
tools/build.js      builds and checks release/
test/               runs the starter and the app inside a simulated Apps Script
docs/               install steps for the teacher and wording for rebuild-prompt.md
```

The starter keeps the downloaded app in script properties (two slots: current and previous), so an update never touches the Tasks sheet and **Undo last update** is instant. Downloads are checked against a SHA-256 from `release/manifest.json`, loaded as a test, and only then switched to.

Teacher-facing steps: [docs/ONE-CLICK-SETUP.md](docs/ONE-CLICK-SETUP.md)

## Shipping a change

1. Edit `app/Code.js` and/or `app/Index.html`.
2. Add a **new entry at the top** of `app/changes.json` with a higher version and plain-language notes (these are what the teacher reads before clicking Yes).
3. `node tools/build.js`, then `node --test test/starter.test.js`.
4. Merge to `main`. The next **Check for updates** picks it up.

CI fails the pull request if the release files are stale or the app changed without a version bump.

If the app needs a Google service the starter doesn't already mention (see `declareAccess_` in `starter/Code.gs`), the teacher has to paste a new starter once, so avoid that where you can.

## Version
Current version and phase: [VERSION](VERSION). History: [CHANGELOG.md](CHANGELOG.md). The page footer shows the same number.

## Older files

`archive/phase-1-2-original-paste-in/` is the original paste-in version of the hub ([`SETUP.md`](archive/phase-1-2-original-paste-in/SETUP.md)). Use the starter and one-click steps above instead; `app/` is the same app, kept current.
