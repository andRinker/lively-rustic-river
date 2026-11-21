# Prep Prepper: updating to step 2 (about 5 minutes)

Step 2 makes the hub pull tasks in on its own. Every hour it scans your Gmail inbox and the Drive files shared with you, and it adds anything that asks you to do something: forms, RSVPs, signatures, replies, deadlines. There's also a Gemini box for the messy emails the scanner can't sort out.

## 1. Paste the new code
1. Open your Prep Prepper sheet, then **Extensions > Apps Script**.
2. Replace everything in `Code.gs` with the new [`Code.gs`](Code.gs).
3. Replace everything in `Index` with the new [`Index.html`](Index.html).
4. Click save.

## 2. Turn on the hourly scan
1. Go back to the sheet and reload it.
2. Click **Prep Prepper > 3. Turn on hourly scan**. Google asks for permission again, because the scan now runs on a timer. Click through it.
3. The first scan runs right away and covers the last 3 days. A pop-up tells you how many tasks it found.

## 3. Update the web page
In Apps Script, click **Deploy > Manage deployments**, click the pencil, choose **Version: New version**, and click **Deploy**. Your bookmark stays the same.

## What's new on the page
- **Scan Gmail and Drive now**: scans on the spot (it also runs every hour without you).
- **✕ next to a task**: means "not really a task". It disappears and never comes back.
- **From Gemini**: copy the prompt, paste it into gemini.google.com, then paste Gemini's answer back into the box. Duplicates are skipped.

## What the scanner looks for
An inbox email (not promotions, social, or ones you sent) becomes a task when it has a Google Form link or action words like *please, due, deadline, submit, sign, RSVP, reply, required*. It picks up the deadline from the subject or the email and links straight to the form or the email. Drive files someone shared with you or changed become "Look over" tasks. Expect a few false alarms at first. Click ✕ on them and tell Claude which ones, so the rules can be tuned.
