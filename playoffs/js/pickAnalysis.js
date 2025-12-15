import { PEOPLE, TEAMS } from './constants.js';
import { loadAllYearsDetailed } from './common.js';
import { createSection, createTable, initDataTable } from './tableUtils.js';

export async function pickAnalysis(container) {
	// Load all years data
	const { results, yearlyIndex } = await loadAllYearsDetailed();

	container.empty();

	// Initialize stats
	const stats = {};
	PEOPLE.forEach((person) => {
		stats[person] = {
			name: person,
			teamPicks: {}, // { teamCode: count }
			bonusEarned: 0,
			bonusPossible: 0,
			gamesCorrect: 0,
			gamesTotalPicks: 0,
			teamsCorrect: 0,
			teamsTotalPicks: 0,
			cupWinnerCorrect: 0,
			cupWinnerPicks: 0,
			upsetPicks: 0,
			upsetPicksCorrect: 0,
			upsetPicksCorrect: 0,
			// New Stats
			totalGamesPredicted: 0,
			totalGamesActual: 0,
			gamesPredictionsCount: 0, // Denominator for avg
			sweepsPredicted: 0,
			game7sPredicted: 0,
			perfectPicks: 0,
			favoritesPicked: 0,
			underdogsPicked: 0,
			zeroPointPicks: 0, // The Mush
			totalPicks: 0,
			jinxStats: {}, // { teamCode: lossesWhenPicked }
		};
	});

	// Process each year's full summary
	results.forEach(({ year, summary }) => {
		// Process each round
		summary.rounds?.forEach((round) => {
			// Process pick results for each person
			Object.entries(round.pickResults || {}).forEach(([person, seriesResults]) => {
				if (!stats[person]) return;

				// Process each series pick
				Object.values(seriesResults).forEach((result) => {
					if (!result.pick) return;

					stats[person].totalPicks++;

					// The Mush: 0 points earned
					if (result.points === 0) {
						stats[person].zeroPointPicks++;
					}

					// Track team picks
					const team = result.pick.team;
					if (team) {
						stats[person].teamPicks[team] = (stats[person].teamPicks[team] || 0) + 1;

						// Track team prediction accuracy
						stats[person].teamsTotalPicks++;
						if (result.teamStatus === 'CORRECT') {
							stats[person].teamsCorrect++;
						} else {
							// The Jinx: Track losses
							stats[person].jinxStats[team] = (stats[person].jinxStats[team] || 0) + 1;
						}
					}

					// Track bonus points
					// earnedBonusPoints field is unreliable in data, so we check if both team and games are correct
					// Standard scoring: Team (1) + Games (2) + Bonus (3) = 6 points
					if (result.teamStatus === 'CORRECT' && result.gamesStatus === 'CORRECT') {
						stats[person].bonusEarned++;
					}

					// Bonus is possible for any series where a pick was made
					if (result.pick.team && result.pick.games) {
						stats[person].bonusPossible++;
					}

					// Track games prediction accuracy
					if (result.pick.games) {
						stats[person].gamesTotalPicks++;
						if (result.gamesStatus === 'CORRECT') {
							stats[person].gamesCorrect++;
						}
					}
				});

				// Track upset picks (picking the underdog/bottomSeed)
				Object.entries(seriesResults).forEach(([seriesLetter, result]) => {
					if (!result.pick?.team) return;

					// Find the series data to check seeding and actual games
					const seriesData = round.serieses.find((s) => s.letter === seriesLetter);
					if (seriesData) {
						// Upset / Seed Bias Stats
						if (result.pick.team === seriesData.bottomSeed) {
							stats[person].underdogsPicked++;
							stats[person].upsetPicks++;
							if (result.teamStatus === 'CORRECT') {
								stats[person].upsetPicksCorrect++;
							}
						} else if (result.pick.team === seriesData.topSeed) {
							stats[person].favoritesPicked++;
						}

						// The Estimator: Actual Games Count
						const actualGames = seriesData.topSeedWins + seriesData.bottomSeedWins;
						if (actualGames > 0 && result.pick.games) {
							stats[person].totalGamesActual += actualGames;
						}
					}

					// Prediction Style & Perfect Series Stats
					if (result.pick.games) {
						stats[person].totalGamesPredicted += result.pick.games;
						stats[person].gamesPredictionsCount++;

						if (result.pick.games === 4) stats[person].sweepsPredicted++;
						if (result.pick.games === 7) stats[person].game7sPredicted++;

						// Perfect Pick: Team Correct AND Games Correct
						if (result.teamStatus === 'CORRECT' && result.gamesStatus === 'CORRECT') {
							stats[person].perfectPicks++;
						}
					}
				});
			});
		});

		// Track Cup Winner picks (Round 4, Series O)
		const finalRound = summary.rounds?.find((r) => r.number === 4);
		if (finalRound) {
			const cupWinner = yearlyIndex[year]?.cupWinner;

			Object.entries(finalRound.pickResults || {}).forEach(([person, seriesResults]) => {
				if (!stats[person]) return;

				const scfPick = seriesResults['O'];
				if (scfPick?.pick?.team) {
					stats[person].cupWinnerPicks++;
					if (scfPick.pick.team === cupWinner) {
						stats[person].cupWinnerCorrect++;
					}
				}
			});
		}
	});

	// Filter to active participants
	const activeStats = Object.values(stats).filter((s) => s.gamesTotalPicks > 0);

	// Build tables
	buildMushTable(container, activeStats);
	buildJinxTable(container, activeStats);
	buildEstimatorTable(container, activeStats);

	buildTeamLoyaltyTable(container, activeStats);
	buildPredictionStyleTable(container, activeStats);
	buildPickAccuracyTable(container, activeStats);
	buildPerfectPicksTable(container, activeStats);
	buildSeedBiasTable(container, activeStats);
	buildCupWinnerTable(container, activeStats);
	buildUpsetPicksTable(container, activeStats);
}

