// Node-side helpers that score a year with the exact same code the website uses
// (js/yearBuilder.js), so scripts can never drift from what the year page shows.
import fs from 'fs';
import path from 'path';
import { buildYearData } from '../../js/yearBuilder.js';

/** DataLoader that reads api.json / schedule_X.json straight from an archive directory. */
export class FsDataLoader {
	constructor(archiveDir) {
		this.archiveDir = archiveDir;
	}

	async load() {
		const apiPath = path.join(this.archiveDir, 'api.json');
		return fs.existsSync(apiPath) ? JSON.parse(fs.readFileSync(apiPath, 'utf8')) : null;
	}

	async fetchSeriesSchedule(_year, letter) {
		const schedulePath = path.join(this.archiveDir, `schedule_${letter}.json`);
		return fs.existsSync(schedulePath) ? JSON.parse(fs.readFileSync(schedulePath, 'utf8')) : null;
	}
}

/** Scores every round of a year from its archive directory (api.json + roundN.csv). */
export async function calculateYearSummary(year, archiveDir) {
	const { rounds, summarizer } = await buildYearData({
		year,
		dataLoader: new FsDataLoader(archiveDir),
		readRoundCsv: async (roundNum) => {
			const csvPath = path.join(archiveDir, `round${roundNum}.csv`);
			return fs.existsSync(csvPath) ? fs.readFileSync(csvPath, 'utf8') : null;
		},
	});
	return { rounds, summary: summarizer.summarizeYear(rounds, {}) };
}

export function isPlayoffsComplete(rounds) {
	return rounds.every((round) => round.serieses.every((series) => series.isOver()));
}

/**
 * The entry stored in data/summaries/yearly_index.json, or null if the playoffs aren't over.
 * Ties for last place are kept as an array; unresolved ties for first become "A, B".
 */
export function indexEntryFromSummary(year, summary, rounds) {
	if (!isPlayoffsComplete(rounds)) return null;

	const points = Object.fromEntries(
		Object.entries(summary.personSummaries)
			.map(([person, personSummary]) => [person, personSummary.points])
			.sort(([, a], [, b]) => b - a),
	);
	const leaders = summary.winners;
	const poolWinner = summary.tiebreakInfo?.winner ?? leaders.join(', ');
	const poolLoser = summary.losers.length === 1 ? summary.losers[0] : summary.losers;
	const cupWinner = rounds[rounds.length - 1].serieses[0].getWinner().team;

	return {
		year: Number(year),
		poolWinner,
		poolLoser,
		cupWinner,
		tiebreaker: { leaders, winner: poolWinner },
		points,
	};
}
