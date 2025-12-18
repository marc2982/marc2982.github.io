/**
 * Playoff Picks Backend (Google Apps Script)
 *
 * This script receives JSON submissions from the pick'em site,
 * appends them to a Google Sheet (as a backup), and commits
 * the new data directly to the GitHub repository.
 */

// --- CONFIGURATION ---
const PASSCODE = 'cup2025'; // Must match picks.js passcode
const GITHUB_REPO_OWNER = 'marc2982';
const GITHUB_REPO_NAME = 'marc2982.github.io';
const SHEET_NAME = 'Picks';

// Ensure you set GITHUB_TOKEN in Script Properties (Settings > Script Properties)
const GITHUB_TOKEN = PropertiesService.getScriptProperties().getProperty('GITHUB_TOKEN');

function doPost(e) {
	const lock = LockService.getScriptLock();
	lock.tryLock(10000); // 10s timeout

	try {
		const data = JSON.parse(e.postData.contents);

		// 1. Security Check
		if (!data.passcode || data.passcode.toLowerCase() !== PASSCODE) {
			return respond({ result: 'error', error: 'Invalid Passcode' });
		}

		// 2. Prepare Data
		const year = data.year || 2025;
		const roundNum = data.round || 1;
		const name = data.name;
		const timestamp = new Date();
		const timestampStr = Utilities.formatDate(timestamp, 'GMT', 'M/d/yyyy H:mm:ss');

		// 3. Security 1: Check for Duplicates in the backup sheet
		// This prevents low-effort spamming or accidental double-clicks.
		try {
			const ss = SpreadsheetApp.getActiveSpreadsheet();
			let sheet = ss.getSheetByName(SHEET_NAME);
			if (sheet) {
				const existingData = sheet.getDataRange().getValues();
				for (let i = 1; i < existingData.length; i++) {
					// Column B is Name (index 1)
					if (existingData[i][1] === name) {
						return respond({ result: 'error', error: `Duplicate: ${name} has already submitted!` });
					}
				}
			}
		} catch (e) {
			console.warn('Duplicate check skipped (sheet error)', e);
		}

		// Format CSV row (Timestamp, Name, Team, Games, Team, Games...)
		let csvRow = [timestampStr, name];
		data.picks.forEach((p) => {
			csvRow.push(p.winner);
			csvRow.push(p.games);
		});

		// 3. Backup to Google Sheet (Optional but recommended)
		try {
			const ss = SpreadsheetApp.getActiveSpreadsheet();
			let sheet = ss.getSheetByName(SHEET_NAME);
			if (!sheet) {
				sheet = ss.insertSheet(SHEET_NAME);
				// Add generic headers if new sheet
				sheet.appendRow(['Timestamp', 'Name', 'Picks...']);
			}
			sheet.appendRow(csvRow);
		} catch (sheetErr) {
			console.error('Sheet backup failed:', sheetErr);
		}

		// 4. Update GitHub
		if (GITHUB_TOKEN) {
			const filePath = `playoffs/data/archive/${year}/round${roundNum}.csv`;
			updateGitHubFile(filePath, csvRow.join(','), `Picks submission: ${name}`);
		}

		return respond({ result: 'success' });
	} catch (err) {
		console.error(err);
		return respond({ result: 'error', error: err.toString() });
	} finally {
		lock.releaseLock();
	}
}

/**
 * Updates or creates a file in the GitHub repository.
 */
function updateGitHubFile(path, newRow, message) {
	const url = `https://api.github.com/repos/${GITHUB_REPO_OWNER}/${GITHUB_REPO_NAME}/contents/${path}`;
	const headers = {
		Authorization: 'token ' + GITHUB_TOKEN,
		Accept: 'application/vnd.github.v3+json',
	};

	let sha = null;
	let existingContent = '';

	// Try to get the existing file
	try {
		const response = UrlFetchApp.fetch(url, { headers: headers, muteHttpExceptions: true });
		if (response.getResponseCode() === 200) {
			const json = JSON.parse(response.getContentText());
			sha = json.sha;
			existingContent = Utilities.newBlob(Utilities.base64Decode(json.content)).getDataAsString();
		} else if (response.getResponseCode() === 404) {
			// File doesn't exist yet, we'll create it.
			// Start with a header row based on Round columns
			existingContent =
				'Timestamp,Your name,Team,Games,Team,Games,Team,Games,Team,Games,Team,Games,Team,Games,Team,Games,Team,Games\n';
		}
	} catch (e) {
		console.error('Error fetching file from GitHub:', e);
	}

	// Append the new row
	const updatedContent = existingContent.trim() + '\n' + newRow + '\n';

	// Commit to GitHub
	const payload = {
		message: message,
		content: Utilities.base64Encode(updatedContent, Utilities.Charset.UTF_8),
		sha: sha, // Required for updates, null for creates
	};

	const options = {
		method: 'PUT',
		headers: headers,
		payload: JSON.stringify(payload),
		contentType: 'application/json',
	};

	UrlFetchApp.fetch(url, options);
}

function respond(obj) {
	return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/**
 * Test function to verify script properties
 */
function testConfig() {
	Logger.log('Token exists: ' + (GITHUB_TOKEN ? 'YES' : 'NO'));
	Logger.log('Repo: ' + GITHUB_REPO_OWNER + '/' + GITHUB_REPO_NAME);
}

/**
 * MOCK TEST: Run this in the script editor to test the logic
 * without needing a real browser submission.
 */
function runMockTest() {
	const mockEvent = {
		postData: {
			contents: JSON.stringify({
				passcode: PASSCODE,
				name: 'Test Runner',
				year: 2025,
				round: 1,
				picks: [
					{ winner: 'FLA', games: 6 },
					{ winner: 'TOR', games: 7 },
				],
			}),
		},
	};

	const result = doPost(mockEvent);
	Logger.log('Result: ' + result.getContent());
}
