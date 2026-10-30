# Prep Prepper: behavior log (about 10 minutes, one time)

You get a phone page where logging takes two taps: tap a student, then a tag. The hub watches for patterns and adds to-dos:
- **3 negatives (Redirect or Disruption) in a week** adds "Check in or contact home: [student]", due in 2 days.
- **3 positives in a week** adds "Send a positive note home: [student]", a 2-minute task.
- **Absent/Late** is logged for your records and never triggers a task.

Names stay in your Prep Prepper sheet (the Roster and Behavior tabs). They're never sent anywhere.

## 1. Add the code
1. Open your Prep Prepper sheet, then **Extensions > Apps Script**.
2. Replace `Code.gs` and `Index` with the new [`Code.gs`](Code.gs) and [`Index.html`](Index.html).
3. Click **+ > Script**, name it `Behavior`, and paste in [`Behavior.gs`](Behavior.gs).
4. Click **+ > HTML**, name it `Log`, and paste in [`Log.html`](Log.html).
5. Click save, then **Deploy > Manage deployments >** pencil **> Version: New version > Deploy**.

## 2. Set up your roster
1. Reload the sheet and click **Prep Prepper > 4. Set up behavior log**.
2. In the new **Roster** tab, paste your classes: **period in column A, student name in column B**, one student per row. A PowerSchool class roster export works: copy the two columns across.

## 3. Put it on your phone
1. On your Prep Prepper page, click **Log behavior →**.
2. On your phone, open that page (signed in to your school account) and use **Add to Home Screen**. It opens to the last period you used.

## Logging
Pick the period, tap a student, then tap a tag. Add a note first if you want one. Each entry shows an **Undo** for 5 seconds. Students show how many times you've logged them today.
