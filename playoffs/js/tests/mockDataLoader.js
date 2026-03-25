import { SCENARIOS, MOCK_API_DATA } from './mockData.js';

export class MockDataLoader {
	constructor(year) {
		this.year = year;
        this.currentScenario = SCENARIOS.R1_LOCKED;
        this.mockPicks = {}; // In-memory CVS store { "round1": [rows] }
	}

    setScenario(scenarioKey) {
        this.currentScenario = scenarioKey;
        console.log(`[E2E] Time traveled to scenario: ${scenarioKey}`);
    }

	async load() {
        return MOCK_API_DATA[this.currentScenario].bracket;
	}

	async fetchSeriesSchedule(_year, seriesLetter) {
		const schedules = MOCK_API_DATA[this.currentScenario].schedules;
        return schedules[seriesLetter] || null;
	}

    // --- We also need to mock PicksImporter for CSV reading ---
    // The E2E tests can inject mock picks into this string
    async fetchCsv(roundNum) {
        if (!this.mockPicks[roundNum]) {
            return "Timestamp,Name,Team,Games,Team,Games\n";
        }
        return this.mockPicks[roundNum];
    }

    addMockPick(roundNum, csvRowStr) {
        if (!this.mockPicks[roundNum]) {
            this.mockPicks[roundNum] = "Timestamp,Name,Team,Games,Team,Games\n";
        }
        this.mockPicks[roundNum] += csvRowStr + "\n";
    }
}