function buildMushTable(container, stats) {
	const $section = createSection(
		container,
		'The Mush (Airball Index)',
		'<strong>0-Point Picks:</strong> Times you got 0 points (Wrong Team + Wrong Series Length).',
	);

	const { $table, $tbody } = createTable(['Person', '0-Point Picks', 'Total Picks', 'Failure Rate']);
	$section.append($table);

	stats.forEach((s) => {
		const rate = s.totalPicks > 0 ? ((s.zeroPointPicks / s.totalPicks) * 100).toFixed(1) + '%' : '-';

		const $row = $('<tr></tr>');
		$row.append(`<td>${s.name}</td>`);
		$row.append(`<td>${s.zeroPointPicks}</td>`);
		$row.append(`<td>${s.totalPicks}</td>`);
		$row.append(`<td>${rate}</td>`);
		$tbody.append($row);
	});

	initDataTable($table, { order: [[3, 'desc']] });
}

function buildJinxTable(container, stats) {
	const $section = createSection(
		container,
		'The Jinx (Kiss of Death)',
		'The team that loses the most often when YOU pick them.',
	);

	const { $table, $tbody } = createTable(['Person', 'Jinxed Team', 'Losses When Picked']);
	$section.append($table);

	stats.forEach((s) => {
		// Find most jinxed team
		let maxTeam = null;
		let maxLosses = 0;
		Object.entries(s.jinxStats).forEach(([team, losses]) => {
			if (losses > maxLosses) {
				maxLosses = losses;
				maxTeam = team;
			}
		});

		const $row = $('<tr></tr>');
		$row.append(`<td>${s.name}</td>`);
		$row.append(`<td>${TEAMS[maxTeam] || maxTeam || '-'}</td>`);
		$row.append(`<td>${maxLosses || '-'}</td>`);
		$tbody.append($row);
	});

	initDataTable($table, { order: [[2, 'desc']] });
}

