// Single entry point that builds the fact sheet for a round or a whole year (used by both the
// Gemini generator and by manual/Claude-written roasts).
import path from 'path';
import fs from 'fs';
import { calculateYearSummary } from './yearSummary.mjs';
import { buildRoundFacts } from './roundFacts.mjs';
import { loadHistory, roundPoints } from './history.mjs';
import { buildTrends, formatTrends } from './trends.mjs';

/** Career context for each person using ONLY years before `year`. */
function careerContext(history, year) {
	const prior = history.filter((y) => y.year < year);
	const people = [...new Set(history.find((y) => y.year === year)?.rounds[0] ? Object.keys(history.find((y) => y.year === year).rounds[0].picks) : [])];
	const lines = people.map((p) => {
		const seasons = prior.filter((y) => y.points[p] > 0);
		const wins = seasons.filter((y) => y.winners.includes(p)).map((y) => y.year);
		const lasts = seasons.filter((y) => y.losers.includes(p)).map((y) => y.year);
		const bits = [`${seasons.length} prior seasons`];
		bits.push(wins.length ? `won ${wins.length}x (${wins.join(', ')})` : 'never won');
		if (lasts.length) bits.push(`last place ${lasts.length}x (${lasts.join(', ')})`);
		const lastYear = prior[prior.length - 1];
		if (lastYear && lastYear.year === year - 1 && lastYear.points[p] > 0) bits.push(`${lastYear.year}: ${lastYear.points[p]} pts`);
		return `- ${p}: ${bits.join('; ')}`;
	});
	return 'CAREER CONTEXT BEFORE THIS YEAR:\n' + lines.join('\n');
}

export async function buildFactsText(playoffsDir, year, roundNum, { compact = false } = {}) {
	const archiveDir = path.join(playoffsDir, 'data', 'archive', String(year));
	const history = await loadHistory(playoffsDir, year);
	const trends = formatTrends(buildTrends(history, year, roundNum), roundNum === 'overall' ? 20 : 14);

	if (roundNum === 'overall') {
		const cur = history.find((y) => y.year === year);
		if (!cur) return 'No pool data for this year.';
		const sorted = Object.entries(cur.points).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
		const perRound = [1, 2, 3, 4].map((r) => {
			const rp = Object.keys(cur.rounds[r - 1].picks).map((p) => [p, roundPoints(cur.rounds[r - 1], p)]).sort((a, b) => b[1] - a[1]);
			return `Round ${r} best: ${rp.filter(([, v]) => v === rp[0][1]).map(([p]) => p).join('/')} (${rp[0][1]}); worst: ${rp.filter(([, v]) => v === rp[rp.length - 1][1]).map(([p]) => p).join('/')} (${rp[rp.length - 1][1]})`;
		});
		return [
			`Year ${year}. Stanley Cup champion: ${cur.cup}.`,
			`Pool winner: ${cur.winners.join(', ')}. Pool loser(s): ${cur.losers.join(', ')}.`,
			'FINAL STANDINGS (official):',
			sorted.map(([p, v], i) => `${i + 1}. ${p}: ${v}`).join('\n'),
			perRound.join('\n'),
			careerContext(history, year),
			trends,
		].join('\n\n');
	}

	const { rounds } = await calculateYearSummary(year, archiveDir);
	return [buildRoundFacts(rounds, roundNum, { compact }), trends].join('\n\n');
}
