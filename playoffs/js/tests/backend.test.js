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
		PropertiesService: {
			getScriptProperties: () => ({
				getProperty: (k) => (k === 'LATE_PASSES' ? stubs.latePasses || '' : stubs.token === undefined ? 'tok' : stubs.token),
			}),
		},
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
				if (url.endsWith('/marc2982.github.io')) {
					return { getResponseCode: () => stubs.githubRepoCode ?? 200, getContentText: () => '{}', getHeaders: () => ({ 'github-authentication-token-expiration': '2027-01-01 00:00:00 UTC' }) };
				}
				if (url.includes('api-web.nhle.com')) {
					if (stubs.nhlCode) return { getResponseCode: () => stubs.nhlCode, getContentText: () => '' };
					const start = stubs.seriesStart || '2999-01-01T00:00:00Z';
					return {
						getResponseCode: () => 200,
						getContentText: () => JSON.stringify({ games: [{ startTimeUTC: start }, { startTimeUTC: '2999-12-31T00:00:00Z' }] }),
					};
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
;({ doPost, validateSubmission, buildCsvRow, csvHasName, earliestStart, hasLatePass,
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
		picks: [{ series: 'A', winner: 'FLA', games: 5 }, { series: 'B', winner: 'NYR (vs BOS)', games: '7' }],
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
			{ ...good, picks: [{ series: 'A', winner: 'FLA', games: 3 }] },
			{ ...good, picks: [{ series: 'A', winner: 'FLA', games: 8 }] },
			{ ...good, picks: [{ series: 'A', winner: '=HYPERLINK("x")', games: 5 }] },
			{ ...good, picks: [{ series: 'A', winner: 'FLA,TOR', games: 5 }] },
			{ ...good, picks: [{ winner: 'FLA', games: 5 }] },
			{ ...good, picks: [{ series: 'I', winner: 'FLA', games: 5 }] },
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

	test('Backend doPost', 'health probe works without a passcode and reports token state', async () => {
		const { api } = await loadBackend({ githubRepoCode: 200 });
		const r = post(api, { action: 'health' });
		assertEq(r.result, 'success');
		assertEq(r.github, 'ok');
		const { api: api2 } = await loadBackend({ githubRepoCode: 401 });
		assertEq(post(api2, { action: 'health' }).github, 'error-401');
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
		const noYear = { ...good };
		delete noYear.year;
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

	test('Backend lock', 'earliestStart picks the earliest game and tolerates empty schedules', async () => {
		const { api } = await loadBackend();
		assertEq(api.earliestStart({ games: [{ startTimeUTC: '2026-04-20T00:00:00Z' }, { startTimeUTC: '2026-04-18T00:00:00Z' }] }), '2026-04-18T00:00:00.000Z');
		assertEq(api.earliestStart({ games: [] }), null);
		assertEq(api.earliestStart(null), null);
	});

	test('Backend lock', 'hasLatePass matches year:round:name case-insensitively', async () => {
		const { api } = await loadBackend();
		assert(api.hasLatePass('2026:2:Jake, 2026:3:ryan', 2026, 2, 'jake'));
		assert(api.hasLatePass('2026:3:ryan', 2026, 3, ' Ryan '));
		assert(!api.hasLatePass('2026:2:jake', 2026, 3, 'jake'));
		assert(!api.hasLatePass('', 2026, 1, 'jake'));
	});

	test('Backend doPost', 'picks for a started series are rejected', async () => {
		const { api, log } = await loadBackend({ seriesStart: '2020-01-01T00:00:00Z' });
		api.setSheet(() => null);
		const r = post(api, { ...good, passcode: '' });
		assertEq(r.result, 'error');
		assert(r.error.startsWith('Locked'), r.error);
		assertEq(log.githubPuts.length, 0);
	});

	test('Backend doPost', 'a late pass lets a locked submission through', async () => {
		const { api, log } = await loadBackend({ seriesStart: '2020-01-01T00:00:00Z', latePasses: '2026:1:marc' });
		api.setSheet(() => null);
		assertEq(post(api, { ...good, passcode: '' }).result, 'success');
		assert(log.githubPuts.length >= 1);
	});

	test('Backend doPost', 'lock lookup failure fails closed', async () => {
		const { api, log } = await loadBackend({ nhlCode: 500 });
		api.setSheet(() => null);
		const r = post(api, { ...good, passcode: '' });
		assertEq(r.result, 'error');
		assertEq(log.githubPuts.length, 0);
	});

	test('Backend doPost', 'unscheduled series (404) is not locked', async () => {
		const { api } = await loadBackend({ nhlCode: 404 });
		api.setSheet(() => null);
		assertEq(post(api, { ...good, passcode: '' }).result, 'success');
	});

	test('Add picks', 'appendPicksRow appends, formats contingency picks and rejects duplicates / bad specs', async () => {
		const path = await import('node:path');
		const url = await import('node:url');
		const root = path.join(path.dirname(url.fileURLToPath(import.meta.url)), '../..');
		const { appendPicksRow, parsePickSpec } = await import(path.join(root, 'scripts/lib/picksCsv.mjs'));
		const csv = 'Timestamp,Your name,Team,Games\n1/1/2026 0:00:00,Marc,FLA,5\n';
		const out = appendPicksRow(csv, 'Jake', ['TBL:6', 'NYR@BOS:7'], new Date('2026-04-20T12:05:09Z'));
		assert(out.endsWith('4/20/2026 12:05:09,Jake,TBL,6,NYR (vs BOS),7\n'), out);
		assertEq(parsePickSpec('nyr@bos:7').winner, 'NYR (vs BOS)');
		let threw = 0;
		for (const f of [() => appendPicksRow(out, 'jake', ['TBL:6']), () => parsePickSpec('TBL:8'), () => parsePickSpec('TBL')]) {
			try { f(); } catch { threw++; }
		}
		assertEq(threw, 3);
		assert(appendPicksRow('', 'Ann', ['TBL:6']).startsWith('Timestamp,Your name,Team,Games\n'));
	});

	test('Home stats', 'repeat champions and hero stats match the real index', async () => {
		const fs = await import('node:fs');
		const path = await import('node:path');
		const url = await import('node:url');
		const root = path.join(path.dirname(url.fileURLToPath(import.meta.url)), '../..');
		const { getRealYears } = await import(path.join(root, 'js/common.js'));
		const { findRepeatChampions, heroStats } = await import(path.join(root, 'js/homeStats.js'));
		const index = JSON.parse(fs.readFileSync(path.join(root, 'data/summaries/yearly_index.json'), 'utf8'));
		const years = getRealYears(index);
		const runs = findRepeatChampions(years);
		const span = (n) => (runs[n] || []).map((r) => `${r.start}-${r.end}`).join(',');
		assertEq(span('Nathan'), '2014-2015,2019-2020');
		assertEq(span('Stephanie'), '2021-2022');
		assertEq(span('Glenda'), '2024-2025');
		assertEq(span('Derrick'), '1999-2000,2004-2006'); // the 2005 lockout does not break a run
		assert(!runs.Marc, 'Marc has no back-to-back titles');
		const hero = heroStats(years);
		assertEq([hero.year, hero.winners, hero.titleLeaders, hero.titleLeaderCount], [2026, ['Derrick'], ['Derrick'], 7]);
		assertEq(heroStats([{ year: 2030, poolWinner: 'In Progress', points: {} }]), null);
	});

	test('Round facts', 'pre-scored facts match real data (2024 R1: Theodore all-4-games, 12 pts)', async () => {
		const path = await import('node:path');
		const url = await import('node:url');
		const root = path.join(path.dirname(url.fileURLToPath(import.meta.url)), '../..');
		const { calculateYearSummary } = await import(path.join(root, 'scripts/lib/yearSummary.mjs'));
		const { buildRoundFacts } = await import(path.join(root, 'scripts/lib/roundFacts.mjs'));
		const { rounds } = await calculateYearSummary(2024, path.join(root, 'data/archive/2024'));
		const facts = buildRoundFacts(rounds, 1);
		const line = facts.split('\n').find((l) => l.startsWith('- Theodore:'));
		assert(line.includes('12 rd'), line);
		assert((line.match(/: \w+ in 4 \(/g) || []).length === 8, 'all eight picks are in 4 games');
		assert(facts.includes('Round high: 23 pts'), 'round high should be 23');
	});

	test('Trends', 'Ryan wrong-Cup streak is found and as-of facts never leak later years', async () => {
		const path = await import('node:path');
		const url = await import('node:url');
		const root = path.join(path.dirname(url.fileURLToPath(import.meta.url)), '../..');
		const { buildFactsText } = await import(path.join(root, 'scripts/lib/summaryFacts.mjs'));
		const facts = await buildFactsText(root, 2024, 'overall', { compact: true });
		assert(/Ryan has picked the wrong Stanley Cup winner 10 years in a row/.test(facts), 'missing Ryan streak');
		assert(!/2025|2026/.test(facts), 'future years leaked into 2024 facts');
	});

	return finish();
}
