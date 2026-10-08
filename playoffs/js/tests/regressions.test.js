import { createRunner } from './testHelpers.js';
import { Series, Pick, Scoring, selectActivePick, isTeamKnown, PickStatus } from '../models.js';
import { ScenarioAnalyzer } from '../scenarioAnalyzer.js';
import { prepareRoundViewModel } from '../yearViewModel.js';
import { escapeHtml } from '../html.js';
import { parseBranch } from '../urlParams.js';
import { toNameList, getRealYears, calculateCareerStats } from '../common.js';
import { aggregateTeamStats, getConference } from '../teamAnalysis.js';
import { PicksImporter } from '../picksImporter.js';
import { NhlTeamRepository } from '../nhlApiHandler.js';
import { resolveSeriesSeeds } from '../yearBuilder.js';
import { picksYear, pickTargetRound, roundPicksState } from '../picksStatus.js';

const mkSeries = (d) => Series.create({ topSeedWins: 0, bottomSeedWins: 0, ...d });
const mkPick = (team, games, opponent = null) => Pick.create({ team, games, opponent });

export async function runRegressionTests() {
	const { test, assert, assertEq, finish } = createRunner();

	// ---- models ----
	test('Models', 'isTeamKnown rejects placeholders', () => {
		assert(!isTeamKnown(undefined) && !isTeamKnown('undefined') && !isTeamKnown('TBD') && !isTeamKnown('tbd'));
		assert(isTeamKnown('FLA'));
	});

	test('Models', 'PickStatus is frozen', () => {
		assert(Object.isFrozen(PickStatus));
	});

	test('Models', 'round-1 series summary with unknown seeds does not throw', () => {
		const s = mkSeries({ letter: 'A', topSeed: undefined, bottomSeed: undefined });
		assert(typeof s.getSeriesSummary() === 'string');
		assert(!s.getSeriesSummary().includes('undefined'), s.getSeriesSummary());
	});

	test('selectActivePick', 'empty array -> null, single pick returned', () => {
		const s = mkSeries({ letter: 'I', topSeed: 'EDM', bottomSeed: 'VAN' });
		assert(selectActivePick([], s) === null);
		const p = mkPick('EDM', 5);
		assert(selectActivePick([p], s) === p);
	});

	test('selectActivePick', 'conditional picks choose the matching opponent', () => {
		const s = mkSeries({ letter: 'I', topSeed: 'EDM', bottomSeed: 'VAN' });
		const a = mkPick('EDM', 4, 'CGY');
		const b = mkPick('EDM', 6, 'VAN');
		assert(selectActivePick([a, b], s) === b);
	});

	test('selectActivePick', 'falls back to opponent-less pick, then first pick for team in series', () => {
		const s = mkSeries({ letter: 'I', topSeed: 'EDM', bottomSeed: 'VAN' });
		const wrong = mkPick('EDM', 4, 'CGY');
		const plain = mkPick('VAN', 7);
		assert(selectActivePick([wrong, plain], s) === plain);
		const wrong2 = mkPick('LAK', 4, 'CGY');
		const inSeries = mkPick('VAN', 5, 'CGY');
		assert(selectActivePick([wrong2, inSeries], s) === inSeries);
	});

	test('selectActivePick', 'unknown seeds -> first pick', () => {
		const s = mkSeries({ letter: 'I', topSeed: 'TBD', bottomSeed: undefined });
		const a = mkPick('EDM', 4, 'CGY');
		assert(selectActivePick([a, mkPick('EDM', 5, 'VAN')], s) === a);
	});

	// ---- scenario analyzer ----
	const scoring = Scoring.create({ team: 2, games: 3, bonus: 4 });
	const roundWith = (serieses, pickResults) => ({
		number: 2,
		scoring,
		serieses,
		pickResults,
		summary: { summaries: { Alice: { points: 0 }, Bob: { points: 0 } }, winners: [] },
	});

	test('ScenarioAnalyzer', 'undetermined matchup returns undetermined flag instead of bogus odds', () => {
		const tbd = mkSeries({ letter: 'M', topSeed: undefined, bottomSeed: undefined });
		const round = roundWith([tbd], {
			Alice: { M: { pick: { team: 'EDM', games: 5 } } },
			Bob: { M: { pick: { team: 'VAN', games: 5 } } },
		});
		const analysis = new ScenarioAnalyzer().analyzeAllScenarios('Alice', 'Bob', round, {});
		assert(analysis.undetermined === true, 'should flag undetermined');
	});

	test('ScenarioAnalyzer', 'rank volatility stays finite with undetermined series', () => {
		const tbd = mkSeries({ letter: 'M', topSeed: undefined, bottomSeed: undefined });
		const round = roundWith([tbd], {
			Alice: { M: { pick: { team: 'EDM', games: 5 } } },
			Bob: { M: { pick: { team: 'VAN', games: 5 } } },
		});
		const vol = new ScenarioAnalyzer().analyzeRankVolatility(round, {});
		assertEq(vol.Alice.rankRange, [1, 2]);
		assertEq([vol.Alice.min, vol.Alice.max], [0, 9]);
	});

	test('ScenarioAnalyzer', 'hasUndeterminedSeries', () => {
		const a = new ScenarioAnalyzer();
		const known = mkSeries({ letter: 'I', topSeed: 'EDM', bottomSeed: 'VAN' });
		const tbd = mkSeries({ letter: 'J', topSeed: 'EDM', bottomSeed: 'TBD' });
		assert(!a.hasUndeterminedSeries({ serieses: [known] }));
		assert(a.hasUndeterminedSeries({ serieses: [known, tbd] }));
	});

	test('Year ViewModel', 'pending scenarios flagged when matchups unset; round 1 has none', () => {
		const tbd = mkSeries({ letter: 'I', topSeed: 'EDM', bottomSeed: 'TBD' });
		const r2 = roundWith([tbd], {
			Alice: { I: { pick: { team: 'EDM', games: 5 } } },
			Bob: { I: { pick: { team: 'VAN', games: 5 } } },
		});
		const vm = prepareRoundViewModel({}, r2);
		assert(vm.picks[0].scenariosPending === true && vm.picks[0].scenariosAvailable === false);
		const r1 = { ...r2, number: 1 };
		const vm1 = prepareRoundViewModel({}, r1);
		assert(vm1.picks[0].scenariosAvailable === false && vm1.picks[0].scenariosPending === false);
	});

	// ---- html / url ----
	test('escapeHtml', 'escapes dangerous characters and nullish values', () => {
		assertEq(escapeHtml('<img src=x onerror="a()">&\''), '&lt;img src=x onerror=&quot;a()&quot;&gt;&amp;&#39;');
		assertEq(escapeHtml(null), '');
		assertEq(escapeHtml(undefined), '');
		assertEq(escapeHtml(5), '5');
	});

	test('parseBranch', 'accepts normal branches, rejects injection/traversal', () => {
		assertEq(parseBranch('feature/x-1.2'), 'feature/x-1.2');
		assert(!parseBranch('"><script>'));
		assert(!parseBranch('../../etc'));
		assert(!parseBranch(''));
		assert(!parseBranch(null));
	});

	// ---- common / career stats ----
	test('common', 'toNameList handles strings, arrays, stars, nullish', () => {
		assertEq(toNameList('Jake, Nickall*'), ['Jake', 'Nickall']);
		assertEq(toNameList(['A', ' B* ']), ['A', 'B']);
		assertEq(toNameList(null), []);
		assertEq(toNameList('-'), []);
	});

	test('common', 'getRealYears drops the test year and sorts', () => {
		const out = getRealYears({ 2025: { year: 2025 }, 3000: { year: 3000 }, 2024: { year: 2024 } });
		assertEq(out.map((y) => y.year), [2024, 2025]);
	});

	test('calculateCareerStats', 'tiebreak winner ranks first among tied leaders; loser is silver with 0 margin', () => {
		const stats = calculateCareerStats([
			{ year: 2017, points: { Jake: 40, Marc: 40, Robin: 30 }, poolWinner: 'Jake', poolLoser: 'Robin' },
		]);
		assertEq(stats.Jake.wins, 1);
		assertEq(stats.Jake.silverMedals, 0);
		assertEq(stats.Marc.silverMedals, 1);
		assertEq(stats.Marc.closestLossMargin, 0);
		assertEq(stats.Robin.bronzeMedals, 1);
		assertEq(stats.Robin.losses, 1);
	});

	test('calculateCareerStats', 'order of points object does not change medals', () => {
		const a = calculateCareerStats([{ year: 1, points: { A: 5, B: 5 }, poolWinner: 'B', poolLoser: 'A' }]);
		const b = calculateCareerStats([{ year: 1, points: { B: 5, A: 5 }, poolWinner: 'B', poolLoser: 'A' }]);
		assertEq([a.B.silverMedals, a.A.silverMedals], [b.B.silverMedals, b.A.silverMedals]);
		assertEq(a.B.silverMedals, 0);
	});

	test('calculateCareerStats', 'array losers, in-progress and test years are handled', () => {
		const stats = calculateCareerStats([
			{ year: 2020, points: { A: 9, B: 3, C: 3 }, poolWinner: 'A', poolLoser: ['B', 'C'] },
			{ year: 2021, points: { A: 1, B: 1 }, poolWinner: 'In Progress', poolLoser: null },
			{ year: 3000, points: { A: 100 }, poolWinner: 'A', poolLoser: null },
		]);
		assertEq([stats.B.losses, stats.C.losses, stats.A.wins, stats.A.yearsParticipated], [1, 1, 1, 1]);
	});

	test('calculateCareerStats', 'win streak survives a missed year only if consecutive winners', () => {
		const stats = calculateCareerStats([
			{ year: 1, points: { A: 5, B: 1 }, poolWinner: 'A', poolLoser: 'B' },
			{ year: 2, points: { A: 6, B: 1 }, poolWinner: 'A', poolLoser: 'B' },
			{ year: 3, points: { A: 1, B: 6 }, poolWinner: 'B', poolLoser: 'A' },
		]);
		assertEq([stats.A.longestWinStreak, stats.B.longestLoseStreak], [2, 2]);
	});

	// ---- team analysis ----
	test('teamAnalysis', 'aggregates picks dynamically using real points; unknown teams included', () => {
		const results = [
			{
				summary: {
					teams: { UTA: { name: 'Utah Mammoth' } },
					rounds: [
						{
							pickResults: {
								Alice: { A: { pick: { team: 'UTA', games: 5 }, teamStatus: 'CORRECT', points: 9 } },
								Bob: { A: { pick: { team: 'UTA', games: 6 }, teamStatus: 'INCORRECT', points: 0 } },
							},
						},
					],
				},
			},
		];
		const { teamStatsArray, conferenceStats } = aggregateTeamStats(results);
		assertEq(teamStatsArray.length, 1);
		const uta = teamStatsArray[0];
		assertEq([uta.name, uta.timesPicked, uta.timesWon, uta.timesLost, uta.totalPoints], ['Utah Mammoth', 2, 1, 1, 9]);
		assertEq(uta.avgPoints, 4.5);
		assertEq(conferenceStats.Western, { picked: 2, correct: 1 });
	});

	test('teamAnalysis', 'conference is era-aware (DET/CBJ were Western until 2013, ATL counted)', () => {
		assertEq(getConference('DET', 2010), 'Western');
		assertEq(getConference('CBJ', 2013), 'Western');
		assertEq(getConference('DET', 2014), 'Eastern');
		assertEq(getConference('CBJ', 2024), 'Eastern');
		assertEq(getConference('ATL', 2005), 'Eastern');
		assertEq(getConference('ZZZ', 2005), null);
	});

	// ---- importer ----
	const seriesA = mkSeries({ letter: 'A', topSeed: 'FLA', bottomSeed: 'TBL' });
	const seriesB = mkSeries({ letter: 'B', topSeed: 'BOS', bottomSeed: 'TOR' });
	const seriesRepo = { getSeries: (l) => ({ A: seriesA, B: seriesB })[l] || null };
	const teamRepo = { getTeam: (name) => ({ short: name, name }) };

	test('PicksImporter', 'CRLF line endings parse', () => {
		const csv = 'Timestamp,Name,Team,Games\r\n2025-01-01,Zed,FLA,6\r\n';
		const picks = new PicksImporter(seriesRepo, teamRepo).processRows(csv, 1);
		assertEq(picks.Zed.A[0].games, 6);
	});

	test('PicksImporter', 'last row for a person fully replaces earlier picks', () => {
		const csv =
			'Timestamp,Name,Team,Games,Team,Games\n' +
			'2025-01-01,Alice,FLA,5,TOR,6\n' +
			'2025-01-05,Alice,TBL,7,\n';
		const picks = new PicksImporter(seriesRepo, teamRepo).processRows(csv, 1);
		assertEq(picks.Alice.A.map((p) => [p.team, p.games]), [['TBL', 7]]);
		assert(!picks.Alice.B, 'old series B pick should be gone');
	});

	test('PicksImporter', 'NaN games are skipped (never stored as NaN)', () => {
		const csv = 'Timestamp,Name,Team,Games,Team,Games\n2025-01-01,Bad,FLA,six,TOR,7\n';
		const picks = new PicksImporter(seriesRepo, teamRepo).processRows(csv, 1);
		assert(!picks.Bad.A, 'invalid FLA pick must be dropped');
		assertEq(picks.Bad.B[0].games, 7);
	});

	test('PicksImporter', 'blank/nameless rows are ignored', () => {
		const csv = 'Timestamp,Name,Team,Games\n2025-01-01,,FLA,6\n,   ,FLA,6\n';
		assertEq(Object.keys(new PicksImporter(seriesRepo, teamRepo).processRows(csv, 1)), []);
	});

	test('PicksImporter', 'resolved matchup beats possible-seed match (crossed series letters, e.g. 2021 R3)', () => {
		const m = mkSeries({ letter: 'M', topSeed: 'VGK', bottomSeed: 'MTL' });
		const n = mkSeries({ letter: 'N', topSeed: 'TBL', bottomSeed: 'NYI' });
		m.possibleTopSeeds = ['COL']; m.possibleBottomSeeds = ['TBL', 'NYI'];
		n.possibleTopSeeds = ['VGK']; n.possibleBottomSeeds = ['MTL'];
		const repo = { getSeries: (l) => ({ M: m, N: n })[l] || null };
		const csv = 'Timestamp,Name,Team,Games,Team,Games\n1,Jamie,MTL,5,TBL,7\n';
		const picks = new PicksImporter(repo, teamRepo).processRows(csv, 3);
		assertEq(picks.Jamie.M.map((p) => p.team), ['MTL']);
		assertEq(picks.Jamie.N.map((p) => p.team), ['TBL']);
	});

	test('PicksImporter', 'legacy abbreviation TB maps to TBL via the real repo', () => {
		const repo = new NhlTeamRepository({ TBL: { short: 'TBL', name: 'Tampa Bay Lightning' } });
		const csv = 'Timestamp,Name,Team,Games\n2025-01-01,OldSchool,TB,6\n';
		const picks = new PicksImporter(seriesRepo, repo).processRows(csv, 1);
		assertEq(picks.Oldschool.A[0].team, 'TBL');
	});

	// ---- picksStatus (home page Make Picks button) ----
	const hrs = (n, now) => new Date(now.getTime() + n * 3600 * 1000).toISOString();
	const NOW = new Date('2027-04-20T12:00:00Z');
	const ser = (letter, top, bot, startOffsetH, wins = [0, 0]) =>
		Object.assign(mkSeries({ letter, topSeed: top, bottomSeed: bot, topSeedWins: wins[0], bottomSeedWins: wins[1] }), {
			startTimeUTC: startOffsetH === null ? undefined : hrs(startOffsetH, NOW),
		});
	const round1 = (offsets, wins = {}) => 'ABCDEFGH'.split('').map((l, i) => ser(l, 'T' + l, 'B' + l, offsets[i], wins[l]));
	const futureRounds = () => 'IJKLMNO'.split('').map((l) => mkSeries({ letter: l, topSeed: undefined, bottomSeed: undefined }));

	test('picksStatus', 'picksYear looks ahead from September', () => {
		assertEq(picksYear(new Date(2026, 9, 7)), 2027);
		assertEq(picksYear(new Date(2027, 3, 20)), 2027);
		assertEq(picksYear(new Date(2027, 8, 1)), 2028);
	});

	test('picksStatus', 'round more than 3 days out is not open, with the unlock date', () => {
		const list = [...round1([100, 100, 101, 101, 102, 102, 103, 103]), ...futureRounds()];
		const st = roundPicksState(list, pickTargetRound(list, NOW), NOW);
		assertEq(st.state, 'not-open');
		assertEq(st.round, 1);
		assertEq(st.unlockDate.toISOString(), hrs(100 - 72, NOW));
	});

	test('picksStatus', 'open within 3 days, locked once every series has started', () => {
		let list = [...round1([40, 40, 41, 41, 42, 42, 43, 43]), ...futureRounds()];
		assertEq(roundPicksState(list, pickTargetRound(list, NOW), NOW).state, 'open');
		list = [...round1([-5, -5, -4, -4, -3, -3, -2, -2]), ...futureRounds()];
		assertEq(roundPicksState(list, pickTargetRound(list, NOW), NOW).state, 'locked');
		// some started, some not: still open for the rest
		list = [...round1([-5, -5, 20, 20, 20, 20, 20, 20]), ...futureRounds()];
		assertEq(roundPicksState(list, pickTargetRound(list, NOW), NOW).state, 'open');
	});

	test('picksStatus', 'overlapping next round opens while round 1 is locked', () => {
		const r1 = round1([-90, -90, -88, -88, -86, -86, -84, -84], { A: [4, 1] });
		const r2 = 'IJKL'.split('').map((l) => ser(l, 'X' + l, 'Y' + l, 30));
		const list = [...r1, ...r2, ...'MNO'.split('').map((l) => mkSeries({ letter: l }))];
		const target = pickTargetRound(list, NOW);
		assertEq(target, 1);
		assertEq(roundPicksState(list, target, NOW).state, 'open');
		assertEq(roundPicksState(list, target, NOW).round, 2);
	});

	test('picksStatus', 'no bracket yet is not open', () => {
		const list = futureRounds();
		assertEq(pickTargetRound(list, NOW), -1);
		assertEq(roundPicksState(list, -1, NOW).state, 'not-open');
	});

	// ---- yearBuilder ----
	test('yearBuilder', 'resolveSeriesSeeds exported and tolerant of an empty bracket', () => {
		assert(typeof resolveSeriesSeeds === 'function');
	});

	return finish();
}
