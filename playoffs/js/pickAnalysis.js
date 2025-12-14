import { PEOPLE, TEAMS } from './constants.js';
import { loadAllYearsDetailed } from './common.js';
import { createSection, createTable, initDataTable } from './tableUtils.js';

export async function pickAnalysis(container) {
	// Load all years data
	const { results, yearlyIndex } = await loadAllYearsDetailed();

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

					// Track team picks
					const team = result.pick.team;
					if (team) {
						stats[person].teamPicks[team] = (stats[person].teamPicks[team] || 0) + 1;

						// Track team prediction accuracy
						stats[person].teamsTotalPicks++;
						if (result.teamStatus === 'CORRECT') {
							stats[person].teamsCorrect++;
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

					// Find the series data to check seeding
					const seriesData = round.serieses.find((s) => s.letter === seriesLetter);
					if (seriesData) {
						const pickedUnderdog = result.pick.team === seriesData.bottomSeed;
						if (pickedUnderdog) {
							stats[person].upsetPicks++;
							if (result.teamStatus === 'CORRECT') {
								stats[person].upsetPicksCorrect++;
							}
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
	buildTeamLoyaltyTable(container, activeStats);
	buildPickAccuracyTable(container, activeStats);
	buildCupWinnerTable(container, activeStats);
	buildUpsetPicksTable(container, activeStats);
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
