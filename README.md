# Golf Value Monitor V6.1

Retains V6 functionality, adding **safe named-worksheet selection for OneDrive StDev sync**.

- OneDrive refresh uses the worksheet named exactly `PGA STDEV`, regardless of tab order or internal worksheet XML filename.
- Reads player names from column A and adjusted standard deviations from column D.
- Validates the workbook sheet-to-relationship mapping; fails safely if the sheet is missing or invalid.
- Never replaces the previous StDev data on a failed refresh.
- After a successful refresh, displays valid StDev count, current-round match count, and a five-player preview.
- Existing manual XLSX/CSV upload, DataGolf player order/tee times, four sportsbook boards and local storage are unchanged.

## Install

Replace `index.html` in the GitHub repo and commit; wait for Netlify to publish. Hard-refresh the website. No new Microsoft permissions are needed. Connect your Microsoft account if the previous session has expired, select the workbook, then click Refresh StDevs.

The OneDrive sync depends on Microsoft Graph access and the selected workbook being available; a successful real-account refresh still needs browser testing.
