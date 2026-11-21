# Prep Prepper: switch to one-click updates (about 10 minutes, one time)

This is the last time you paste code. After this, an update is **Prep Prepper > Check for updates > Yes**.

Do all of this signed in to your **school** Google account, in the same Prep Prepper sheet you already use. Your Tasks, your page link, and your hourly scan all carry over.

## Before you start
Merge the pull request that adds this setup (the green **Merge** button on its GitHub page). The update files have to be on GitHub's main branch before the sheet can find them.

## 1. Replace the code
1. In your Prep Prepper sheet, click **Extensions > Apps Script**.
2. Click `Code.gs` on the left, select everything, delete it, and paste in everything from [`starter/Code.gs`](../starter/Code.gs).
3. Click the three dots next to the `Index` file on the left, choose **Remove**, and confirm. (The page now comes from the update, not from this file.)
4. Click the save icon.

## 2. Install Prep Prepper
1. Go back to the sheet tab and reload it. The **Prep Prepper** menu now has just one item: **Install Prep Prepper**.
2. Click it. Google asks you to authorize the script. If you see "Google hasn't verified this app", click **Advanced > Go to Prep Prepper**, then allow. This is the same kind of permission screen you saw before, plus permission to download the update from GitHub.
3. A box lists what's in the version. Click **Yes**. When it says Done, your full menu is back.

If the box says it could not reach GitHub, your school may block that. Nothing has changed. Tell Claude exactly what it says.

## 3. Refresh the web page one last time
1. In the Apps Script tab, click **Deploy > Manage deployments**.
2. Click the pencil, choose **Version: New version**, and click **Deploy**. Your link stays the same.
3. Open your Prep Prepper page. At the bottom it should say **Version 1.0.0**.

If you had the hourly scan on, it keeps running. Nothing else to set up.

## Updating from now on
Either one:
- **In the sheet:** Prep Prepper > **Check for updates**. It lists what's new. Click **Yes** to install, then reload your page.
- **On the page:** when an update is ready, a box appears at the top with what changed. Click **Install update**, then **Reload Prep Prepper**.

The sheet menu also says "(new version ready)" once the hourly scan notices one.

If an update ever acts strangely, click **Prep Prepper > Undo last update**. Your tasks are never touched either way.

## What you should know
- **Only code comes from GitHub, and only when you say yes.** Nothing about your email, Drive, or students is ever sent out.
- **Whoever can edit the GitHub repo can change what gets installed.** Keep two-step sign-in on your GitHub account, and only add people you trust.
- **The starter almost never changes.** If a future feature needs a brand new Google permission, you'll be asked to paste a new starter once more. Claude will tell you.
