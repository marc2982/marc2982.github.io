import { PEOPLE } from './constants.js';
import { fetchJson } from './httpUtils.js';

export async function roundAnalysis(container) {
	// Load yearly index to get list of years
	const yearlyIndex = await fetchJson('./data/summaries/yearly_index.json');
	const yearList = Object.keys(yearlyIndex).filter((y) => parseInt(y) > 0); // Filter out placeholder years

	// Initialize stats
	const stats = {};
	PEOPLE.forEach((person) => {
		stats[person] = {
			name: person,
			roundStats: {
				1: { correct: 0, total: 0 },
				2: { correct: 0, total: 0 },
				3: { correct: 0, total: 0 },
				4: { correct: 0, total: 0 },
			},
			sweepStats: { correct: 0, total: 0 },
			game7Stats: { correct: 0, total: 0 },
			bonusStats: {
				1: { earned: 0, possible: 0 },
				2: { earned: 0, possible: 0 },
				3: { earned: 0, possible: 0 },
				4: { earned: 0, possible: 0 },
			},
		};
	});

	// Load each year's full summary
	for (const year of yearList) {
		try {
			const summary = await fetchJson(`./data/summaries/${year}.json`);

			// Process each round
			summary.rounds?.forEach((round) => {
				const roundNum = round.number;

				// Process pick results for each person
				Object.entries(round.pickResults || {}).forEach(([person, seriesResults]) => {
					if (!stats[person]) return;

					// Process each series pick
					Object.values(seriesResults).forEach((result) => {
						if (!result.pick?.team) return;

						// Round Difficulty Stats
						stats[person].roundStats[roundNum].total++;
						if (result.teamStatus === 'CORRECT') {
							stats[person].roundStats[roundNum].correct++;
						}

						// Bonus Point Efficiency
						if (result.pick.games) {
							stats[person].bonusStats[roundNum].possible++;
							if (result.teamStatus === 'CORRECT' && result.gamesStatus === 'CORRECT') {
								stats[person].bonusStats[roundNum].earned++;
							}
						}

						// Sweep & Game 7 Stats
						// We need to know the actual result of the series to know if it was a sweep or game 7
					});

					// Re-iterate to find series data for Sweep/Game 7 stats
					// This is slightly inefficient but cleaner to read.
					// Ideally we'd map series letter to series data first.
					Object.entries(seriesResults).forEach(([seriesLetter, result]) => {
						if (!result.pick?.team) return;

						const seriesData = round.serieses.find((s) => s.letter === seriesLetter);
						if (!seriesData) return;

						// Check if the ACTUAL series was a sweep or game 7
						// "Sweep Prediction - Accuracy on 4-game series" -> When user picks 4 games.

						if (result.pick.games === 4) {
							stats[person].sweepStats.total++;
							// A "correct" sweep prediction means they got the winner AND the games right
							if (result.teamStatus === 'CORRECT' && result.gamesStatus === 'CORRECT') {
								stats[person].sweepStats.correct++;
							}
						}

						if (result.pick.games === 7) {
							stats[person].game7Stats.total++;
							if (result.teamStatus === 'CORRECT' && result.gamesStatus === 'CORRECT') {
								stats[person].game7Stats.correct++;
							}
						}
					});
				});
			});
		} catch (error) {
			console.warn(`Failed to load ${year}.json:`, error);
		}
	}

	// Filter to active participants
	const activeStats = Object.values(stats).filter(
		(s) => s.roundStats[1].total + s.roundStats[2].total + s.roundStats[3].total + s.roundStats[4].total > 0,
	);

	// Build tables
	buildRoundDifficultyTable(container, activeStats);
	buildBonusEfficiencyTable(container, activeStats);
	buildSweepPredictionTable(container, activeStats);
	buildGame7PredictionTable(container, activeStats);
}

function buildRoundDifficultyTable(container, stats) {
	const $section = $('<div class="section-card"><h2>Round Difficulty</h2></div>');
	const $explanation = $(
		'<p class="table-explanation">Shows prediction accuracy (correct team picked) broken down by round.</p>',
	);
	$section.append($explanation);

	const $table = $('<table class="stripe"></table>');
	const $thead = $(
		'<thead><tr><th>Person</th><th>R1 %</th><th>R2 %</th><th>R3 %</th><th>R4 %</th><th>Total %</th></tr></thead>',
	);
	$table.append($thead);

	const $tbody = $('<tbody></tbody>');
	stats.forEach((s) => {
		const r1 = getPercent(s.roundStats[1].correct, s.roundStats[1].total);
		const r2 = getPercent(s.roundStats[2].correct, s.roundStats[2].total);
		const r3 = getPercent(s.roundStats[3].correct, s.roundStats[3].total);
		const r4 = getPercent(s.roundStats[4].correct, s.roundStats[4].total);

		const totalCorrect =
			s.roundStats[1].correct + s.roundStats[2].correct + s.roundStats[3].correct + s.roundStats[4].correct;
		const totalPicks =
			s.roundStats[1].total + s.roundStats[2].total + s.roundStats[3].total + s.roundStats[4].total;
		const total = getPercent(totalCorrect, totalPicks);

		const $row = $('<tr></tr>');
		$row.append(`<td>${s.name}</td>`);
		$row.append(`<td>${r1}</td>`);
		$row.append(`<td>${r2}</td>`);
		$row.append(`<td>${r3}</td>`);
		$row.append(`<td>${r4}</td>`);
		$row.append(`<td>${total}</td>`);
		$tbody.append($row);
	});
	$table.append($tbody);
	$section.append($table);
	container.append($section);

	$table.DataTable({ info: false, paging: false, searching: false, order: [[5, 'desc']] });
}

