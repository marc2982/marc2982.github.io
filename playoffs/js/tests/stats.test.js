import { aggregatePickStats } from '../pickAnalysis.js';

export async function runStatsTests() {
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

    // Mock payload containing active game states and pick scores
    const mockResults = [{
        year: 2025,
        summary: {
            rounds: [{
                number: 1,
                serieses: [
                    { letter: 'A', topSeed: 'FLA', bottomSeed: 'TBL', topSeedWins: 4, bottomSeedWins: 2 } // 6 actual games
                ],
                pickResults: {
                    'Marc': {
                        'A': {
                            pick: { team: 'FLA', games: 5 },
                            points: 1, // Only team correct, 0 for games/bonus => Not a Mush, just 1 pt
                            teamStatus: 'CORRECT',
                            gamesStatus: 'INCORRECT'
                        }
                    },
                    'Ryan': {
                        'A': {
                            pick: { team: 'TBL', games: 4 },
                            points: 0, // Both wrong => Mush Candidate!
                            teamStatus: 'INCORRECT',
                            gamesStatus: 'INCORRECT'
                        }
                    }
                }
            }]
        }
    }];
    const mockIndex = {};

    test('Fun Stats (Mush)', 'Zero point picks are correctly tracked as Airballs', () => {
        const statsArray = aggregatePickStats(mockResults, mockIndex);
        const marc = statsArray.find(s => s.name === 'Marc');
        const ryan = statsArray.find(s => s.name === 'Ryan');
        
        assert(marc.zeroPointPicks === 0, 'Marc got 1 point, should have 0 mush picks');
        assert(ryan.zeroPointPicks === 1, 'Ryan got 0 points, should have 1 mush pick');
    });

    test('Fun Stats (Over/Under Estimator)', 'Calculates predicted games vs actual games played', () => {
        const statsArray = aggregatePickStats(mockResults, mockIndex);
        const marc = statsArray.find(s => s.name === 'Marc');
        
        assert(marc.totalGamesPredicted === 5, 'Marc predicted 5 games in his picks');
        assert(marc.totalGamesActual === 6, 'Actual games in reality was 6');
    });

    test('Fun Stats (Jinx)', 'Tracks losses when a specific team was picked by the user', () => {
        const statsArray = aggregatePickStats(mockResults, mockIndex);
        const ryan = statsArray.find(s => s.name === 'Ryan');
        
        // Ryan picked TBL, but TBL lost the series.
        assert(ryan.jinxStats['TBL'] === 1, 'TBL should have 1 loss attributed to Ryan picking them');
    });

    return results;
}
