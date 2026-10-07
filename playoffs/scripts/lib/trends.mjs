// Computes verified, plain-English "notable trends" (cross-round and cross-year) as of a point in time.
// Nothing here looks past (year, roundNum), so a 2019 round-1 roast can't mention 2024.
import { roundPoints } from './history.mjs';

const ordinal = (n) => `${n}${['th', 'st', 'nd', 'rd'][n % 100 > 10 && n % 100 < 14 ? 0 : n % 10 < 4 ? n % 10 : 0]}`;
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
const ROUND_NAMES = ['first round', 'second round', 'conference semis', 'conference finals', 'Stanley Cup Final'];

function rankMap(points) {
	const sorted = Object.entries(points).sort((a, b) => b[1] - a[1]);
	const ranks = {};
	sorted.forEach(([person, pts]) => {
		ranks[person] = 1 + sorted.filter(([, other]) => other > pts).length;
	});
	return ranks;
}

/** True when two pool seasons are back-to-back (the 2005 lockout doesn't break a streak, a missing season does). */
const consecutiveSeasons = (a, b) => b - a === 1 || (a === 2004 && b === 2006);

/** Length of the run of true flags at the end of `flags`; `years` (parallel array) must be consecutive seasons. */
function trailingRun(flags, years) {
	let n = 0;
	for (let i = flags.length - 1; i >= 0 && flags[i]; i--) {
		if (years && i < flags.length - 1 && !consecutiveSeasons(years[i], years[i + 1])) break;
		n++;
	}
	return n;
}

/**
 * @param {object[]} history years up to and including `year` (oldest first)
 * @param {number} year
 * @param {number|'overall'} roundNum
 * @returns {{priority:number, text:string}[]} sorted, most interesting first
 */
