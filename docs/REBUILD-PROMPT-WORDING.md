# Wording to add to `rebuild-prompt.md`

Replace the last bullet of the "Setup has to be simple" section (the line starting "I'm not a developer. The first version meant pasting code...") with the paragraph below. It keeps the ask, but tells the builder what already works and what the limits are, so it doesn't propose options that this school account rules out.

---

**Setup and updates have to be nearly zero-effort.** I'm not a developer, and the first version meant pasting code into Apps Script and redeploying by hand for every update. That got old. What I need now:

- **Install once, update with one click.** The thing I install should be a small, permanent starter that never changes. The real app lives in a GitHub repo and is pulled in by a **Prep Prepper > Check for updates** menu item in the sheet, plus an "Update available" banner on the web page. Each update shows me what changed in plain words and installs only after I click Yes.
- **Undo.** Keep the previous version so one click puts it back. A broken download or code that won't load must never replace the working version.
- **Same web page link forever.** The deployed web app should never need redeploying for an update. Keep my Tasks, student profiles, and settings out of the code, so an update can never touch them.
- **Student data stays inside school Google.** Only code travels from GitHub to my account, never data in the other direction. Don't use clasp tokens, GitHub Actions secrets, or a Google Cloud project, since a school account may not allow them and I don't want a key to my school account stored anywhere outside it.
- **Declare permissions up front.** A new Google permission can't arrive through an update, because it needs me to re-authorize. List every Google service the app will ever need in the starter, and tell me when one more is required.
- **Verify downloads.** Check a checksum, refuse anything that doesn't match, and run the new code through a load test before switching to it.
- **Release process for you, the builder.** A build script turns the app files and a plain-language changelog into the release files, and a check fails any change that alters the app without bumping the version. Tests run the starter and app inside a simulated Apps Script.

A working version of this already exists in the repo (`starter/`, `app/`, `release/`, `tools/`, `test/`). Reuse it, or tell me what you'd change and why.
