import { ScenarioAnalyzer } from '../scenarioAnalyzer.js';
import { Series, Scoring } from '../models.js';

function mockSeries(data) {
	return Series.create({ topSeedWins: 0, bottomSeedWins: 0, ...data });
}

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

	test('ScenarioAnalyzer', 'Full Analysis - Opposite Picks', () => {
		const analyzer = new ScenarioAnalyzer();
		const scoring = Scoring.create({ team: 2, games: 3, bonus: 4 });
		const series = mockSeries({ letter: 'I', topSeed: 'EDM', bottomSeed: 'VAN' });
		
		const round = {
			scoring,
			serieses: [series],
			pickResults: {
				'Alice': { 'I': { pick: { team: 'EDM', games: 6 } } },
				'Bob': { 'I': { pick: { team: 'VAN', games: 7 } } }
			},
			summary: { summaries: { 'Alice': { points: 0 }, 'Bob': { points: 0 } } }
		};

		// Current gap is 0. Alice can catch Bob if EDM wins.
		const analysis = analyzer.analyzeAllScenarios('Alice', 'Bob', round, {});
		
		assert(analysis.totalCount === 8, `Expected 8 permutations for one series, got ${analysis.totalCount}`);
		assert(analysis.successCount === 4, `Expected 4 successful scenarios (EDM wins), got ${analysis.successCount}`);
		assert(analysis.canCatch === true, 'Alice should be able to catch Bob');
		assert(analysis.highImpact.length > 0, 'Should have high impact outcomes');
		assert(analysis.aggressivePath.totalRelativeGain === 9, 'Best gain should be 9');
	});

	test('ScenarioAnalyzer', 'In-Progress Filtering', () => {
		const analyzer = new ScenarioAnalyzer();
		const scoring = Scoring.create({ team: 1, games: 0, bonus: 0 });
		// EDM is up 3-0. VAN cannot win in 4, 5, or 6.
		const series = mockSeries({ letter: 'I', topSeed: 'EDM', bottomSeed: 'VAN', topSeedWins: 3, bottomSeedWins: 0 });
		
		const outcomes = analyzer.getPossibleOutcomes(series);
		
		// Possible outcomes for EDM: win in 4, 5, 6, 7
		// Possible outcomes for VAN: win in 7 (needs 4 straight wins)
		// But wait, my logic says "oppWins <= requiredOppWins". 
		// If VAN wins in 4, requiredOppWins is 0. But EDM already has 3. So impossible.
		// If VAN wins in 7, requiredOppWins is 3. EDM has 3. So possible.
		
		const vanWins = outcomes.filter(o => o.team === 'VAN');
		assert(vanWins.length === 1 && vanWins[0].games === 7, 'VAN should only be able to win in 7 if down 0-3');
		
		const edmWins = outcomes.filter(o => o.team === 'EDM');
		assert(edmWins.length === 4, 'EDM should still be able to win in 4, 5, 6, or 7');
	});

	test('ScenarioAnalyzer', 'High Impact Detection', () => {
		const analyzer = new ScenarioAnalyzer();
		const scoring = Scoring.create({ team: 1, games: 0, bonus: 0 });
		const seriesI = mockSeries({ letter: 'I', topSeed: 'EDM', bottomSeed: 'VAN' });
		const seriesJ = mockSeries({ letter: 'J', topSeed: 'FLA', bottomSeed: 'BOS' });
		
		const round = {
			scoring,
			serieses: [seriesI, seriesJ],
			pickResults: {
				'Alice': { 
					'I': { pick: { team: 'EDM', games: 4 } },
					'J': { pick: { team: 'FLA', games: 4 } }
				},
				'Bob': { 
					'I': { pick: { team: 'VAN', games: 4 } }, // Bob picked opposite for I
					'J': { pick: { team: 'FLA', games: 4 } }  // Bob picked same for J
				}
			},
			summary: { summaries: { 'Alice': { points: 0 }, 'Bob': { points: 0 } } }
		};

		// Alice needs to catch Bob who is 1 pt ahead
		const analysis = analyzer.analyzeAllScenarios('Alice', 'Bob', round, { 'Alice': 0, 'Bob': 1 });
		
		// To catch Bob, Alice MUST get points in series I because series J is identical.
		// So EDM winning is a "High Impact" outcome (frequency should be 1.0)
		assert(analysis.highImpact.some(h => h.team === 'EDM'), 'EDM win should be high impact');
		const edmImpact = analysis.highImpact.find(h => h.team === 'EDM');
		assert(edmImpact.frequency === 1.0, `EDM should be required in 100% of successful paths, got ${edmImpact.frequency}`);
	});

	test('ScenarioAnalyzer', 'Rank Volatility - Locked Gaps', () => {
		const analyzer = new ScenarioAnalyzer();
		const scoring = Scoring.create({ team: 1, games: 0, bonus: 0 });
		const series = mockSeries({ letter: 'I', topSeed: 'EDM', bottomSeed: 'VAN' });
		
		const round = {
			scoring,
			serieses: [series],
			pickResults: {
				'Alice': { 'I': { pick: { team: 'EDM', games: 6 } } },
				'Bob': { 'I': { pick: { team: 'VAN', games: 7 } } }
			},
			summary: { summaries: { 'Alice': { points: 0 }, 'Bob': { points: 0 } } }
		};

		// Alice has 100 points, Bob has 0. Even if Alice gets 0 and Bob gets 1, Alice wins.
		const volatility = analyzer.analyzeRankVolatility(round, { 'Alice': 100, 'Bob': 0 });
		
		assert(volatility['Alice'].rankRange[0] === 1 && volatility['Alice'].rankRange[1] === 1, 'Alice should be locked at 1');
		assert(volatility['Bob'].rankRange[0] === 2 && volatility['Bob'].rankRange[1] === 2, 'Bob should be locked at 2');
	});

	return results;
}
