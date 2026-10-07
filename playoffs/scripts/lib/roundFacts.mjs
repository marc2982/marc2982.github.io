/**
 * Builds a fully pre-scored fact sheet for one round, so the LLM never has to
 * score raw CSV picks itself (it used to, and invented numbers).
 */

function seriesLine(series) {
	const winner = series.getWinner?.();
	const winTeam = winner?.team;
	const games = series.topSeedWins + series.bottomSeedWins;
	return `Series ${series.letter}: ${series.topSeed} vs ${series.bottomSeed} - ${winTeam} won in ${games} games`;
}

function describePick(result, series) {
	if (!result || !result.pick) return 'no pick';
	const { team, games } = result.pick;
	const word = (status) => (status === 'CORRECT' ? 'right' : 'wrong');
	const verdict = `team ${word(result.teamStatus)}, games ${word(result.gamesStatus)}`;
	return `${series.letter}: ${team} in ${games} (${verdict}, ${result.points} pts)`;
}

/**
 * @param {object[]} rounds  year rounds from buildYearData (with pickResults, summary)
 * @param {number} roundNum  1-based
 * @returns {string}
 */
export function buildRoundFacts(rounds, roundNum) {
	const round = rounds[roundNum - 1];
	const letters = round.serieses.map((s) => s.letter);

	const roundPoints = Object.fromEntries(
		Object.entries(round.pickResults).map(([person, results]) => [
			person,
			Object.values(results).reduce((sum, r) => sum + (r?.points ?? 0), 0),
		]),
	);

	// Cumulative totals through this round
	const totals = {};
	for (let i = 0; i < roundNum; i++) {
		for (const [person, results] of Object.entries(rounds[i].pickResults)) {
			totals[person] = (totals[person] ?? 0) + Object.values(results).reduce((s, r) => s + (r?.points ?? 0), 0);
		}
	}

	const people = Object.keys(roundPoints).sort((a, b) => roundPoints[b] - roundPoints[a] || a.localeCompare(b));

	const lines = [];
	lines.push('SERIES RESULTS:');
	round.serieses.forEach((s) => lines.push(seriesLine(s)));

	lines.push('', `PER-PERSON RESULTS FOR ROUND ${roundNum} (already scored, sorted by round points):`);
	for (const person of people) {
		const results = round.pickResults[person];
		const picked = letters.filter((l) => results[l]?.pick);
		const missing = letters.filter((l) => !results[l]?.pick);
		const detail = picked.map((l) => describePick(results[l], round.serieses.find((s) => s.letter === l)));
		let line = `- ${person}: ${roundPoints[person]} round pts, ${totals[person]} total pts. ${detail.join('; ')}`;
		if (missing.length) line += `. NO PICK for series ${missing.join(', ')}`;
		lines.push(line);
	}

	const max = Math.max(...Object.values(roundPoints));
	const min = Math.min(...Object.values(roundPoints));
	lines.push(
		'',
		`Round high: ${max} pts (${people.filter((p) => roundPoints[p] === max).join(', ')}). ` +
			`Round low: ${min} pts (${people.filter((p) => roundPoints[p] === min).join(', ')}).`,
	);

	// Consensus per series
	lines.push('', 'PICK SPLITS (how many people picked each team):');
	for (const s of round.serieses) {
		const counts = {};
		for (const person of people) {
			const t = round.pickResults[person][s.letter]?.pick?.team;
			if (t) counts[t] = (counts[t] ?? 0) + 1;
		}
		lines.push(`Series ${s.letter}: ${Object.entries(counts).map(([t, n]) => `${t} x${n}`).join(', ') || 'none'}`);
	}
	return lines.join('\n');
}