function buildEstimatorTable(container, stats) {
	const $section = createSection(
		container,
		'The Over/Under Estimator',
		'Comp. your <strong>Predicted Avg Games</strong> vs the <strong>Actual Avg Games</strong> of those series. ' +
			'Positive (+) means you expect series to go longer than they actually do.',
	);

	const { $table, $tbody } = createTable(['Person', 'Pred. Avg', 'Actual Avg', 'Diff']);
	$section.append($table);

	stats.forEach((s) => {
		const predAvg = s.gamesPredictionsCount > 0 ? (s.totalGamesPredicted / s.gamesPredictionsCount).toFixed(2) : 0;
		const actualAvg = s.gamesPredictionsCount > 0 ? (s.totalGamesActual / s.gamesPredictionsCount).toFixed(2) : 0;
		const diff = (predAvg - actualAvg).toFixed(2);

		const displayDiff = diff > 0 ? `+${diff}` : diff;
		const color = diff > 0 ? 'red' : diff < 0 ? 'blue' : 'black';

		if (s.gamesPredictionsCount === 0) return;

		const $row = $('<tr></tr>');
		$row.append(`<td>${s.name}</td>`);
		$row.append(`<td>${predAvg}</td>`);
		$row.append(`<td>${actualAvg}</td>`);
		$row.append(`<td style="color: ${color}; font-weight: bold;">${displayDiff}</td>`);
		$tbody.append($row);
	});

	initDataTable($table, { order: [[3, 'desc']] });
}

function buildPredictionStyleTable(container, stats) {
	const $section = createSection(
		container,
		'Prediction Style',
		'<strong>Optimist vs Pessimist:</strong> Breakdown of game predictions. ' +
			'<strong>Avg Games:</strong> Average length of series predicted. ' +
			'<strong>Sweeps:</strong> 4-game predictions. <strong>Game 7s:</strong> 7-game predictions.',
	);

	const { $table, $tbody } = createTable(['Person', 'Avg Games', 'Sweeps', 'Game 7s']);
	$section.append($table);

	stats.forEach((s) => {
		const avgGames =
			s.gamesPredictionsCount > 0 ? (s.totalGamesPredicted / s.gamesPredictionsCount).toFixed(2) : '-';

		const $row = $('<tr></tr>');
		$row.append(`<td>${s.name}</td>`);
		$row.append(`<td>${avgGames}</td>`);
		$row.append(`<td>${s.sweepsPredicted}</td>`);
		$row.append(`<td>${s.game7sPredicted}</td>`);
		$tbody.append($row);
	});

	initDataTable($table, { order: [[1, 'asc']] }); // Sort by shortest series (Optimists?)
}

function buildPerfectPicksTable(container, stats) {
	const $section = createSection(
		container,
		'The Perfect Series (The Oracle)',
		'Total "Perfect Picks": Correctly predicting both the winning team AND the exact number of games.',
	);

	const { $table, $tbody } = createTable(['Person', 'Perfect Picks', 'Total Picks', 'Rate']);
	$section.append($table);

	stats.forEach((s) => {
		const rate =
			s.gamesPredictionsCount > 0 ? ((s.perfectPicks / s.gamesPredictionsCount) * 100).toFixed(1) + '%' : '-';

		const $row = $('<tr></tr>');
		$row.append(`<td>${s.name}</td>`);
		$row.append(`<td>${s.perfectPicks}</td>`);
		$row.append(`<td>${s.gamesPredictionsCount}</td>`);
		$row.append(`<td>${rate}</td>`);
		$tbody.append($row);
	});

	initDataTable($table, { order: [[1, 'desc']] });
}

function buildSeedBiasTable(container, stats) {
	const $section = createSection(
		container,
		'Seed Bias',
		'Tendency to pick Favorites (Higher Seed) vs Underdogs (Lower Seed).',
	);

	const { $table, $tbody } = createTable(['Person', 'Favorites Picked', 'Underdogs Picked', 'Underdog %']);
	$section.append($table);

	stats.forEach((s) => {
		const total = s.favoritesPicked + s.underdogsPicked;
		const underdogRate = total > 0 ? ((s.underdogsPicked / total) * 100).toFixed(1) + '%' : '-';

		const $row = $('<tr></tr>');
		$row.append(`<td>${s.name}</td>`);
		$row.append(`<td>${s.favoritesPicked}</td>`);
		$row.append(`<td>${s.underdogsPicked}</td>`);
		$row.append(`<td>${underdogRate}</td>`);
		$tbody.append($row);
	});

	initDataTable($table, { order: [[3, 'desc']] });
}

