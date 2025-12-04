import { PEOPLE, TEAMS } from './constants.js';
import { fetchJson } from './httpUtils.js';

export async function pickAnalysis(container) {
	// Load yearly index to get list of years
	const yearlyIndex = await fetchJson('./data/summaries/yearly_index.json');
	const yearList = Object.keys(yearlyIndex).filter((y) => parseInt(y) > 0); // Filter out placeholder years

	// Initialize stats
	const stats = {};
	PEOPLE.forEach((person) => {
		stats[person] = {
			name: person,
			teamPicks: {}, // { teamCode: count }
			totalBonusPoints: 0,
			gamesCorrect: 0,
			gamesTotalPicks: 0,
			teamsCorrect: 0,
			teamsTotalPicks: 0,
			cupWinnerCorrect: 0,
			cupWinnerPicks: 0,
		};
	});

	// Load each year's full summary
	for (const year of yearList) {
		try {
			const summary = await fetchJson(`./data/summaries/${year}.json`);

			// Process each round
			summary.rounds?.forEach((round) => {
				// Get bonus points from round summaries
				Object.entries(round.summary?.summaries || {}).forEach(([person, personSummary]) => {
					if (!stats[person]) return;

					// Add bonus points earned this round
					if (personSummary.bonusEarned) {
						const bonusValue = round.scoring?.bonus || 3; // Default to 3 if not specified
						stats[person].totalBonusPoints += personSummary.bonusEarned * bonusValue;
					}
				});

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

						// Track games prediction accuracy
						if (result.pick.games) {
							stats[person].gamesTotalPicks++;
							if (result.gamesStatus === 'CORRECT') {
								stats[person].gamesCorrect++;
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
		} catch (error) {
			console.warn(`Failed to load ${year}.json:`, error);
		}
	}

	// Filter to active participants
	const activeStats = Object.values(stats).filter((s) => s.gamesTotalPicks > 0);

	// Build tables
	buildTeamLoyaltyTable(container, activeStats);
	buildPickAccuracyTable(container, activeStats);
}

function buildTeamLoyaltyTable(container, stats) {
	const $section = $('<div class="section-card"><h2>Team Loyalty</h2></div>');

	const $explanation = $(
		'<p style="color: #6c757d; font-size: 14px; margin-bottom: 15px;">' +
			"Shows each person's most frequently picked team across all years." +
			'</p>',
	);
	$section.append($explanation);

	const $table = $('<table class="stripe"></table>');

	// Header
	const $thead = $('<thead></thead>');
	const $headerRow = $('<tr></tr>');
	$headerRow.append('<th>Person</th>');
	$headerRow.append('<th>Favorite Team</th>');
	$headerRow.append('<th>Times Picked</th>');
	$thead.append($headerRow);
	$table.append($thead);

	// Body
	const $tbody = $('<tbody></tbody>');
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
	$table.append($tbody);

	$section.append($table);
	container.append($section);

	// Initialize DataTable
	$table.DataTable({
		info: false,
		paging: false,
		searching: false,
		order: [[2, 'desc']],
	});
}

function buildPickAccuracyTable(container, stats) {
	const $section = $('<div class="section-card"><h2>Pick Accuracy</h2></div>');

	const $table = $('<table class="stripe"></table>');

	// Header
	const $thead = $('<thead></thead>');
	const $headerRow = $('<tr></tr>');
	$headerRow.append('<th>Person</th>');
	$headerRow.append('<th>Team Predictions</th>');
	$headerRow.append('<th>Team %</th>');
	$headerRow.append('<th>Games Predictions</th>');
	$headerRow.append('<th>Games %</th>');
	$headerRow.append('<th>Cup Winner Picks</th>');
	$headerRow.append('<th>Cup Winner %</th>');
	$thead.append($headerRow);
	$table.append($thead);

	// Body
	const $tbody = $('<tbody></tbody>');
	stats.forEach((s) => {
		const teamsText = s.teamsTotalPicks > 0 ? `${s.teamsCorrect}/${s.teamsTotalPicks}` : '-';
		const teamsPercent =
			s.teamsTotalPicks > 0 ? ((s.teamsCorrect / s.teamsTotalPicks) * 100).toFixed(1) + '%' : '-';

		const gamesText = s.gamesTotalPicks > 0 ? `${s.gamesCorrect}/${s.gamesTotalPicks}` : '-';
		const gamesPercent =
			s.gamesTotalPicks > 0 ? ((s.gamesCorrect / s.gamesTotalPicks) * 100).toFixed(1) + '%' : '-';

		const cupWinnerText = s.cupWinnerPicks > 0 ? `${s.cupWinnerCorrect}/${s.cupWinnerPicks}` : '-';
		const cupWinnerPercent =
			s.cupWinnerPicks > 0 ? ((s.cupWinnerCorrect / s.cupWinnerPicks) * 100).toFixed(1) + '%' : '-';

		const $row = $('<tr></tr>');
		$row.append(`<td>${s.name}</td>`);
		$row.append(`<td>${teamsText}</td>`);
		$row.append(`<td>${teamsPercent}</td>`);
		$row.append(`<td>${gamesText}</td>`);
		$row.append(`<td>${gamesPercent}</td>`);
		$row.append(`<td>${cupWinnerText}</td>`);
		$row.append(`<td>${cupWinnerPercent}</td>`);
		$tbody.append($row);
	});
	$table.append($tbody);

	$section.append($table);
	container.append($section);

	// Initialize DataTable
	$table.DataTable({
		info: false,
		paging: false,
		searching: false,
		order: [[1, 'desc']],
	});
}
