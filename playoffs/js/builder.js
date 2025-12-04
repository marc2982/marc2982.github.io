import { loadAndProcessCsvs } from './main.js';
import { fetchJson } from './httpUtils.js';

export async function loadAvailableYears() {
	try {
		// Load years from manifest file
		const years = await fetchJson('./data/years.json');
		return years; // Already sorted in descending order
	} catch (error) {
		console.error('Error loading years.json:', error);
		return [];
	}
}

export async function buildYearSummary(year) {
	console.log(`Building ${year}...`);

	// Use existing loadAndProcessCsvs function
	const dataPath = `./data/archive/${year}`;
	const summary = await loadAndProcessCsvs(year, dataPath);

	// Serialize to JSON
	const json = JSON.stringify(summary, null, 2);

	// Trigger download
	downloadFile(`${year}.json`, json);

	console.log(`✅ ${year}.json generated`);
	return summary;
}

export async function buildYearlyIndex() {
	console.log('Building yearly index...');

	const years = await loadAvailableYears();
	const index = {};

	// Load each year's summary from summaries directory
	for (const year of years) {
		try {
			const summary = await fetchJson(`./data/summaries/${year}.json`);

			// Extract minimal data for index
			index[year] = {
				year: parseInt(year),
				poolWinner: summary.tiebreakInfo?.winner || summary.winners?.[0] || null,
				poolLoser: summary.losers?.[0] || null,
				cupWinner: getCupWinner(summary),
				tiebreaker: summary.tiebreakInfo?.winner ? summary.tiebreakInfo : null,
			};
		} catch (error) {
			console.warn(`Skipping ${year} (not found in summaries):`, error.message);
		}
	}

	const json = JSON.stringify(index, null, 2);
	downloadFile('yearly_index.json', json);

	console.log(`✅ yearly_index.json generated with ${Object.keys(index).length} years`);
}

function getCupWinner(summary) {
	// Get the Stanley Cup winner from the final round
	const finalRound = summary.rounds?.find((r) => r.number === 4);
	if (!finalRound) return null;

	const scfSeries = finalRound.serieses?.[0];
	if (!scfSeries) return null;

	// Check who won
	if (scfSeries.topSeedWins === 4) {
		return scfSeries.topSeed;
	} else if (scfSeries.bottomSeedWins === 4) {
		return scfSeries.bottomSeed;
	}

	return null;
}

function downloadFile(filename, content) {
	const blob = new Blob([content], { type: 'application/json' });
	const url = URL.createObjectURL(blob);
	const a = document.createElement('a');
	a.href = url;
	a.download = filename;
	document.body.appendChild(a);
	a.click();
	document.body.removeChild(a);
	URL.revokeObjectURL(url);
}
