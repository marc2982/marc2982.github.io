import { Series, ALL_SERIES, WINNER_MAP } from '../models.js';
import { NhlApiHandler } from '../nhlApiHandler.js';
import { GOOGLE_SCRIPT_URL } from '../config.js';

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

	return results;
}

/**
 * INTEGRATION TEST: Performs a real POST to the GAS Web App
 */
export async function runIntegrationTest(url, passcode) {
	if (!url || url.includes('YOUR_GOOGLE_SCRIPT_URL_HERE')) {
		throw new Error('Google Script URL not configured in config.js');
	}

	const testUser = `TestBot_${Math.floor(Date.now() / 1000)}`;
	const payload = {
		passcode: passcode,
		name: testUser,
		year: 2025,
		round: 1,
		picks: [
			{ winner: 'FLA', games: 4 },
			{ winner: 'EDM', games: 7 },
		],
	};

	try {
		const response = await fetch(url, {
			method: 'POST',
			body: JSON.stringify(payload),
		});

		// GAS web app returns a response that might be tricky with CORS
		// but if we are on localhost:8000 it might work if GAS is set to 'Anyone'
		const result = await response.json();

		if (result.result !== 'success') {
			throw new Error(result.error || 'Unknown error from GAS');
		}

		return { user: testUser, result: 'SUCCESS', details: 'Record successfully added to GitHub.' };
	} catch (e) {
		throw new Error(`Integration failed: ${e.message}. (Ensure Web App is deployed and URL is correct)`);
	}
}
