import { parse } from 'https://cdn.skypack.dev/@vanillaes/csv';
import { Pick } from './models.js';

const DEFAULT_ORDER = [['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'], ['I', 'J', 'K', 'L'], ['M', 'N'], ['O']];

export class PicksImporter {
	constructor(api) {
		this.api = api;
	}

	async readCsv(folderName, round) {
		const filePath = `${folderName}/round${round}.csv` + '?timestamp=' + new Date().getTime();
		try {
			const csvData = await this.readCsvFile(filePath);
			return this.readPicks(csvData, round);
		} catch (error) {
			console.error(`Error reading CSV for round ${round}:`, error);
			return {};
		}
	}

	async readCsvFile(filePath) {
		const response = await fetch(filePath);
		if (!response.ok) {
			console.log(`Failed to load CSV file: ${filePath}`);
			return [];
		}
		const csvText = await response.text();
		const rows = parse(csvText);
		rows.shift();
		return rows;
	}

	readPicks(rows, round) {
		const picks = {};
		// Get all series for this round to look up against
		const seriesInRound = Array.from(this.api.seriesIter(round));

		// timestamp is first column, ignored
		const nameIndex = 1;
		const picksStartIndex = 2;

		for (const row of rows) {
			const person = this.standardizeName(row[nameIndex]);
			const colIter = row.slice(picksStartIndex).values();

			for (const col of colIter) {
				const teamName = this.stripRank(col);
				const numGames = colIter.next().value;

				if (!teamName || !numGames) continue;

				try {
					const team = this.api.getTeam(teamName);
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
		return DEFAULT_ORDER[round - 1];
	}
}
