# Google Sheets Backend Setup

To enable automatic submissions, we need a simple script to receive the data and save it to a Google Sheet.

## Step 1: Create the Sheet

1. Go to [sheets.google.com](https://sheets.google.com/create) and create a new blank spreadsheet.
2. Name it **"NHL Playoffs Picks"**.
3. Rename "Sheet1" to **"Picks"**.
4. Add the following headers to the first row (A1:R1):
   `Timestamp`, `Name`, `Series 1 Winner`, `Games`, `Series 2 Winner`, `Games`, `Series 3 Winner`, `Games`, `Series 4 Winner`, `Games`, `Series 5 Winner`, `Games`, `Series 6 Winner`, `Games`, `Series 7 Winner`, `Games`, `Series 8 Winner`, `Games`

## Step 2: Add the Script

1. In your Google Sheet, click **Extensions** > **Apps Script**.
2. Delete any code in the editor (`myFunction`...) and paste this **exact** code:

```javascript
// CONFIGURATION
const SHEET_NAME = 'Picks';
const PASSCODE = 'cup2025'; // CHANGE THIS TO YOUR SECRET CODE!

function doPost(e) {
	const lock = LockService.getScriptLock();
	lock.tryLock(10000);

	try {
		const doc = SpreadsheetApp.getActiveSpreadsheet();
		const sheet = doc.getSheetByName(SHEET_NAME);

		// Parse data
		const data = JSON.parse(e.postData.contents);

		// SECURITY 1: Check Passcode
		if (!data.passcode || data.passcode.toLowerCase() !== PASSCODE) {
			return ContentService.createTextOutput(
				JSON.stringify({ result: 'error', error: 'Invalid Passcode' }),
			).setMimeType(ContentService.MimeType.JSON);
		}

		// SECURITY 2: Check for Duplicates
		// We check Column B (Name) to see if this person already submitted
		const existingData = sheet.getDataRange().getValues();
		// Start loop at 1 to skip header
		for (let i = 1; i < existingData.length; i++) {
			if (existingData[i][1] === data.name) {
				return ContentService.createTextOutput(
					JSON.stringify({ result: 'error', error: 'Duplicate: ' + data.name + ' has already submitted!' }),
				).setMimeType(ContentService.MimeType.JSON);
			}
		}

		// Create the row
		const timestamp = new Date();

		let row = [timestamp, data.name];

		data.picks.forEach((pick) => {
			row.push(pick.winner);
			row.push(pick.games);
		});

		sheet.appendRow(row);

		return ContentService.createTextOutput(JSON.stringify({ result: 'success', row: row.length })).setMimeType(
			ContentService.MimeType.JSON,
		);
	} catch (e) {
		return ContentService.createTextOutput(JSON.stringify({ result: 'error', error: e.toString() })).setMimeType(
			ContentService.MimeType.JSON,
		);
	} finally {
		lock.releaseLock();
	}
}
```

3. Click the **Save** icon (disk). Name the project "Playoffs Backend".

## Step 3: Deploy

1. Click the blue **Deploy** button (top right) > **New deployment**.
2. Click the specific **"Select type"** gear icon > **Web app**.
3. Description: `v1`.
4. **Execute as**: `Me` (your email).
5. **Who has access**: `Anyone` (IMPORTANT: This allows your site visitors to submit).
6. Click **Deploy**.
7. Authorize the script (Click "Review permissions", choose your account, click "Advanced" > "Go to Playoffs Backend (unsafe)" > "Allow").
8. **COPY** the "Web App URL".

## Step 4: Connect to Site

1. Open `playoffs/js/config.js` in your project.
2. Paste the URL into the `GOOGLE_SCRIPT_URL` variable.
