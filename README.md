# Prep Prepper

A prep-time to-do list for a teacher, running as a Google Sheet plus an Apps Script web page inside the school Google account. Student data never leaves school Google.

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
