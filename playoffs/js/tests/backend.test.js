import { createRunner } from './testHelpers.js';

/** Loads backend/Code.gs into a vm sandbox with Apps Script stubs (Node only). */
async function loadBackend(stubs = {}) {
	const fs = await import('node:fs');
	const vm = await import('node:vm');
	const path = await import('node:path');
	const url = await import('node:url');
	const file = path.join(path.dirname(url.fileURLToPath(import.meta.url)), '../../backend/Code.gs');
	const code = fs.readFileSync(file, 'utf8');

	const log = { sheetWrites: [], githubPuts: [], lockReleased: 0 };
	const sandbox = {
		console: { log() {}, warn() {}, error() {} },
		PropertiesService: { getScriptProperties: () => ({ getProperty: () => (stubs.token === undefined ? 'tok' : stubs.token) }) },
		LockService: {
			getScriptLock: () => ({
				tryLock: () => stubs.lockOk !== false,
				releaseLock: () => log.lockReleased++,
			}),
		},
		ContentService: {
			MimeType: { JSON: 'json' },
			createTextOutput: (s) => ({ getContent: () => s, setMimeType() { return this; } }),
		},
		Utilities: {
			formatDate: () => '1/1/2026 0:00:00',
			base64Decode: (s) => Buffer.from(s, 'base64'),
			base64Encode: (s) => Buffer.from(s).toString('base64'),
			newBlob: (b) => ({ getDataAsString: () => Buffer.from(b).toString() }),
			Charset: { UTF_8: 'utf8' },
		},
		UrlFetchApp: {
			fetch: (url, opts = {}) => {
				if (opts.method === 'PUT') {
					log.githubPuts.push(url);
					const code = stubs.githubPutCode ?? 200;
					return { getResponseCode: () => code, getContentText: () => 'err' };
				}
				if (stubs.existingCsv !== undefined && url.includes('round')) {
					return {
						getResponseCode: () => 200,
						getContentText: () =>
							JSON.stringify({ sha: 's', content: Buffer.from(stubs.existingCsv).toString('base64') }),
					};
				}
				return { getResponseCode: () => 404, getContentText: () => '' };
			},
		},
		DriveApp: {},
		SpreadsheetApp: {},
	};
	vm.createContext(sandbox);
	// Stub the sheet layer after load via sheetStub hooks.
	const exports = vm.runInContext(
		code +
			`
;({ doPost, validateSubmission, buildCsvRow, csvHasName,
   setSheet(fn){ getOrCreateYearlySpreadsheet = fn; } })`,
		sandbox,
	);
	return { api: exports, log };
}

export async function runBackendTests() {
	const { test, assert, assertEq, finish } = createRunner();

	const good = {
		name: 'Marc',
		year: 2026,
		round: 1,
		picks: [{ winner: 'FLA', games: 5 }, { winner: 'NYR (vs BOS)', games: '7' }],
	};

	test('Backend validate', 'accepts a valid submission and normalises games', async () => {
		const { api } = await loadBackend();
		const r = api.validateSubmission(good);
		assert(r.ok, r.error);
		assertEq(r.value.picks[1].games, 7);
	});

	test('Backend validate', 'rejects bad year / round / name / picks', async () => {
		const { api } = await loadBackend();
		const bad = [
			{ ...good, year: undefined },
			{ ...good, year: 'abc' },
			{ ...good, round: 5 },
			{ ...good, round: 0 },
			{ ...good, name: '' },
			{ ...good, name: 'a,b' },
			{ ...good, name: 'x\ny' },
			{ ...good, picks: [] },
			{ ...good, picks: [{ winner: 'FLA', games: 3 }] },
			{ ...good, picks: [{ winner: 'FLA', games: 8 }] },
			{ ...good, picks: [{ winner: '=HYPERLINK("x")', games: 5 }] },
			{ ...good, picks: [{ winner: 'FLA,TOR', games: 5 }] },
			null,
		];
		bad.forEach((b, i) => assert(!api.validateSubmission(b).ok, `case ${i} should be rejected`));
	});

	test('Backend csv', 'csvHasName is case-insensitive and ignores the header', async () => {
		const { api } = await loadBackend();
		const csv = 'Timestamp,Name,Team,Games\n1/1,Marc,FLA,5\n';
		assert(api.csvHasName(csv, 'marc'));
		assert(!api.csvHasName(csv, 'Name'));
		assert(!api.csvHasName(csv, 'Ryan'));
	});

	const post = (api, body) => JSON.parse(api.doPost({ postData: { contents: JSON.stringify(body) } }).getContent());

	test('Backend doPost', 'lock failure returns an error without writing', async () => {
		const { api, log } = await loadBackend({ lockOk: false });
		api.setSheet(() => null);
		const r = post(api, { ...good, passcode: '' });
		assertEq(r.result, 'error');
		assertEq(log.githubPuts.length, 0);
	});

	test('Backend doPost', 'wrong passcode rejected', async () => {
		const { api, log } = await loadBackend();
		api.setSheet(() => null);
		assertEq(post(api, { ...good, passcode: 'nope' }).error, 'Invalid Passcode');
		assertEq(log.githubPuts.length, 0);
	});

	test('Backend doPost', 'missing year no longer defaults to 2026', async () => {
		const { api, log } = await loadBackend();
		api.setSheet(() => null);
		const { year, ...noYear } = good;
		assertEq(post(api, { ...noYear, passcode: '' }).result, 'error');
		assertEq(log.githubPuts.length, 0);
	});

	test('Backend doPost', 'duplicate already in GitHub CSV is rejected (case-insensitive)', async () => {
		const { api, log } = await loadBackend({ existingCsv: 'Timestamp,Your name,Team,Games\n1/1,marc,FLA,5\n' });
		api.setSheet(() => null);
		const r = post(api, { ...good, passcode: '' });
		assertEq(r.result, 'error');
		assert(r.error.startsWith('Duplicate'), r.error);
		assertEq(log.githubPuts.length, 0);
	});

	test('Backend doPost', 'GitHub failure does not write the sheet backup', async () => {
		const { api } = await loadBackend({ githubPutCode: 500 });
		const writes = [];
		api.setSheet(() => ({
			getSheetByName: () => null,
			insertSheet: () => ({ appendRow: (r) => writes.push(r) }),
		}));
		const r = post(api, { ...good, passcode: '' });
		assertEq(r.result, 'error');
		assertEq(writes.length, 0);
	});

	test('Backend doPost', 'success commits to GitHub then backs up to the sheet', async () => {
		const { api, log } = await loadBackend();
		const writes = [];
		api.setSheet(() => ({
			getSheetByName: () => null,
			insertSheet: () => ({ appendRow: (r) => writes.push(r) }),
		}));
		const r = post(api, { ...good, passcode: '' });
		assertEq(r.result, 'success');
		assert(log.githubPuts.length >= 1);
		assertEq(writes.length, 2); // header + row
		assertEq(log.lockReleased, 1);
	});

	return finish();
}
