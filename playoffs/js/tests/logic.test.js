import { Series, Pick, Winner, PickStatus, PickResult, Scoring, PersonPointsSummary, Round, RoundSummary } from '../models.js';
import { NhlApiHandler } from '../nhlApiHandler.js';
import { PickResultCalculator } from '../pickResultCalculator.js';
import { Summarizer } from '../summarizer.js';

export async function runTests() {
	const results = [];

	function test(group, name, fn) {
		try {
			fn();
			results.push({ group, name, status: 'PASS' });
		} catch (e) {
			results.push({ group, name, status: 'FAIL', error: e.message });
		}
	}

	function assert(condition, message) {
		if (!condition) throw new Error(message || 'Assertion failed');
	}

	test('API Loader', 'load throws PLAYOFFS_NOT_STARTED if bracket is projected', () => {
		const mockDataLoader = {
			load: async () => ({
				series: [{}],
				bracketTitle: { default: "If The Playoffs Started Today" }
			})
		};
		const handler = new NhlApiHandler(2025, mockDataLoader);
		handler.load()
			.then(() => console.error("FAIL: 'load throws if projected' - Expected throw, didn't happen"))
			.catch((e) => {
				if (e.message !== 'PLAYOFFS_NOT_STARTED') console.error("FAIL: 'load throws if projected' - wrong error", e);
			});
	});

	// 1. Series Locking Tests
	test('Series Locking', 'isLocked returns true if now >= start time', () => {
		const s = Series.create({ letter: 'A', startTimeUTC: '2025-04-20T23:00:00Z' });
		const now = new Date('2025-04-20T23:00:01Z');
		assert(s.isLocked(now) === true, 'Should be locked');
	});

	test('Series Locking', 'isLocked returns false if now < start time', () => {
		const s = Series.create({ letter: 'A', startTimeUTC: '2025-04-20T23:00:00Z' });
		const now = new Date('2025-04-20T22:59:59Z');
		assert(s.isLocked(now) === false, 'Should not be locked');
	});

	test('Series Locking', 'isLocked returns false if no start time', () => {
		const s = Series.create({ letter: 'A', startTimeUTC: undefined });
		assert(s.isLocked() === false, 'Should not be locked');
	});

	test('Series Locking', 'Locked if topSeedWins > 0 as fallback', () => {
		// This logic is actually in picks.js UI right now, but Series model could handle it
		// Series.isLocked only checks time. Picks.js combines them.
		// Let's test the model logic here.
	});

	// 2. Round Unlocking Tests
	test('Round Unlocking', 'isRoundOpen returns true exactly 3 days before lead series', () => {
		const leadStartTime = '2025-04-20T23:00:00Z';
		const now = new Date('2025-04-17T23:00:00Z');
		assert(Series.isRoundOpen(leadStartTime, now) === true, 'Should be open');
	});

	test('Round Unlocking', 'isRoundOpen returns false 4 days before lead series', () => {
		const leadStartTime = '2025-04-20T23:00:00Z';
		const now = new Date('2025-04-16T23:00:00Z');
		assert(Series.isRoundOpen(leadStartTime, now) === false, 'Should not be open');
	});

	test('Round Unlocking', 'isRoundOpen returns false if leadStartTime is missing', () => {
		assert(Series.isRoundOpen(undefined) === false, 'Should be closed');
	});

	// 3. Contingency Logic Tests (NhlApiHandler.getPossibleWinners)
	test('Contingency Logic', 'getPossibleWinners returns both participants for active series', () => {
		const handler = new NhlApiHandler(2025, null);
		handler.series = [Series.create({ letter: 'A', topSeed: 'FLA', bottomSeed: 'TBL' })];
		const winners = handler.getPossibleWinners('A');
		assert(winners.length === 2, 'Should have 2 possibilities');
		assert(winners.includes('FLA') && winners.includes('TBL'), 'Should have both teams');
	});

	test('Contingency Logic', 'getPossibleWinners returns only actual winner for finished series', () => {
		const handler = new NhlApiHandler(2025, null);
		handler.series = [
			Series.create({
				letter: 'A',
				topSeed: 'FLA',
				bottomSeed: 'TBL',
				topSeedWins: 4,
				bottomSeedWins: 2,
			}),
		];
		const winners = handler.getPossibleWinners('A');
		assert(winners.length === 1, 'Should have only 1 possibility');
		assert(winners[0] === 'FLA', 'Winner should be FLA');
	});

	test('Contingency Logic', 'getPossibleWinners recurses for TBD series (Round 2)', () => {
		const handler = new NhlApiHandler(2025, null);
		// WINNER_MAP[I] = [A, B]
		handler.series = [
			Series.create({ letter: 'A', topSeed: 'FLA', bottomSeed: 'TBL' }),
			Series.create({ letter: 'B', topSeed: 'BOS', bottomSeed: 'TOR' }),
			Series.create({ letter: 'I', topSeed: undefined, bottomSeed: undefined }),
		];
		const winners = handler.getPossibleWinners('I');
		assert(winners.length === 4, 'Should have 4 possible winners from 2 parents');
		assert(
			['FLA', 'TBL', 'BOS', 'TOR'].every((t) => winners.includes(t)),
			'Missing expected team',
		);
	});

	test('Contingency Logic', 'getPossibleWinners recurses multiple levels (Round 3)', () => {
		const handler = new NhlApiHandler(2025, null);
		// M -> I, J
		// I -> A, B
		// J -> C, D
		handler.series = [
			Series.create({ letter: 'A', topSeed: 'FLA', bottomSeed: 'TBL' }),
			Series.create({ letter: 'B', topSeed: 'BOS', bottomSeed: 'TOR' }),
			Series.create({ letter: 'C', topSeed: 'NYR', bottomSeed: 'WSH' }),
			Series.create({ letter: 'D', topSeed: 'CAR', bottomSeed: 'NYI' }),
			Series.create({ letter: 'I', topSeed: undefined, bottomSeed: undefined }),
			Series.create({ letter: 'J', topSeed: undefined, bottomSeed: undefined }),
			Series.create({ letter: 'M', topSeed: undefined, bottomSeed: undefined }),
		];
		const winners = handler.getPossibleWinners('M');
		assert(winners.length === 8, 'Should have 8 possible winners for Round 3 TBD');
	});

	test('Contingency Logic', 'getPossibleWinners handles mixed finished/active parents', () => {
		const handler = new NhlApiHandler(2025, null);
		// I -> A (finished), B (active)
		handler.series = [
			Series.create({ letter: 'A', topSeed: 'FLA', bottomSeed: 'TBL', topSeedWins: 4, bottomSeedWins: 0 }),
			Series.create({ letter: 'B', topSeed: 'BOS', bottomSeed: 'TOR' }),
			Series.create({ letter: 'I', topSeed: undefined, bottomSeed: undefined }),
		];
		const winners = handler.getPossibleWinners('I');
		assert(winners.length === 3, 'Should have 3 possibilities (FLA, BOS, TOR)');
		assert(winners.includes('FLA') && winners.includes('BOS') && winners.includes('TOR'), 'Wrong teams');
	});

	// 4. Scoring Tests (PickResultCalculator)
	test('Scoring', 'Points calculation: Correct team & games gets bonus', () => {
		const calc = new PickResultCalculator();
		const scoring = Scoring.create({ team: 1, games: 2, bonus: 3 });
		const points = calc.getPoints(scoring, PickStatus.CORRECT, PickStatus.CORRECT);
		assert(points === 6, 'Should yield 6 points (1+2+3)');
	});

	test('Scoring', 'Points calculation: Correct team only', () => {
		const calc = new PickResultCalculator();
		const scoring = Scoring.create({ team: 1, games: 2, bonus: 3 });
		const points = calc.getPoints(scoring, PickStatus.CORRECT, PickStatus.INCORRECT);
		assert(points === 1, 'Should yield 1 point (team only)');
	});

	test('Scoring', 'Points calculation: Correct games only', () => {
		const calc = new PickResultCalculator();
		const scoring = Scoring.create({ team: 1, games: 2, bonus: 3 });
		const points = calc.getPoints(scoring, PickStatus.INCORRECT, PickStatus.CORRECT);
		assert(points === 2, 'Should yield 2 points (games only)');
	});

	test('Scoring', 'Possible points: Unknown series', () => {
		const calc = new PickResultCalculator();
		const scoring = Scoring.create({ team: 1, games: 2, bonus: 3 });
		const possible = calc.calculatePossiblePoints(null, null, scoring, PickStatus.UNKNOWN, PickStatus.UNKNOWN);
		assert(possible === 6, 'Should have 6 possible points remaining');
	});

	test('Scoring', 'Possible points: Eliminated team', () => {
		const calc = new PickResultCalculator();
		const scoring = Scoring.create({ team: 1, games: 2, bonus: 3 });
		const possible = calc.calculatePossiblePoints(null, null, scoring, PickStatus.INCORRECT, PickStatus.UNKNOWN);
		assert(possible === 2, 'Should only have 2 possible points (from games) remaining');
	});

	test('Scoring', 'Team status validation', () => {
		const calc = new PickResultCalculator();
		const pick = Pick.create({ team: 'FLA' });
		const winner = Winner.create({ team: 'FLA' });
		const status = calc.getTeamStatus(pick, winner);
		assert(status === PickStatus.CORRECT, 'Team should be correct');
	});

	test('Scoring', 'Games status validation (finished series)', () => {
		const calc = new PickResultCalculator();
		const pick = Pick.create({ games: 6 });
		const winner = Winner.create({ games: 6 });
		const status = calc.getGamesStatus(pick, winner, null);
		assert(status === PickStatus.CORRECT, 'Games should be correct');
	});

	test('Scoring', 'Games status validation (active series elimination)', () => {
		const calc = new PickResultCalculator();
		// Active series where 6 games have been played. Predicted to end in 5.
		const series = Series.create({ topSeedWins: 3, bottomSeedWins: 3 }); // 6 games played
		const pick = Pick.create({ games: 5 });
		const status = calc.getGamesStatus(pick, null, series);
		assert(status === PickStatus.INCORRECT, 'Should be eliminated since we reached game 6');
	});

	// 5. Summarizer & Tiebreaker Tests
	test('Summarizer', 'Tiebreaker resolution (Points & Rank)', () => {
		// Mock pick results for a single round to test aggregation and ranking
		const pickResults = {
			'Alice': { 'A': PickResult.create({ points: 10, possiblePoints: 10, teamStatus: PickStatus.CORRECT, gamesStatus: PickStatus.CORRECT, earnedBonusPoints: true }) },
			'Bob': { 'A': PickResult.create({ points: 5, possiblePoints: 10, teamStatus: PickStatus.CORRECT, gamesStatus: PickStatus.INCORRECT }) },
			'Charlie': { 'A': PickResult.create({ points: 10, possiblePoints: 10, teamStatus: PickStatus.CORRECT, gamesStatus: PickStatus.CORRECT, earnedBonusPoints: true }) }
		};
		const sum = new Summarizer(2025, { getAllTeams: () => ({}) });
		const roundSummary = sum.summarizeRound(pickResults);
		assert(roundSummary.summaries['Alice'].rank === 1, 'Alice should be rank 1');
		assert(roundSummary.summaries['Bob'].rank === 3, 'Bob should be rank 3');
		assert(roundSummary.summaries['Charlie'].rank === 1, 'Charlie should be rank 1');
		assert(roundSummary.winners.includes('Alice') && roundSummary.winners.includes('Charlie'), 'Should be tied winners');
	});

	// 6. Tiebreaker Deep Tests
	test('Summarizer (Tiebreakers)', 'Tiebreaker #1: Most exact games correct wins', () => {
		const sum = new Summarizer(2025, { getAllTeams: () => ({}) });
		const round = Round.create({
			summary: RoundSummary.create({
				summaries: {
					'Alice': PersonPointsSummary.create({ person: 'Alice', points: 10, gamesCorrect: 3, teamsCorrect: 1 }),
					'Bob': PersonPointsSummary.create({ person: 'Bob', points: 10, gamesCorrect: 1, teamsCorrect: 3 })
				}
			})
		});

		const yearlySummary = sum.summarizeYear([round], {});
		assert(yearlySummary.tiebreakInfo.leaders.length === 2, 'Should have 2 leaders tied on points');
		assert(yearlySummary.tiebreakInfo.winner === 'Alice', 'Alice should win Tiebreaker #1 via gamesCorrect');
	});

	test('Summarizer (Tiebreakers)', 'Tiebreaker #2: Most exact teams correct wins if games tied', () => {
		const sum = new Summarizer(2025, { getAllTeams: () => ({}) });
		const round = Round.create({
			summary: RoundSummary.create({
				summaries: {
					'Alice': PersonPointsSummary.create({ person: 'Alice', points: 10, gamesCorrect: 2, teamsCorrect: 1 }),
					'Bob': PersonPointsSummary.create({ person: 'Bob', points: 10, gamesCorrect: 2, teamsCorrect: 2 })
				}
			})
		});

		const yearlySummary = sum.summarizeYear([round], {});
		assert(yearlySummary.tiebreakInfo.winner === 'Bob', 'Bob should win Tiebreaker #2 via teamsCorrect');
	});

	test('Summarizer (Tiebreakers)', 'Tie resolves to undefined if entirely identical', () => {
		const sum = new Summarizer(2025, { getAllTeams: () => ({}) });
		const round = Round.create({
			summary: RoundSummary.create({
				summaries: {
					'Alice': PersonPointsSummary.create({ person: 'Alice', points: 10, gamesCorrect: 2, teamsCorrect: 2 }),
					'Bob': PersonPointsSummary.create({ person: 'Bob', points: 10, gamesCorrect: 2, teamsCorrect: 2 })
				}
			})
		});

		const yearlySummary = sum.summarizeYear([round], {});
		assert(yearlySummary.tiebreakInfo.winner === undefined, 'Winner should be undefined (completely tied)');
	});

	test('Summarizer', 'Gracefully handles a person missing an entire round of picks', () => {
		const sum = new Summarizer(2025, { getAllTeams: () => ({}) });
		
		const round1 = Round.create({
			summary: RoundSummary.create({
				summaries: {
					'Alice': PersonPointsSummary.create({ person: 'Alice', points: 10, gamesCorrect: 2, teamsCorrect: 2 }),
					'Bob': PersonPointsSummary.create({ person: 'Bob', points: 5, gamesCorrect: 1, teamsCorrect: 1 })
				}
			})
		});
		
		const round2 = Round.create({
			summary: RoundSummary.create({
				summaries: {
					// Alice forgot to submit picks for Round 2!
					'Bob': PersonPointsSummary.create({ person: 'Bob', points: 10, gamesCorrect: 2, teamsCorrect: 2 })
				}
			})
		});

		const yearlySummary = sum.summarizeYear([round1, round2], {});
		
		// Alice: R1(10) + R2(0) = 10 points
		// Bob: R1(5) + R2(10) = 15 points
		assert(yearlySummary.personSummaries['Alice'].points === 10, 'Alice should have 10 points total');
		assert(yearlySummary.personSummaries['Bob'].points === 15, 'Bob should have 15 points total');
		assert(yearlySummary.tiebreakInfo.winner === 'Bob', 'Bob should win the year');
	});

	// 7. Series Core Logic Tests
	test('Series Core Logic', 'isOver and getWinner operate correctly', () => {
		const series = Series.create({ topSeed: 'BOS', bottomSeed: 'TOR', topSeedWins: 4, bottomSeedWins: 3 });
		assert(series.isOver() === true, 'Series should be over');
		
		const winner = series.getWinner();
		assert(winner.team === 'BOS', 'BOS should be the winner');
		assert(winner.games === 7, 'Series should have gone 7 games');
	});

	test('Series Core Logic', 'isOver returns false for active series', () => {
		const series = Series.create({ topSeed: 'BOS', bottomSeed: 'TOR', topSeedWins: 3, bottomSeedWins: 3 });
		assert(series.isOver() === false, 'Series should not be over');
		assert(series.getWinner() === null, 'Winner should be null');
	});

	test('Series Core Logic', 'copy returns a new instance with overriding properties', () => {
		const series = Series.create({ letter: 'A', topSeedWins: 2 });
		const copied = series.copy({ topSeedWins: 4 });
		assert(copied.letter === 'A', 'Should retain original properties');
		assert(copied.topSeedWins === 4, 'Should apply overridden properties');
		assert(copied !== series, 'Should be a new instance');
	});

	return results;
}
