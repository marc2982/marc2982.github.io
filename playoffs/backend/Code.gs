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

// --- VALIDATION (pure functions; unit tested in js/tests/backend.test.js) ---
const WINNER_PATTERN = /^[A-Z]{2,3}( \(vs [A-Z]{2,3}\))?$/;
const TEST_YEAR = 3000;

/**
 * Validates and normalises an incoming submission.
 * @returns {{ok: boolean, error?: string, value?: {year:number, round:number, name:string, picks:{winner:string, games:number}[]}}}
 */
function validateSubmission(data) {
	if (!data || typeof data !== 'object') return { ok: false, error: 'Invalid request' };

	const year = Number(data.year);
	if (!Number.isInteger(year) || year < 1990 || year > TEST_YEAR) return { ok: false, error: 'Invalid year' };

	const round = Number(data.round);
	if (!Number.isInteger(round) || round < 1 || round > 4) return { ok: false, error: 'Invalid round' };

	const name = typeof data.name === 'string' ? data.name.trim() : '';
	if (!name || name.length > 40 || /[,\r\n"]/.test(name)) return { ok: false, error: 'Invalid name' };

	if (!Array.isArray(data.picks) || data.picks.length < 1 || data.picks.length > 8) {
		return { ok: false, error: 'Invalid picks' };
	}
	const picks = [];
	for (const p of data.picks) {
		const winner = p && typeof p.winner === 'string' ? p.winner.trim() : '';
		const games = p ? Number(p.games) : NaN;
		if (!WINNER_PATTERN.test(winner)) return { ok: false, error: 'Invalid pick: ' + winner };
		if (!Number.isInteger(games) || games < 4 || games > 7) return { ok: false, error: 'Invalid games for ' + winner };
		picks.push({ winner, games });
	}
	return { ok: true, value: { year, round, name, picks } };
}

/** Builds the CSV row: Timestamp, Name, Team, Games, ... */
function buildCsvRow(timestampStr, name, picks) {
	const row = [timestampStr, name];
	picks.forEach((p) => {
		row.push(p.winner);
		row.push(p.games);
	});
	return row;
}

/** True if the CSV text already has a row for this name (case-insensitive, 2nd column). */
function csvHasName(csvText, name) {
	const target = name.trim().toLowerCase();
	return String(csvText || '')
		.split(/\r?\n/)
		.slice(1)
		.some((line) => (line.split(',')[1] || '').trim().toLowerCase() === target);
}

function duplicateError(name, roundNum) {
	return { result: 'error', error: `Duplicate: ${name} has already submitted for round ${roundNum}!` };
}

function doPost(e) {
	const lock = LockService.getScriptLock();
	if (!lock.tryLock(10000)) {
		return respond({ result: 'error', error: 'Server busy, please try again in a moment.' });
	}

	try {
		const data = JSON.parse(e.postData.contents);

		// 1. Security Check
		const receivedPass = (data.passcode || '').toString().trim();
		if (receivedPass !== PASSCODE.trim()) {
			console.warn('Invalid passcode attempt');
			return respond({ result: 'error', error: 'Invalid Passcode' });
		}

		// 2. Special test action
		if (data.action === 'clearTestYear') {
			if (Number(data.year) !== TEST_YEAR) return respond({ result: 'error', error: 'Can only clear year 3000' });
			try {
				const folder = DriveApp.getFoldersByName(DRIVE_FOLDER_NAME).next();
				const files = folder.getFilesByName(FILE_NAME_TEMPLATE.replace('{year}', TEST_YEAR));
				if (files.hasNext()) files.next().setTrashed(true);
				removeYearFromIndex(TEST_YEAR);
			} catch (err) {
				console.error('Failed to clear test year:', err);
				return respond({ result: 'error', error: 'Failed to clear test year: ' + err });
			}
			return respond({ result: 'success', details: 'Year 3000 cleared' });
		}

		// 3. Validate
		const checked = validateSubmission(data);
		if (!checked.ok) return respond({ result: 'error', error: checked.error });
		const { year, round: roundNum, name, picks } = checked.value;

		const timestampStr = Utilities.formatDate(new Date(), 'GMT', 'M/d/yyyy H:mm:ss');
		const csvRow = buildCsvRow(timestampStr, name, picks);
		const sheetName = `round${roundNum}`;

		// 4. Duplicate check against the backup sheet (case-insensitive)
		let ss = null;
		try {
			ss = getOrCreateYearlySpreadsheet(year);
			const sheet = ss && ss.getSheetByName(sheetName);
			if (sheet) {
				const target = name.toLowerCase();
				const existing = sheet.getDataRange().getValues();
				for (let i = 1; i < existing.length; i++) {
					if (String(existing[i][1]).trim().toLowerCase() === target) {
						return respond(duplicateError(name, roundNum));
					}
				}
			}
		} catch (sheetErr) {
			console.warn('Sheet duplicate check skipped', sheetErr);
		}

		// 5. Commit to GitHub first (source of truth); it also rejects duplicates found in the CSV.
		if (GITHUB_TOKEN) {
			const filePath = `playoffs/data/archive/${year}/round${roundNum}.csv`;
			try {
				updateGitHubFile(filePath, csvRow.join(','), `Picks submission: ${name}`, name);
			} catch (ghErr) {
				if (ghErr && ghErr.isDuplicate) return respond(duplicateError(name, roundNum));
				throw ghErr;
			}
			ensureYearInIndex(year);
		} else {
			console.warn('GITHUB_TOKEN not set; picks only saved to the backup sheet');
		}

		// 6. Backup to Google Sheet (best effort, only after the commit succeeded)
		try {
			if (ss) {
				let sheet = ss.getSheetByName(sheetName);
				if (!sheet) {
					sheet = ss.insertSheet(sheetName);
					const headers = ['Timestamp', 'Name'];
					for (let i = 0; i < picks.length; i++) headers.push('Team', 'Games');
					sheet.appendRow(headers);
				}
				sheet.appendRow(csvRow);
			}
		} catch (sheetErr) {
			console.error('Sheet backup failed:', sheetErr);
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
function updateGitHubFile(path, newRow, message, name) {
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
			if (name && csvHasName(existingContent, name)) {
				const dup = new Error('Duplicate submission');
				dup.isDuplicate = true;
				throw dup;
			}
		} else if (response.getResponseCode() !== 404) {
			throw new Error('GitHub read failed: ' + response.getResponseCode());
		} else {
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
		if (e && e.isDuplicate) throw e;
		console.error('Error fetching file from GitHub:', e);
		// Never overwrite a file we could not read.
		throw new Error('Could not read existing picks file from GitHub');
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

function removeYearFromIndex(year) {
	const path = 'playoffs/data/summaries/yearly_index.json';
	const url = `https://api.github.com/repos/${GITHUB_REPO_OWNER}/${GITHUB_REPO_NAME}/contents/${path}`;
	const headers = { Authorization: 'token ' + GITHUB_TOKEN, Accept: 'application/vnd.github.v3+json' };
	try {
		const response = UrlFetchApp.fetch(url + '?ref=' + GITHUB_BRANCH, { headers: headers, muteHttpExceptions: true });
		if (response.getResponseCode() !== 200) return;
		
		const fileData = JSON.parse(response.getContentText());
		const content = JSON.parse(Utilities.newBlob(Utilities.base64Decode(fileData.content)).getDataAsString());
		const yearStr = year.toString();
		if (!content[yearStr]) return;
		
		delete content[yearStr];
		const payload = {
			message: `Automated: Removed ${year} from yearly index (Test Cleanup)`,
			content: Utilities.base64Encode(JSON.stringify(content, null, 2), Utilities.Charset.UTF_8),
			sha: fileData.sha,
			branch: GITHUB_BRANCH,
		};
		const res = UrlFetchApp.fetch(url, { method: 'PUT', headers: headers, payload: JSON.stringify(payload), contentType: 'application/json', muteHttpExceptions: true });
		if (res.getResponseCode() >= 300) console.error('removeYearFromIndex PUT failed:', res.getContentText());
	} catch (e) {
		console.error('removeYearFromIndex failed:', e);
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
