# Prep Prepper: step 1 setup (about 10 minutes, one time)

Do all of this while signed in to your **school** Google account.

## 1. Make the hub spreadsheet
1. Go to sheets.new and name the sheet **Prep Prepper**.
2. Click **Extensions > Apps Script**. A code editor opens in a new tab.

## 2. Paste the code
1. In the editor, click `Code.gs` on the left, delete what's there, and paste in everything from [`Code.gs`](Code.gs).
2. Click the **+** next to "Files", choose **HTML**, and name it `Index` (no `.html`). Paste in everything from [`Index.html`](Index.html).
3. Click the save icon.

## 3. Run setup
1. Go back to the spreadsheet tab and reload the page. A **Prep Prepper** menu appears at the top, next to Help.
2. Click **Prep Prepper > 1. Set up**. Google asks you to authorize the script. Click through the prompts.
   If you see "Google hasn't verified this app", click **Advanced > Go to Prep Prepper**. That's normal for a script you wrote yourself.
3. Click **Prep Prepper > 2. Test Gmail and Drive access**, authorize again, and **tell Claude what the pop-up says** (OK or BLOCKED for each).

## 4. Turn on the web page
1. In the Apps Script tab, click **Deploy > New deployment**.
2. Click the gear next to "Select type" and choose **Web app**.
3. Set **Execute as: Me** and **Who has access: Only myself**.
4. Click **Deploy** and copy the **Web app URL**. Bookmark it, since that's your Prep Prepper page.

## Using it
- Type anything into **Brain dump**, one item per line, then click **Add to list**. It picks up deadlines like "tomorrow", "Friday", "by Thu", "10/31" or "Oct 31", and time estimates like "5 min".
- Tick the box to mark something done.
- The **Tasks** tab in the spreadsheet holds everything, so you can edit it there too.

## When the code changes later
Paste the new code over the old, save, then go to **Deploy > Manage deployments**, click the pencil, choose **Version: New version**, and click **Deploy**. The URL stays the same.