function buildBonusEfficiencyTable(container, stats) {
	const $section = $('<div class="section-card"><h2>Bonus Point Efficiency</h2></div>');
	const $explanation = $(
		'<p class="table-explanation">Shows percentage of potential bonus points earned (correct team AND games) per round.</p>',
	);
	$section.append($explanation);

	const $table = $('<table class="stripe"></table>');
	const $thead = $(
		'<thead><tr><th>Person</th><th>R1 %</th><th>R2 %</th><th>R3 %</th><th>R4 %</th><th>Total %</th></tr></thead>',
	);
	$table.append($thead);

	const $tbody = $('<tbody></tbody>');
	stats.forEach((s) => {
		const r1 = getPercent(s.bonusStats[1].earned, s.bonusStats[1].possible);
		const r2 = getPercent(s.bonusStats[2].earned, s.bonusStats[2].possible);
		const r3 = getPercent(s.bonusStats[3].earned, s.bonusStats[3].possible);
		const r4 = getPercent(s.bonusStats[4].earned, s.bonusStats[4].possible);

		const totalEarned =
			s.bonusStats[1].earned + s.bonusStats[2].earned + s.bonusStats[3].earned + s.bonusStats[4].earned;
		const totalPossible =
			s.bonusStats[1].possible + s.bonusStats[2].possible + s.bonusStats[3].possible + s.bonusStats[4].possible;
		const total = getPercent(totalEarned, totalPossible);

		const $row = $('<tr></tr>');
		$row.append(`<td>${s.name}</td>`);
		$row.append(`<td>${r1}</td>`);
		$row.append(`<td>${r2}</td>`);
		$row.append(`<td>${r3}</td>`);
		$row.append(`<td>${r4}</td>`);
		$row.append(`<td>${total}</td>`);
		$tbody.append($row);
	});
	$table.append($tbody);
	$section.append($table);
	container.append($section);

	$table.DataTable({ info: false, paging: false, searching: false, order: [[5, 'desc']] });
}

function buildSweepPredictionTable(container, stats) {
	const $section = $('<div class="section-card"><h2>Sweep Predictions</h2></div>');
	const $explanation = $('<p class="table-explanation">Accuracy when predicting a 4-game sweep.</p>');
	$section.append($explanation);

	const $table = $('<table class="stripe"></table>');
	const $thead = $(
		'<thead><tr><th>Person</th><th>Predicted Sweeps</th><th>Correct</th><th>Accuracy</th></tr></thead>',
	);
	$table.append($thead);

	const $tbody = $('<tbody></tbody>');
	stats.forEach((s) => {
		const accuracy = getPercent(s.sweepStats.correct, s.sweepStats.total);
		const $row = $('<tr></tr>');
		$row.append(`<td>${s.name}</td>`);
		$row.append(`<td>${s.sweepStats.total}</td>`);
		$row.append(`<td>${s.sweepStats.correct}</td>`);
		$row.append(`<td>${accuracy}</td>`);
		$tbody.append($row);
	});
	$table.append($tbody);
	$section.append($table);
	container.append($section);

	$table.DataTable({ info: false, paging: false, searching: false, order: [[3, 'desc']] });
}

function buildGame7PredictionTable(container, stats) {
	const $section = $('<div class="section-card"><h2>Game 7 Predictions</h2></div>');
	const $explanation = $('<p class="table-explanation">Accuracy when predicting a 7-game series.</p>');
	$section.append($explanation);

	const $table = $('<table class="stripe"></table>');
	const $thead = $('<thead><tr><th>Person</th><th>Predicted G7s</th><th>Correct</th><th>Accuracy</th></tr></thead>');
	$table.append($thead);

	const $tbody = $('<tbody></tbody>');
	stats.forEach((s) => {
		const accuracy = getPercent(s.game7Stats.correct, s.game7Stats.total);
		const $row = $('<tr></tr>');
		$row.append(`<td>${s.name}</td>`);
		$row.append(`<td>${s.game7Stats.total}</td>`);
		$row.append(`<td>${s.game7Stats.correct}</td>`);
		$row.append(`<td>${accuracy}</td>`);
		$tbody.append($row);
	});
	$table.append($tbody);
	$section.append($table);
	container.append($section);

	$table.DataTable({ info: false, paging: false, searching: false, order: [[3, 'desc']] });
}

function getPercent(numerator, denominator) {
	if (denominator === 0) return '-';
	return ((numerator / denominator) * 100).toFixed(1) + '%';
}
