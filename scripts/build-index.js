import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.join(__dirname, '..');
const SUMMARIES_DIR = path.join(ROOT_DIR, 'playoffs', 'data', 'summaries');

export async function buildIndex() {
	const summaryFiles = fs
		.readdirSync(SUMMARIES_DIR)
		.filter((f) => f.endsWith('.json') && f !== 'yearly_index.json')
		.sort()
		.reverse(); // Most recent first

	const index = {};

	for (const file of summaryFiles) {
		const year = file.replace('.json', '');
		const summaryPath = path.join(SUMMARIES_DIR, file);
		const summary = JSON.parse(fs.readFileSync(summaryPath, 'utf-8'));

		// Extract minimal data for index
		index[year] = {
			year: summary.year,
			poolWinner: summary.tiebreakInfo?.winner || summary.winners?.[0] || null,
			poolLoser: summary.losers?.[0] || null,
			cupWinner: getCupWinner(summary),
			tiebreaker: summary.tiebreakInfo?.winner ? summary.tiebreakInfo : null,
		};
	}

	const outputPath = path.join(SUMMARIES_DIR, 'yearly_index.json');
	fs.writeFileSync(outputPath, JSON.stringify(index, null, 2));

	console.log(`  - Indexed ${summaryFiles.length} years`);
}

function getCupWinner(summary) {
	// Get the Stanley Cup winner from the final round
	const finalRound = summary.rounds?.find((r) => r.number === 4);
	if (!finalRound) return null;

	const scfSeries = finalRound.serieses?.[0];
	if (!scfSeries) return null;

	const winner = scfSeries.getWinner?.() || getWinnerFromSeries(scfSeries);
	return winner?.team || null;
}

function getWinnerFromSeries(series) {
	// Fallback if getWinner is not available
	if (series.topSeedWins === 4) {
		return { team: series.topSeed };
	} else if (series.bottomSeedWins === 4) {
		return { team: series.bottomSeed };
	}
	return null;
}
