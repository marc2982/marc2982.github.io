// Pure helpers behind the home page hero strip and the wins/losses badges.
import { toNameList, IN_PROGRESS } from './common.js';

/** Years with a decided pool, oldest first (skips the lockout and the season in progress). */
export function playedYears(years) {
	return years
		.filter((y) => y.poolWinner && y.poolWinner !== IN_PROGRESS && y.cupWinner !== 'LOCKOUT')
		.sort((a, b) => a.year - b.year);
}

/**
 * Runs of consecutive pool titles, e.g. { Nathan: [{ start: 2019, end: 2020, length: 2 }] }.
 * "Consecutive" means consecutive played seasons, so a title either side of the 2005 lockout counts.
 */
export function findRepeatChampions(years) {
	const played = playedYears(years);
	const runs = {};
	const open = {}; // name -> current run
	played.forEach((y) => {
		const winners = toNameList(y.poolWinner);
		Object.keys(open).forEach((name) => {
			if (!winners.includes(name)) delete open[name];
		});
		winners.forEach((name) => {
			if (open[name]) {
				open[name].end = y.year;
				open[name].length++;
			} else {
				open[name] = { start: y.year, end: y.year, length: 1 };
				(runs[name] = runs[name] || []).push(open[name]);
			}
		});
	});
	Object.keys(runs).forEach((name) => {
		runs[name] = runs[name].filter((r) => r.length >= 2);
		if (!runs[name].length) delete runs[name];
	});
	return runs;
}

/** Latest decided season plus the all-time title leader(s). */
export function heroStats(years) {
	const played = playedYears(years);
	if (!played.length) return null;
	const latest = played[played.length - 1];
	const winners = toNameList(latest.poolWinner);
	const losers = toNameList(latest.poolLoser);

	const titles = {};
	played.forEach((y) => toNameList(y.poolWinner).forEach((n) => (titles[n] = (titles[n] || 0) + 1)));
	const most = Math.max(...Object.values(titles));
	return {
		year: latest.year,
		winners,
		losers,
		winnerPoints: winners.length ? latest.points?.[winners[0]] ?? null : null,
		loserPoints: losers.length ? latest.points?.[losers[0]] ?? null : null,
		cupWinner: latest.cupWinner || '',
		titleLeaders: Object.keys(titles).filter((n) => titles[n] === most),
		titleLeaderCount: most,
	};
}
