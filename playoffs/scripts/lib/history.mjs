// Loads every archived pool year into a compact, scoring-verified structure for trend analysis.
import fs from 'fs';
import path from 'path';
import { calculateYearSummary } from './yearSummary.mjs';

const cache = new Map();

export function toNames(value) {
	if (value === null || value === undefined) return [];
	return (Array.isArray(value) ? value : String(value).split(','))
		.map((n) => String(n).replace(/\*/g, '').trim())
		.filter((n) => n && n !== '-' && n !== 'In Progress');
}

/** Compact scored data for one year, or null if the year has no pool data (e.g. lockout). */
export async function loadYear(playoffsDir, year, index) {
	const key = `${playoffsDir}:${year}`;
	if (cache.has(key)) return cache.get(key);

	const archiveDir = path.join(playoffsDir, 'data', 'archive', String(year));
	let data = null;
	if (fs.existsSync(path.join(archiveDir, 'round1.csv'))) {
		const { rounds } = await calculateYearSummary(year, archiveDir);
		if (Object.keys(rounds[0].pickResults).length > 0) {
			const entry = index[String(year)] ?? {};
			data = {
				year,
				cup: entry.cupWinner ?? null,
				winners: toNames(entry.tiebreaker?.winner ?? entry.poolWinner),
				losers: toNames(entry.poolLoser),
				points: entry.points ?? {},
				rounds: rounds.map((round) => ({
					number: round.number,
					series: round.serieses.map((s) => ({
						letter: s.letter,
						top: s.topSeed,
						bottom: s.bottomSeed,
						winner: s.isOver() ? s.getWinner().team : null,
						games: s.topSeedWins + s.bottomSeedWins,
					})),
					picks: Object.fromEntries(
						Object.entries(round.pickResults).map(([person, results]) => [
							person,
							Object.fromEntries(
								Object.entries(results)
									.filter(([, r]) => r?.pick)
									.map(([letter, r]) => [
										letter,
										{
											team: r.pick.team,
											games: r.pick.games,
											teamOk: r.teamStatus === 'CORRECT',
											gamesOk: r.gamesStatus === 'CORRECT',
											pts: r.points,
										},
									]),
							),
						]),
					),
				})),
			};
		}
	}
	cache.set(key, data);
	return data;
}

/** All pool years up to and including `upTo`, oldest first. */
export async function loadHistory(playoffsDir, upTo) {
	const index = JSON.parse(fs.readFileSync(path.join(playoffsDir, 'data', 'summaries', 'yearly_index.json'), 'utf8'));
	const years = [];
	for (const y of Object.keys(index).map(Number).filter((y) => y > 0 && y !== 3000 && y <= upTo).sort((a, b) => a - b)) {
		const data = await loadYear(playoffsDir, y, index);
		if (data) years.push(data);
	}
	return years;
}

export const roundPoints = (round, person) =>
	Object.values(round.picks[person] ?? {}).reduce((sum, p) => sum + p.pts, 0);
