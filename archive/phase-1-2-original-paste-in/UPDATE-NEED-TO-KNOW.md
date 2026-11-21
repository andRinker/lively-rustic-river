# Prep Prepper: "Need to know" update (about 3 minutes)

This replaces the earlier tuning update. If you skipped that one, this covers it too.

## What changed
- **Announcements come through without cluttering your to-dos.** Newsletters, all-staff emails, and mailing-list mail go to a new **Need to know** section. If one has a form or a real deadline, it also goes on your to-do list.
- **Gemini writes the gist.** The new Gemini prompt does two jobs. It finds tasks the scanner missed, and it boils each announcement down to one sentence of what actually affects you. Paste Gemini's answer back in, and each gist lands on its announcement.
- **Click "Got it"** to clear an announcement once you've read it.
- **Your to-do list is tighter.** Soft words like "please" and "reminder" no longer create tasks. Email tasks close themselves once you've replied, archived, or deleted the email. The page shows your top 10 by deadline, and the rest are folded under **Later**.

## Steps
1. In Apps Script, replace `Code.gs` and `Index` with the new [`Code.gs`](Code.gs) and [`Index.html`](Index.html), then save.
2. **Deploy > Manage deployments >** pencil **> Version: New version > Deploy.**
3. Reload the sheet and click **Prep Prepper > Re-check my list with the latest rules**. This moves the announcements already on your list into Need to know.
4. Open your Prep Prepper page, click **Copy prompt** (the prompt is new), run it in Gemini, and paste the whole answer into the box.
