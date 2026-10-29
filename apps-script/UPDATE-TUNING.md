# Prep Prepper: tuning update (about 3 minutes)

What changed:
- **Announcements are filtered out.** Newsletters, mailing lists, all-staff groups, and anything that reached you by BCC only become tasks when they have a Google Form or a real deadline.
- **Fewer trigger words.** Soft words like "please", "reminder" and "make sure" no longer count. It now looks for real asks: due, deadline, submit, sign, RSVP, "please reply", "let me know", and so on.
- **It notices what you've handled.** An email task closes itself when you've replied, or when you've archived or deleted the email. In the Tasks sheet it shows as `auto-done`, and you can change it back to `open` if that was wrong.
- **A shorter page.** You see your top 10 by deadline, and the rest are folded under **Later**.

## Steps
1. In Apps Script, replace `Code.gs` and `Index` with the new [`Code.gs`](Code.gs) and [`Index.html`](Index.html), then save.
2. **Deploy > Manage deployments >** pencil **> Version: New version > Deploy.**
3. Reload the sheet and click **Prep Prepper > Re-check my list with the latest rules**. It clears the announcements already on your list and tells you how many tasks are left.
