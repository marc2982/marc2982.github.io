import { parse } from 'https://cdn.skypack.dev/@vanillaes/csv';
import { Pick } from './models.js';

const DEFAULT_ORDER = [['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'], ['I', 'J', 'K', 'L'], ['M', 'N'], ['O']];

export class PicksImporter {
	constructor(api) {
		this.api = api;
	}

	async readCsv(folderName, round) {
		const filePath = `${folderName}/round${round}.csv`;
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
		rows.shift(); // Remove the first row (headers)
		return rows;
	}

	readPicks(rows, round) {
		const seriesOrder = this.getSeriesImportOrder(round);
		const picks = {};
		for (const row of rows) {
			const person = this.standardizeName(row[1]);
			const colIter = row.slice(2).values();
			let i = 0;
			for (const col of colIter) {
				const teamName = this.stripRank(col);
				const numGames = colIter.next().value;
				const seriesLetter = seriesOrder[i];
				if (typeof numGames !== 'string') {
					throw new Error(`Invalid games value for ${person} in series ${seriesLetter}`);
				}
				if (!picks[person]) {
					picks[person] = {};
				}
				picks[person][seriesLetter] = Pick.create({
					team: this.api.getTeam(teamName).short,
					games: parseInt(numGames, 10),
				});
				i++;
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