export function buildTrends(history, year, roundNum) {
	const cur = history.find((y) => y.year === year);
	if (!cur) return [];
	const lastRound = roundNum === 'overall' ? 4 : roundNum;
	const prior = history.filter((y) => y.year < year);
	const out = [];
	const add = (priority, text) => out.push({ priority, text });

	const isOverall = roundNum === 'overall';
	const round = cur.rounds[lastRound - 1];
	const people = Object.keys(round.picks);

	// ---------- Within this year ----------
	// Cumulative rank trajectory
	const cumulative = people.map((p) => [p, []]);
	const cumByPerson = Object.fromEntries(cumulative);
	const rankAfter = [];
	const running = Object.fromEntries(people.map((p) => [p, 0]));
	for (let r = 0; r < lastRound; r++) {
		for (const p of people) running[p] += roundPoints(cur.rounds[r], p);
		rankAfter.push(rankMap(running));
		people.forEach((p) => cumByPerson[p].push(running[p]));
	}
	const leaderAfter = rankAfter.map((ranks) => Object.keys(ranks).filter((p) => ranks[p] === 1));
	if (lastRound >= 2) {
		const leaderChanges = leaderAfter.slice(1).filter((l, i) => l.join() !== leaderAfter[i].join()).length;
		if (leaderChanges >= 2) add(5, `The lead changed hands ${leaderChanges} times over ${lastRound} rounds (leader after each round: ${leaderAfter.map((l) => l.join('/')).join(' -> ')}).`);
		const prevRanks = rankAfter[lastRound - 2];
		const nowRanks = rankAfter[lastRound - 1];
		const moves = people.map((p) => [p, prevRanks[p] - nowRanks[p]]).sort((a, b) => b[1] - a[1]);
		const [best, worst] = [moves[0], moves[moves.length - 1]];
		if (!isOverall && best[1] >= 4) add(6, `${best[0]} jumped ${best[1]} places this round (${ordinal(prevRanks[best[0]])} to ${ordinal(nowRanks[best[0]])} overall).`);
		if (!isOverall && worst[1] <= -4) add(6, `${worst[0]} dropped ${-worst[1]} places this round (${ordinal(prevRanks[worst[0]])} to ${ordinal(nowRanks[worst[0]])} overall).`);
		if (isOverall) {
			const r1 = rankAfter[0];
			const fin = rankAfter[lastRound - 1];
			const swings = people.map((p) => [p, r1[p] - fin[p]]).sort((a, b) => b[1] - a[1]);
			if (swings[0][1] >= 5) add(6, `${swings[0][0]} climbed from ${ordinal(r1[swings[0][0]])} after round 1 to ${ordinal(fin[swings[0][0]])} at the end.`);
		}
		const prevLeaders = leaderAfter[lastRound - 2];
		const nowLeaders = leaderAfter[lastRound - 1];
		if (nowLeaders.some((l) => !prevLeaders.includes(l))) add(7, `${nowLeaders.join(' and ')} ${nowLeaders.length > 1 ? 'share' : 'took'} the overall lead (previous leader${prevLeaders.length > 1 ? 's' : ''}: ${prevLeaders.join('/')}).`);
		else add(3, `${nowLeaders.join('/')} still leads overall.`);
		// early leader who faded
		if (lastRound >= 3) {
			for (const p of leaderAfter[0]) {
				if (nowRanks[p] > 5) add(6, `${p} led after round 1 but is now ${ordinal(nowRanks[p])} overall.`);
			}
		}
	}

	const rp = Object.fromEntries(people.map((p) => [p, roundPoints(round, p)]));
	// Round-level extremes and habits
	if (!isOverall) {
	const teamsRight = Object.fromEntries(people.map((p) => [p, Object.values(round.picks[p]).filter((x) => x.teamOk).length]));
	const nSeries = round.series.length;
	for (const p of people) {
		const picks = Object.values(round.picks[p]);
		if (picks.length >= 3 && picks.every((x) => !x.teamOk)) add(7, `${p} picked the wrong team in every series this round (0 of ${picks.length}).`);
		if (nSeries >= 4 && picks.length === nSeries && picks.every((x) => x.teamOk)) add(7, `${p} picked every winning team this round (${nSeries} of ${nSeries}).`);
		if (picks.length >= 4 && new Set(picks.map((x) => x.games)).size === 1) {
			const g = picks[0].games;
			const earlier = prior.reduce((n, y) => n + y.rounds.filter((rd) => {
				const pk = Object.values(rd.picks[p] ?? {});
				return pk.length >= 4 && new Set(pk.map((x) => x.games)).size === 1;
			}).length, 0);
			add(8, `${p} picked all ${picks.length} series in ${g} games.${earlier ? ` They have done the same all-identical-length round ${plural(earlier, 'time')} in earlier years.` : ''}`);
		}
		const missing = round.series.filter((s) => !round.picks[p][s.letter]).length;
		if (missing > 0) add(4, `${p} made no pick in ${plural(missing, 'series')} this round.`);
		if (rp[p] === 0 && lastRound <= 2) {
			const zeroBefore = prior.reduce((n, y) => n + y.rounds.filter((rd) => rd.picks[p] && roundPoints(rd, p) === 0).length, 0);
			add(7, `${p} scored 0 points this round${zeroBefore ? ` (their ${ordinal(zeroBefore + 1)} zero-point round ever)` : ''}.`);
		}
	}

	// Same round, last/first in consecutive years
	const rankIn = (y, r) => {
		const ps = Object.keys(y.rounds[r].picks);
		const pts = Object.fromEntries(ps.map((p) => [p, roundPoints(y.rounds[r], p)]));
		return { ps, pts, min: Math.min(...Object.values(pts)), max: Math.max(...Object.values(pts)) };
	};
	for (const p of people) {
		const seq = history.filter((y) => y.rounds[lastRound - 1] && y.rounds[lastRound - 1].picks[p]);
		const lastFlags = seq.map((y) => { const info = rankIn(y, lastRound - 1); return info.ps.length >= 5 && info.max > info.min && info.pts[p] === info.min; });
		const topFlags = seq.map((y) => { const info = rankIn(y, lastRound - 1); return info.ps.length >= 5 && info.max > info.min && info.pts[p] === info.max; });
		const consecutive = (flags) => {
			// consecutive in calendar terms: stop at gaps in years
			let n = 0;
			for (let i = flags.length - 1; i >= 0 && flags[i]; i--) {
				if (i < flags.length - 1 && !consecutiveSeasons(seq[i].year, seq[i + 1].year)) break;
				n++;
			}
			return n;
		};
		const lastRun = consecutive(lastFlags);
		const topRun = consecutive(topFlags);
		if (lastRun >= 2) add(8, `${p} had the lowest ${ROUND_NAMES[lastRound - 1]} score in the pool ${lastRun} years running (${seq.slice(-lastRun).map((y) => y.year).join(', ')}).`);
		if (topRun >= 2) add(8, `${p} had the highest ${ROUND_NAMES[lastRound - 1]} score in the pool ${topRun} years running (${seq.slice(-topRun).map((y) => y.year).join(', ')}).`);
	}

	// Series consensus
	for (const s of round.series) {
		const voters = people.filter((p) => round.picks[p][s.letter]);
		if (voters.length < 5 || !s.winner) continue;
		const right = voters.filter((p) => round.picks[p][s.letter].teamOk);
		if (right.length === 0) add(7, `Nobody (0 of ${voters.length}) picked ${s.winner} to win ${s.top} vs ${s.bottom}.`);
		else if (right.length === 1) add(7, `Only ${right[0]} (1 of ${voters.length}) picked ${s.winner} to win ${s.top} vs ${s.bottom}.`);
		else if (right.length === voters.length) add(3, `Everyone correctly picked ${s.winner} over ${s.winner === s.top ? s.bottom : s.top}.`);
		const exact = voters.filter((p) => round.picks[p][s.letter].teamOk && round.picks[p][s.letter].gamesOk);
		if (exact.length === 1 && right.length > 1) add(5, `Only ${exact[0]} nailed ${s.winner} in ${s.games} (team and games).`);
	}

	}
	if (!isOverall) {
	// Loyalty across rounds this year: same team picked and wrong in consecutive rounds
	for (const p of people) {
		const wrongByRound = [];
		for (let r = 0; r < lastRound; r++) {
			const wrongTeams = new Set(Object.values(cur.rounds[r].picks[p] ?? {}).filter((x) => !x.teamOk).map((x) => x.team));
			wrongByRound.push(wrongTeams);
		}
		for (const team of wrongByRound[lastRound - 1] ?? []) {
			let n = 0;
			for (let r = lastRound - 1; r >= 0 && wrongByRound[r].has(team); r--) n++;
			if (n >= 2) add(8, `${p} picked ${team} to win and was wrong about them in ${n} consecutive rounds this year.`);
		}
	}

	}
	// ---------- Across years ----------
	// Stanley Cup pick history (round 4, single series)
	const cupFlags = (person, upToYear) => history
		.filter((y) => y.year <= upToYear && y.rounds[3].picks[person] && Object.keys(y.rounds[3].picks[person]).length > 0)
		.map((y) => ({ year: y.year, pick: Object.values(y.rounds[3].picks[person])[0], cup: y.cup }));
	if (lastRound === 4) {
		for (const p of people) {
			const seq = cupFlags(p, year);
			const wrongRun = trailingRun(seq.map((x) => !x.pick.teamOk), seq.map((x) => x.year));
			const rightRun = trailingRun(seq.map((x) => x.pick.teamOk), seq.map((x) => x.year));
			if (wrongRun >= 2) add(9, `${p} has picked the wrong Stanley Cup winner ${wrongRun} years in a row (${seq.slice(-wrongRun).map((x) => `${x.year}: ${x.pick.team}`).join(', ')}).`);
			if (rightRun >= 2) add(9, `${p} has picked the correct Stanley Cup winner ${rightRun} years in a row (${seq.slice(-rightRun).map((x) => `${x.year}: ${x.pick.team}`).join(', ')}).`);
			const cupRight = seq.filter((x) => x.pick.teamOk).length;
			if (seq.length >= 8) add(4, `${p} has picked the Cup winner correctly ${cupRight} of ${seq.length} years.`);
			// same Cup pick in consecutive years
			const sameRun = (() => {
				let n = 1;
				for (let i = seq.length - 1; i > 0 && seq[i].pick.team === seq[i - 1].pick.team && consecutiveSeasons(seq[i - 1].year, seq[i].year); i--) n++;
				return n;
			})();
			if (sameRun >= 2) add(7, `${p} has picked ${seq[seq.length - 1].pick.team} for the Cup ${sameRun} years in a row.`);
		}
	}

	// Team loyalty across years for picks made this round
	const teamUsage = (person, team) => history
		.filter((y) => y.year <= year && y.rounds.some((rd) => Object.values(rd.picks[person] ?? {}).some((x) => x.team === team)))
		.map((y) => y.year);
	for (const p of isOverall ? [] : people) {
		const seen = new Set();
		for (const pick of Object.values(round.picks[p])) {
			if (seen.has(pick.team)) continue;
			seen.add(pick.team);
			const yrs = teamUsage(p, pick.team);
			let run = 1;
			for (let i = yrs.length - 1; i > 0 && consecutiveSeasons(yrs[i - 1], yrs[i]); i--) run++;
			if (run >= 3 && yrs[yrs.length - 1] === year) {
				let right = 0, wrong = 0;
				for (const y of history.filter((h) => yrs.slice(-run).includes(h.year))) {
					for (const rd of y.rounds) for (const x of Object.values(rd.picks[p] ?? {})) {
						if (x.team !== pick.team) continue;
						if (y.year === year && rd.number > lastRound) continue;
						x.teamOk ? right++ : wrong++;
					}
				}
				if (wrong >= 3 && wrong > right) add(8, `${p} has picked ${pick.team} to win a series ${run} years in a row and been wrong ${wrong} of ${right + wrong} times.`);
				else if (right >= 5 && wrong === 0) add(5, `${p} has picked ${pick.team} to win a series ${run} years in a row and been right every time (${right} for ${right}).`);
			}
		}
	}

	// Overall finish history (only meaningful once the year is complete)
	if (roundNum === 'overall') {
		const finish = (person) => history.filter((y) => y.points[person] > 0).map((y) => {
			const ranks = rankMap(Object.fromEntries(Object.entries(y.points).filter(([, v]) => v > 0)));
			return { year: y.year, rank: ranks[person], won: y.winners.includes(person), lost: y.losers.includes(person), n: Object.values(y.points).filter((v) => v > 0).length };
		});
		for (const p of Object.keys(cur.points).filter((q) => cur.points[q] > 0)) {
			const f = finish(p);
			const lastRun = trailingRun(f.map((x) => x.lost), f.map((x) => x.year));
			const winRun = trailingRun(f.map((x) => x.won), f.map((x) => x.year));
			const botRun = trailingRun(f.map((x) => x.rank > x.n - 3), f.map((x) => x.year));
			const topRun = trailingRun(f.map((x) => x.rank <= 3), f.map((x) => x.year));
			if (lastRun >= 2) add(10, `${p} has now finished dead last ${lastRun} years in a row.`);
			if (winRun >= 2) add(10, `${p} has now won the pool ${winRun} years in a row.`);
			if (botRun >= 3 && lastRun < 2) add(7, `${p} has finished in the bottom three ${botRun} years in a row.`);
			if (topRun >= 3) add(8, `${p} has finished in the top three ${topRun} years in a row.`);
			const wins = f.filter((x) => x.won);
			const thisWin = cur.winners.includes(p);
			if (thisWin) {
				const prevWins = wins.filter((x) => x.year < year);
				const gap = prevWins.length ? year - prevWins[prevWins.length - 1].year : null;
				add(10, prevWins.length === 0 ? `${p} won the pool for the first time ever (this was their ${ordinal(f.length)} year playing).` : `${p} won the pool for the ${ordinal(prevWins.length + 1)} time, ${gap === 1 ? 'back-to-back' : `${gap} years after their previous win in ${prevWins[prevWins.length - 1].year}`}.`);
			}
			if (cur.losers.includes(p)) {
				const lasts = f.filter((x) => x.lost);
				add(8, `${p} finished last for the ${ordinal(lasts.length)} time (previous last places: ${lasts.slice(0, -1).map((x) => x.year).join(', ') || 'none'}).`);
			}
			const prev = f[f.length - 2];
			const me = f[f.length - 1];
			if (prev && me && prev.year === year - 1 && Math.abs(prev.rank - me.rank) >= 8) add(6, `${p} went from ${ordinal(prev.rank)} place last year to ${ordinal(me.rank)} this year.`);
		}
		// Winning margin / ties
		const sorted = Object.entries(cur.points).sort((a, b) => b[1] - a[1]);
		if (sorted.length >= 2) {
			const margin = sorted[0][1] - sorted[1][1];
			if (margin === 0) add(9, `The pool ended in a tie at the top (${sorted.filter(([, v]) => v === sorted[0][1]).map(([p]) => p).join(', ')} with ${sorted[0][1]}); the tiebreaker winner was ${cur.winners.join(', ')}.`);
			else if (margin <= 2) add(8, `Razor-thin finish: the winner beat second place by only ${plural(margin, 'point')}.`);
			else if (margin >= 10) add(8, `Runaway: the winner finished ${margin} points clear of second place.`);
		}
		const pts = Object.values(cur.points).filter((v) => v > 0).sort((a, b) => a - b);
		if (pts.length) {
			const histBest = Math.max(...prior.flatMap((y) => Object.values(y.points)));
			if (prior.length >= 5 && sorted[0][1] > histBest) add(9, `The winning score of ${sorted[0][1]} is the highest ever recorded in the pool's history (previous best: ${histBest}).`);
			const winScores = prior.map((y) => Math.max(...Object.values(y.points)));
			if (winScores.length >= 5 && sorted[0][1] < Math.min(...winScores)) add(9, `The winning score of ${sorted[0][1]} is the lowest winning score in pool history.`);
		}
	}

	// Compare this round to the same round last year
	const prevYear = prior[prior.length - 1];
	if (!isOverall && prevYear && prevYear.year === year - 1 && prevYear.rounds[lastRound - 1]) {
		for (const p of people) {
			if (!prevYear.rounds[lastRound - 1].picks[p]) continue;
			const last = roundPoints(prevYear.rounds[lastRound - 1], p);
			if (lastRound <= 2 && rp[p] === 0 && last === 0) add(7, `${p} also scored 0 in this round last year.`);
		}
	}

	return out.sort((a, b) => b.priority - a.priority);
}

export function formatTrends(trends, limit = 14) {
	if (!trends.length) return 'NOTABLE TRENDS: none computed.';
	return 'NOTABLE TRENDS (verified by code, most interesting first):\n' + trends.slice(0, limit).map((t) => `- ${t.text}`).join('\n');
}
