import { Pick, ALL_SERIES } from './models.js';
import { loadCsv } from './csvProcessor.js';

export class PicksImporter {
	constructor(seriesRepo, teamRepo) {
		this.seriesRepo = seriesRepo;
		this.teamRepo = teamRepo;
	}

	async readCsv(dataDir, round) {
		const filename = `${dataDir}/round${round}.csv`;
		const data = await loadCsv(filename);
		const picks = {};
		// Get all series for this round to look up against
		const seriesLetters = ALL_SERIES[round - 1];
		const seriesInRound = seriesLetters.map((letter) => this.seriesRepo.getSeries(letter));

		// timestamp is first column, ignored
		const nameIndex = 1;
		const picksStartIndex = 2;

		// skip header
		for (const row of data.slice(1)) {
			const person = this.standardizeName(row[nameIndex]);
			const colIter = row.slice(picksStartIndex).values();

			for (const col of colIter) {
				const teamName = this.stripRank(col);
				const numGames = colIter.next().value;

				if (!teamName || !numGames) continue;

				try {
					const team = this.teamRepo.getTeam(teamName); // Keep this for series lookup, or modify parsePick to return team object
					// Find which series this team belongs to
					const series = seriesInRound.find((s) => s.topSeed === team.short || s.bottomSeed === team.short);

					if (!series) {
						console.warn(`Could not find series for team ${teamName} (${team.short})`);
						continue;
					}

					if (typeof numGames !== 'string') {
						throw new Error(`Invalid games value for ${person} in series ${series.letter}`);
					}

					if (!picks[person]) {
						picks[person] = {};
					}

					picks[person][series.letter] = Pick.create({
						team: team.short,
						games: parseInt(numGames, 10),
					});
				} catch (e) {
					throw new Error(`Skipping pick for ${person}: ${e.message}`);
				}
			}
		}
		return picks;
	}

	standardizeName(name) {
		const lowerName = name.toLowerCase();
		switch (lowerName) {
			case 'dad':
				return 'Derrick';
			case 'mom':
			case 'chris':
				return 'Chrissy';
			case 'm.c.b.':
				return 'Marc';
			default:
				return lowerName.charAt(0).toUpperCase() + lowerName.slice(1);
		}
	}

	stripRank(teamName) {
		const i = teamName.indexOf('(');
		return i === -1 ? teamName : teamName.substring(0, i - 1);
	}

	getSeriesImportOrder(round) {
		return ALL_SERIES[round - 1];
	}
}