function buildTeamLoyaltyTable(container, stats) {
	const $section = createSection(
		container,
		'Team Loyalty',
		"Shows each person's most frequently picked team across all years.",
	);

	const { $table, $tbody } = createTable(['Person', 'Favorite Team', 'Times Picked']);
	$section.append($table);

	stats.forEach((s) => {
		// Find most picked team
		let maxTeam = null;
		let maxCount = 0;
		Object.entries(s.teamPicks).forEach(([team, count]) => {
			if (count > maxCount) {
				maxCount = count;
				maxTeam = team;
			}
		});

		const $row = $('<tr></tr>');
		$row.append(`<td>${s.name}</td>`);
		$row.append(`<td>${TEAMS[maxTeam] || maxTeam || '-'}</td>`);
		$row.append(`<td>${maxCount || '-'}</td>`);
		$tbody.append($row);
	});

	// Initialize DataTable
	initDataTable($table, { order: [[2, 'desc']] });
}

function buildPickAccuracyTable(container, stats) {
	const $section = createSection(
		container,
		'Pick Accuracy',
		'Shows prediction accuracy for team winners, series length, and bonus points earned.',
	);

	const { $table, $tbody } = createTable([
		'Person',
		'Total Series Picked',
		'Team %',
		'Games %',
		'Times Bonus Earned',
	]);
	$section.append($table);

	stats.forEach((s) => {
		const teamsPercent =
			s.teamsTotalPicks > 0 ? ((s.teamsCorrect / s.teamsTotalPicks) * 100).toFixed(1) + '%' : '-';

		const gamesPercent =
			s.gamesTotalPicks > 0 ? ((s.gamesCorrect / s.gamesTotalPicks) * 100).toFixed(1) + '%' : '-';

		const bonusPercent = s.bonusPossible > 0 ? ((s.bonusEarned / s.bonusPossible) * 100).toFixed(1) + '%' : '-';

		const $row = $('<tr></tr>');
		$row.append(`<td>${s.name}</td>`);
		$row.append(`<td>${s.teamsTotalPicks}</td>`);
		$row.append(`<td>${teamsPercent}</td>`);
		$row.append(`<td>${gamesPercent}</td>`);
		$row.append(`<td>${bonusPercent}</td>`);
		$tbody.append($row);
	});

	// Initialize DataTable
	initDataTable($table, { order: [[1, 'desc']] });
}

function buildCupWinnerTable(container, stats) {
	const $section = createSection(
		container,
		'Cup Winner Predictions',
		'Shows how often each person correctly predicted the Stanley Cup winner.',
	);

	const { $table, $tbody } = createTable(['Person', 'Correct Picks', 'Total Picks', 'Success Rate']);
	$section.append($table);

	stats.forEach((s) => {
		const cupPercent =
			s.cupWinnerPicks > 0 ? ((s.cupWinnerCorrect / s.cupWinnerPicks) * 100).toFixed(1) + '%' : '-';

		const $row = $('<tr></tr>');
		$row.append(`<td>${s.name}</td>`);
		$row.append(`<td>${s.cupWinnerCorrect}</td>`);
		$row.append(`<td>${s.cupWinnerPicks}</td>`);
		$row.append(`<td>${cupPercent}</td>`);
		$tbody.append($row);
	});

	// Initialize DataTable
	initDataTable($table, { order: [[3, 'desc']] });
}

function buildUpsetPicksTable(container, stats) {
	const $section = createSection(
		container,
		'Upset Picks',
		'Shows who picks the most underdogs (lower seeds) and their success rate.',
	);

	const { $table, $tbody } = createTable(['Person', 'Upset Picks', 'Correct Upsets', 'Success Rate']);
	$section.append($table);

	stats.forEach((s) => {
		const upsetPercent = s.upsetPicks > 0 ? ((s.upsetPicksCorrect / s.upsetPicks) * 100).toFixed(1) + '%' : '-';
		const $row = $('<tr></tr>');
		$row.append(`<td>${s.name}</td>`);
		$row.append(`<td>${s.upsetPicks}</td>`);
		$row.append(`<td>${s.upsetPicksCorrect}</td>`);
		$row.append(`<td>${upsetPercent}</td>`);
		$tbody.append($row);
	});

	// Initialize DataTable
	initDataTable($table, { order: [[1, 'desc']] });
}
