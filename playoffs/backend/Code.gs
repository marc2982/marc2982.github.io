/**
 * Playoff Picks Backend (Google Apps Script)
 *
 * This script receives JSON submissions from the pick'em site,
 * appends them to a Google Sheet (as a backup), and commits
 * the new data directly to the GitHub repository.
 */

// --- CONFIGURATION ---
const PASSCODE = ''; // Must match picks.js passcode
const GITHUB_REPO_OWNER = 'marc2982';
const GITHUB_REPO_NAME = 'marc2982.github.io';
const GITHUB_BRANCH = 'main'; // Use 'main' or the name of your active branch (e.g., 'testing')

// --- BACKUP SETTINGS ---
const DRIVE_FOLDER_NAME = 'Hockey Draft';
const FILE_NAME_TEMPLATE = '{year} Bryan Family Hockey Draft Picks';

// Ensure you set GITHUB_TOKEN in Script Properties (Settings > Script Properties)
const GITHUB_TOKEN = PropertiesService.getScriptProperties().getProperty('GITHUB_TOKEN');

function doPost(e) {
	const lock = LockService.getScriptLock();
	lock.tryLock(10000); // 10s timeout

	try {
		const data = JSON.parse(e.postData.contents);

		// 1. Security Check
		const receivedPass = (data.passcode || '').toString().trim();
		const expectedPass = PASSCODE.trim();

		if (receivedPass !== expectedPass) {
			console.warn(`Invalid Passcode attempt. Received: "${receivedPass}"`);
			return respond({ result: 'error', error: 'Invalid Passcode' });
		}

		// 2. Prepare Data
		const year = data.year || 2026;
		const roundNum = data.round || 1;
		const name = data.name;
		const timestamp = new Date();
		const timestampStr = Utilities.formatDate(timestamp, 'GMT', 'M/d/yyyy H:mm:ss');

		// 3. Security 1: Check for Duplicates in the backup sheet
		// This prevents low-effort spamming or accidental double-clicks.
		const sheetName = `round${roundNum}`;
		try {
			const ss = getOrCreateYearlySpreadsheet(year);
			if (ss) {
				let sheet = ss.getSheetByName(sheetName);
				if (sheet) {
					const existingData = sheet.getDataRange().getValues();
					for (let i = 1; i < existingData.length; i++) {
						// Column B is Name (index 1)
						if (existingData[i][1] === name) {
							return respond({
								result: 'error',
								error: `Duplicate: ${name} has already submitted for round ${roundNum}!`,
							});
						}
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

		// 3. Backup to Google Sheet (Organized by year and round)
		try {
			const ss = getOrCreateYearlySpreadsheet(year);
			if (ss) {
				let sheet = ss.getSheetByName(sheetName);
				if (!sheet) {
					sheet = ss.insertSheet(sheetName);
					// Header: Timestamp, Name, Team, Games, Team, Games...
					let headers = ['Timestamp', 'Name'];
					for (let i = 0; i < data.picks.length; i++) {
						headers.push('Team', 'Games');
					}
					sheet.appendRow(headers);
				}
				sheet.appendRow(csvRow);
			}
		} catch (sheetErr) {
			console.error('Sheet backup failed:', sheetErr);
		}

		// 4. Update GitHub
		if (GITHUB_TOKEN) {
			const filePath = `playoffs/data/archive/${year}/round${roundNum}.csv`;
			updateGitHubFile(filePath, csvRow.join(','), `Picks submission: ${name}`);

			// 5. Ensure year is in the home page index
			ensureYearInIndex(year);
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
		const fetchUrl = url + '?ref=' + GITHUB_BRANCH;
		const response = UrlFetchApp.fetch(fetchUrl, { headers: headers, muteHttpExceptions: true });
		if (response.getResponseCode() === 200) {
			const json = JSON.parse(response.getContentText());
			sha = json.sha;
			existingContent = Utilities.newBlob(Utilities.base64Decode(json.content)).getDataAsString();
		} else if (response.getResponseCode() === 404) {
			// File doesn't exist yet, create a dynamic header based on the incoming row
			const rowArray = newRow.split(',');
			let header = 'Timestamp,Your name';
			const numSeries = (rowArray.length - 2) / 2;
			for (let i = 0; i < numSeries; i++) {
				header += `,Team,Games`;
			}
			existingContent = header + '\n';
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
		branch: GITHUB_BRANCH,
	};

	const options = {
		method: 'PUT',
		headers: headers,
		payload: JSON.stringify(payload),
		contentType: 'application/json',
	};

	const githubResponse = UrlFetchApp.fetch(url, options);
	console.log(`GitHub Response (${path}): ${githubResponse.getResponseCode()}`);
	if (githubResponse.getResponseCode() !== 200 && githubResponse.getResponseCode() !== 201) {
		console.error('GitHub Commit Failed:', githubResponse.getContentText());
		throw new Error('Failed to commit to GitHub: ' + githubResponse.getContentText());
	}
}

/**
 * Ensures the given year exists in data/summaries/yearly_index.json.
 * This makes the year show up in the "Yearly Results" table on the home page.
 */
function ensureYearInIndex(year) {
	const path = 'playoffs/data/summaries/yearly_index.json';
	const url = `https://api.github.com/repos/${GITHUB_REPO_OWNER}/${GITHUB_REPO_NAME}/contents/${path}`;
	const headers = {
		Authorization: 'token ' + GITHUB_TOKEN,
		Accept: 'application/vnd.github.v3+json',
	};

	try {
		// 1. Fetch current index
		const response = UrlFetchApp.fetch(url + '?ref=' + GITHUB_BRANCH, {
			headers: headers,
			muteHttpExceptions: true,
		});
		if (response.getResponseCode() !== 200) {
			console.error('Could not fetch yearly_index.json for update');
			return;
		}

		const fileData = JSON.parse(response.getContentText());
		const content = JSON.parse(Utilities.newBlob(Utilities.base64Decode(fileData.content)).getDataAsString());

		// 2. Check if year exists
		const yearStr = year.toString();
		if (content[yearStr]) {
			return; // Already indexed
		}

		console.log(`Adding year ${year} to yearly_index.json...`);

		// 3. Add skeleton entry for the new year
		content[yearStr] = {
			year: parseInt(year, 10),
			poolWinner: 'In Progress',
			poolLoser: null,
			cupWinner: null,
			points: {},
		};

		// 4. Push update to GitHub
		const payload = {
			message: `Automated: Added ${year} to yearly index`,
			content: Utilities.base64Encode(JSON.stringify(content, null, 2), Utilities.Charset.UTF_8),
			sha: fileData.sha,
			branch: GITHUB_BRANCH,
		};

		const updateResponse = UrlFetchApp.fetch(url, {
			method: 'PUT',
			headers: headers,
			payload: JSON.stringify(payload),
			contentType: 'application/json',
		});

		console.log(`Yearly index updated for ${year}: ${updateResponse.getResponseCode()}`);
	} catch (e) {
		console.error('Error in ensureYearInIndex:', e);
	}
}

function respond(obj) {
	return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/**
 * Robustly gets or creates the yearly spreadsheet inside the specified Drive folder.
 */
function getOrCreateYearlySpreadsheet(year) {
	try {
		// 1. Get or create the folder
		let folder;
		const folders = DriveApp.getFoldersByName(DRIVE_FOLDER_NAME);
		if (folders.hasNext()) {
			folder = folders.next();
		} else {
			folder = DriveApp.createFolder(DRIVE_FOLDER_NAME);
		}

		// 2. Look for the yearly file
		const fileName = FILE_NAME_TEMPLATE.replace('{year}', year);
		const files = folder.getFilesByName(fileName);
		if (files.hasNext()) {
			return SpreadsheetApp.open(files.next());
		}

		// 3. Create a new spreadsheet if not found
		const newSS = SpreadsheetApp.create(fileName);
		const ssFile = DriveApp.getFileById(newSS.getId());
		ssFile.moveTo(folder);

		// Remove the default "Sheet1" if we're feeling fancy later,
		// but let's keep it simple for now.
		return newSS;
	} catch (e) {
		console.error('Error in getOrCreateYearlySpreadsheet:', e);
		return null;
	}
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
	const testYear = 2050;

	const testPicks = [
		// test the spreadsheet is created correctly
		{
			round: 1,
			picks: [
				{ winner: 'FLA', games: 4 },
				{ winner: 'TOR', games: 7 },
			],
		},
		// test picks are appended in the correct round
		{
			round: 1,
			picks: [
				{ winner: 'EDM', games: 5 },
				{ winner: 'BUF', games: 6 },
			],
		},
		// test writing to new round
		{
			round: 2,
			picks: [
				{ winner: 'CAR', games: 7 },
				{ winner: 'MIN', games: 5 },
			],
		},
	];

	testPicks.forEach((p, i) => {
		const mockEvent = {
			postData: {
				contents: JSON.stringify({
					passcode: PASSCODE,
					name: `Test Runner ${i}`,
					year: testYear,
					round: p.round,
					picks: p.picks,
				}),
			},
		};

		const result = doPost(mockEvent);
		Logger.log(`Result ${i}: ` + result.getContent());
	});

	Logger.log('Dont forget to check the git history!');
}
