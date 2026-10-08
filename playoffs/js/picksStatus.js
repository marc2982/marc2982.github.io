import { DataLoader } from './dataLoader.js';
import { NhlApiHandler } from './nhlApiHandler.js';
import { ALL_SERIES, Series } from './models.js';

/**
 * Whether picks can currently be submitted. Mirrors the round/lock logic on picks.html
 * (js/picks.js) so the home page can reflect it without loading the picks form.
 */

/** Picks season: from September we're looking ahead to next year's playoffs. */
export function picksYear(now = new Date()) {
	return now.getMonth() >= 8 ? now.getFullYear() + 1 : now.getFullYear();
}

const hasTeams = (s) => s.topSeed && s.topSeed !== 'undefined' && s.topSeed.toUpperCase() !== 'TBD' && s.bottomSeed && s.bottomSeed !== 'undefined' && s.bottomSeed.toUpperCase() !== 'TBD';

export function roundIndexOf(letter) {
	return ALL_SERIES.findIndex((round) => round.includes(letter));
}

/** Highest round with matchups set, or -1. Schedules must be fetched for the round and the next one before calling pickTargetRound. */
export function highestActiveRound(seriesList) {
	let max = -1;
	seriesList.filter(hasTeams).forEach((s) => {
		max = Math.max(max, roundIndexOf(s.letter));
	});
	return max;
}

/** The round picks apply to: the highest active round, or the next one once it has opened (overlapping rounds). */
export function pickTargetRound(seriesList, now = new Date()) {
	const max = highestActiveRound(seriesList);
	if (max < 0) return -1;
	if (max + 1 < ALL_SERIES.length) {
		const nextLetters = ALL_SERIES[max + 1];
		const nextOpen = seriesList.some((s) => nextLetters.includes(s.letter) && s.startTimeUTC && Series.isRoundOpen(s.startTimeUTC, now));
		if (nextOpen) return max + 1;
	}
	return max;
}

/**
 * State of the target round: 'open' (at least one series can still be picked), 'locked' (every series has started)
 * or 'not-open' (more than 3 days before the first game, or no schedule yet; unlockDate set when known).
 */
export function roundPicksState(seriesList, targetRoundIdx, now = new Date()) {
	if (targetRoundIdx < 0) return { state: 'not-open', round: null, unlockDate: null };
	const round = targetRoundIdx + 1;
	const roundSeries = seriesList.filter((s) => roundIndexOf(s.letter) === targetRoundIdx);
	const lead = Series.getChronologicalLeadSeries(roundSeries);
	if (!lead || !Series.isRoundOpen(lead.startTimeUTC, now)) {
		const unlockDate = lead?.startTimeUTC ? new Date(new Date(lead.startTimeUTC).getTime() - 3 * 24 * 60 * 60 * 1000) : null;
		return { state: 'not-open', round, unlockDate };
	}
	const anyPickable = roundSeries.some((s) => !(hasTeams(s) && (s.isLocked(now) || s.topSeedWins > 0 || s.bottomSeedWins > 0)));
	return { state: anyPickable ? 'open' : 'locked', round, unlockDate: null };
}

/** Loads the playoff data for the picks season and returns { state, round, unlockDate, year }; state 'unknown' on failure. */
export async function getPicksStatus(now = new Date()) {
	const year = picksYear(now);
	try {
		const loader = new DataLoader(year);
		const api = new NhlApiHandler(year, loader);
		await api.load();
		const seriesList = api.getSeriesList();
		const scf = seriesList.find((s) => s.letter === 'O');
		if (scf && scf.isOver()) return { state: 'not-open', round: null, unlockDate: null, year };

		const max = highestActiveRound(seriesList);
		if (max < 0) return { state: 'not-open', round: null, unlockDate: null, year };
		const letters = new Set(ALL_SERIES[max]);
		if (max + 1 < ALL_SERIES.length) ALL_SERIES[max + 1].forEach((l) => letters.add(l));
		await api.fetchSchedules([...letters]);

		return { ...roundPicksState(seriesList, pickTargetRound(seriesList, now), now), year };
	} catch (e) {
		if (e.message === 'PLAYOFFS_NOT_STARTED') return { state: 'not-open', round: null, unlockDate: null, year };
		return { state: 'unknown', round: null, unlockDate: null, year };
	}
}
