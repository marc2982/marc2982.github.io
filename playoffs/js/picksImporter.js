import { Pick, ALL_SERIES } from './models.js';

// Minimal CSV parser that works in both browser and Node (no CDN dependency).
// Handles quoted fields and comma-separated values.
function parseCsvString(csvString) {
	return csvString.trim().split('\n').map(line => {
		const row = [];
		let current = '';
		let inQuotes = false;
		for (const ch of line) {
			if (ch === '"') { inQuotes = !inQuotes; }
			else if (ch === ',' && !inQuotes) { row.push(current); current = ''; }
			else { current += ch; }
		}
		row.push(current);
		return row;
	});
}


export class PicksImporter {
	constructor(seriesRepo, teamRepo) {
		this.seriesRepo = seriesRepo;
		this.teamRepo = teamRepo;
	}

	async readCsv(dataDir, round) {
		const filename = `${dataDir}/round${round}.csv`;
		const { loadCsv } = await import('./csvProcessor.js');
		const data = await loadCsv(filename);
		// loadCsv returns string[][] already parsed; serialise back to a simple CSV
		// string so processRows can handle both paths uniformly.
		const csvString = data.map(row => row.join(',')).join('\n');
		return this.processRows(csvString, round);
	}

	processRows(csvString, round) {
		const data = parseCsvString(csvString);
		const picks = {};
		const seriesLetters = ALL_SERIES[round - 1];
		const seriesInRound = seriesLetters.map((letter) => this.seriesRepo.getSeries(letter));

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
					const team = this.teamRepo.getTeam(teamName);
					const series = seriesInRound.find((s) => s && (s.topSeed === team.short || s.bottomSeed === team.short));

					if (!series) {
						console.warn(`Could not find series for team ${teamName} (${team.short})`);
						continue;
					}

					if (typeof numGames !== 'string') {
						throw new Error(`Invalid games value for ${person} in series ${series.letter}`);
					}

					if (!picks[person]) picks[person] = {};

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
			case 'steph':
				return 'Stephanie';
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
