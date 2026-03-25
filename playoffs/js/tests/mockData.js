// Helper to get dates relative to a "mock now"
export function getRelativeDateString(daysOffset, baseDate = new Date()) {
	const d = new Date(baseDate);
	d.setDate(d.getDate() + daysOffset);
	return d.toISOString();
}

/** 
 * We will define a few distinct points in time.
 * The E2E script will set `MockTimeLoader.currentScenario` to transition between these states.
 */
export const SCENARIOS = {
    R1_LOCKED: 'R1_LOCKED',
    R1_OPEN: 'R1_OPEN',
    R1_FINISHED: 'R1_FINISHED',
    R2_OPEN: 'R2_OPEN'
};

export const MOCK_API_DATA = {
    // 16 teams set, seeds set. Game 1 starts in 5 days (locked)
    [SCENARIOS.R1_LOCKED]: {
        bracket: {
            series: [
                { seriesLetter: 'A', topSeedTeam: { abbrev: 'FLA', name: { default: 'Panthers' } }, bottomSeedTeam: { abbrev: 'TBL', name: { default: 'Lightning' } }, topSeedWins: 0, bottomSeedWins: 0 },
                { seriesLetter: 'B', topSeedTeam: { abbrev: 'BOS', name: { default: 'Bruins' } }, bottomSeedTeam: { abbrev: 'TOR', name: { default: 'Maple Leafs' } }, topSeedWins: 0, bottomSeedWins: 0 },
                // Just stubbing the rest for safety
                { seriesLetter: 'C', topSeedTeam: { abbrev: 'NYR' }, bottomSeedTeam: { abbrev: 'WSH' }, topSeedWins: 0, bottomSeedWins: 0 },
                { seriesLetter: 'D', topSeedTeam: { abbrev: 'CAR' }, bottomSeedTeam: { abbrev: 'NYI' }, topSeedWins: 0, bottomSeedWins: 0 },
                { seriesLetter: 'E', topSeedTeam: { abbrev: 'DAL' }, bottomSeedTeam: { abbrev: 'VGK' }, topSeedWins: 0, bottomSeedWins: 0 },
                { seriesLetter: 'F', topSeedTeam: { abbrev: 'WPG' }, bottomSeedTeam: { abbrev: 'COL' }, topSeedWins: 0, bottomSeedWins: 0 },
                { seriesLetter: 'G', topSeedTeam: { abbrev: 'VAN' }, bottomSeedTeam: { abbrev: 'NSH' }, topSeedWins: 0, bottomSeedWins: 0 },
                { seriesLetter: 'H', topSeedTeam: { abbrev: 'EDM' }, bottomSeedTeam: { abbrev: 'LAK' }, topSeedWins: 0, bottomSeedWins: 0 },
            ]
        },
        schedules: {
            'A': { games: [{ startTimeUTC: getRelativeDateString(5) }] },
            'B': { games: [{ startTimeUTC: getRelativeDateString(5) }] }
        }
    },
    
    // 16 teams set. Game 1 starts in 2 days (open)
    [SCENARIOS.R1_OPEN]: {
        bracket: {
            series: [
                { seriesLetter: 'A', topSeedTeam: { abbrev: 'FLA', name: { default: 'Panthers' } }, bottomSeedTeam: { abbrev: 'TBL', name: { default: 'Lightning' } }, topSeedWins: 0, bottomSeedWins: 0 },
                { seriesLetter: 'B', topSeedTeam: { abbrev: 'BOS', name: { default: 'Bruins' } }, bottomSeedTeam: { abbrev: 'TOR', name: { default: 'Maple Leafs' } }, topSeedWins: 0, bottomSeedWins: 0 },
                { seriesLetter: 'C', topSeedTeam: { abbrev: 'NYR' }, bottomSeedTeam: { abbrev: 'WSH' }, topSeedWins: 0, bottomSeedWins: 0 },
                { seriesLetter: 'D', topSeedTeam: { abbrev: 'CAR' }, bottomSeedTeam: { abbrev: 'NYI' }, topSeedWins: 0, bottomSeedWins: 0 },
                { seriesLetter: 'E', topSeedTeam: { abbrev: 'DAL' }, bottomSeedTeam: { abbrev: 'VGK' }, topSeedWins: 0, bottomSeedWins: 0 },
                { seriesLetter: 'F', topSeedTeam: { abbrev: 'WPG' }, bottomSeedTeam: { abbrev: 'COL' }, topSeedWins: 0, bottomSeedWins: 0 },
                { seriesLetter: 'G', topSeedTeam: { abbrev: 'VAN' }, bottomSeedTeam: { abbrev: 'NSH' }, topSeedWins: 0, bottomSeedWins: 0 },
                { seriesLetter: 'H', topSeedTeam: { abbrev: 'EDM' }, bottomSeedTeam: { abbrev: 'LAK' }, topSeedWins: 0, bottomSeedWins: 0 },
            ]
        },
        schedules: {
            'A': { games: [{ startTimeUTC: getRelativeDateString(2) }] },
            'B': { games: [{ startTimeUTC: getRelativeDateString(2) }] }
        }
    },
    
    // R1 finished. FLA and BOS won. (R2 locked and TBD)
    [SCENARIOS.R1_FINISHED]: {
        bracket: {
            series: [
                { seriesLetter: 'A', topSeedTeam: { abbrev: 'FLA', name: { default: 'Panthers' } }, bottomSeedTeam: { abbrev: 'TBL', name: { default: 'Lightning' } }, topSeedWins: 4, bottomSeedWins: 2 },
                { seriesLetter: 'B', topSeedTeam: { abbrev: 'BOS', name: { default: 'Bruins' } }, bottomSeedTeam: { abbrev: 'TOR', name: { default: 'Maple Leafs' } }, topSeedWins: 4, bottomSeedWins: 3 },
                // ... others can remain 0-0 for simplicity, we focus on Series I (A vs B)
            ]
        },
        schedules: {
            'I': { games: [{ startTimeUTC: getRelativeDateString(5) }] } // R2 game 1 in 5 days
        }
    },

    // R2 Open. Games start in 2 days.
    [SCENARIOS.R2_OPEN]: {
        bracket: {
            series: [
                { seriesLetter: 'A', topSeedTeam: { abbrev: 'FLA', name: { default: 'Panthers' } }, bottomSeedTeam: { abbrev: 'TBL', name: { default: 'Lightning' } }, topSeedWins: 4, bottomSeedWins: 2 },
                { seriesLetter: 'B', topSeedTeam: { abbrev: 'BOS', name: { default: 'Bruins' } }, bottomSeedTeam: { abbrev: 'TOR', name: { default: 'Maple Leafs' } }, topSeedWins: 4, bottomSeedWins: 3 },
                // Series I seeds now set (FLA vs BOS)
                { seriesLetter: 'I', topSeedTeam: { abbrev: 'FLA' }, bottomSeedTeam: { abbrev: 'BOS' }, topSeedWins: 0, bottomSeedWins: 0 }
            ]
        },
        schedules: {
            'I': { games: [{ startTimeUTC: getRelativeDateString(2) }] } 
        }
    }
};
