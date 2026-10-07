import { Pick, ALL_SERIES } from './models.js';

// Minimal CSV parser that works in both browser and Node (no CDN dependency).
// Handles quoted fields and comma-separated values.
function parseCsvString(csvString) {
	return csvString.trim().split(/\r?\n/).map(line => {
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

	processRows(csvString, round) {
		const data = parseCsvString(csvString);
		const picks = {};
		const seriesLetters = ALL_SERIES[round - 1];
		const seriesInRound = seriesLetters.map((letter) => this.seriesRepo.getSeries(letter));

		const nameIndex = 1;
		const picksStartIndex = 2;

		// skip header
		for (const row of data.slice(1)) {
			if (!row[nameIndex] || !row[nameIndex].trim()) continue; // blank/malformed row
			const person = this.standardizeName(row[nameIndex].trim());

			// Rows are chronological. If someone appears again (e.g. an admin appended a
			// corrective row), the latest row replaces their earlier picks for this round.
			picks[person] = {};

			const colIter = row.slice(picksStartIndex).values();

			for (const col of colIter) {
				const teamNameFull = col.trim();
				const teamName = this.stripRank(teamNameFull);
				const numGames = colIter.next().value;

				if (!teamName || !numGames) continue;

				const gamesCount = parseInt(numGames, 10);
				if (Number.isNaN(gamesCount)) {
					console.warn(`Ignoring pick for ${person}: invalid games value "${numGames}" for ${teamName}`);
					continue;
				}

				// Extract opponent if provided in the string (e.g. "NYR (vs BOS)")
				let opponentMatch = teamNameFull.match(/\(vs ([A-Z]+)\)/);
				let opponent = opponentMatch ? opponentMatch[1] : null;

				try {
					const team = this.teamRepo.getTeam(teamName);
					if (!team) continue;

					// Match the series containing the picked team AND the optionally specified opponent
					const series = seriesInRound.find((s) => {
						if (!s) return false;
						const hasTeam = s.topSeed === team.short || s.bottomSeed === team.short || 
										(s.possibleTopSeeds && s.possibleTopSeeds.includes(team.short)) || 
										(s.possibleBottomSeeds && s.possibleBottomSeeds.includes(team.short));
						if (!hasTeam) return false;
						if (opponent) {
							return s.topSeed === opponent || s.bottomSeed === opponent ||
								   (s.possibleTopSeeds && s.possibleTopSeeds.includes(opponent)) ||
								   (s.possibleBottomSeeds && s.possibleBottomSeeds.includes(opponent));
						}
						return true;
					});

					if (!series) {
						// Only warn if they didn't specify an opponent... if they specified
						// an opponent and it missed, it just means that contingency branch didn't happen
						if (!opponent) {
							console.warn(`Could not find series for team ${teamName} (${team.short})`);
						}
						continue;
					}

					if (!picks[person][series.letter]) {
						picks[person][series.letter] = [];
					}

					picks[person][series.letter].push(Pick.create({
						team: team.short,
						games: gamesCount,
						opponent: opponent,
					}));
				} catch (e) {
					// An unrecognised team shouldn't take the whole year's page down
					console.warn(`Skipping pick for ${person}: ${e.message}`);
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
