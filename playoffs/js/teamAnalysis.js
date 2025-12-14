import { TEAMS } from './constants.js';
import { loadAllYearsDetailed } from './common.js';
import { createSection, createTable, initDataTable } from './tableUtils.js';

export async function teamAnalysis(container) {
	// Load all years data
	const { results } = await loadAllYearsDetailed();

	// Initialize team stats
	const teamStats = {};
	Object.keys(TEAMS).forEach((teamCode) => {
		teamStats[teamCode] = {
			code: teamCode,
			name: TEAMS[teamCode],
			timesPicked: 0,
			timesWon: 0,
			timesLost: 0,
			totalPoints: 0, // Points earned when picked
			conference: getConference(teamCode),
		};
	});

	// Conference tracking
	const conferenceStats = {
		Eastern: { picked: 0, correct: 0 },
		Western: { picked: 0, correct: 0 },
	};

	// Process each year's full summary
	results.forEach(({ summary }) => {
		// Process each round
		summary.rounds?.forEach((round) => {
			// Process each series
			round.serieses?.forEach((series) => {
				const winner = series.winner;

				// Process pick results for each person
				Object.entries(round.pickResults || {}).forEach(([person, seriesResults]) => {
					const result = seriesResults[series.letter];
					if (!result?.pick?.team) return;

					const pickedTeam = result.pick.team;
					if (!teamStats[pickedTeam]) return;

					// Track picks
					teamStats[pickedTeam].timesPicked++;

					// Track conference
					const conf = teamStats[pickedTeam].conference;
					if (conf) {
						conferenceStats[conf].picked++;
						if (result.teamStatus === 'CORRECT') {
							conferenceStats[conf].correct++;
						}
					}

					// Track wins/losses
					if (result.teamStatus === 'CORRECT') {
						teamStats[pickedTeam].timesWon++;
						// Award points: 1 for team + 2 for games (if correct) + 3 for bonus (if both correct)
						let points = 1;
						if (result.gamesStatus === 'CORRECT') {
							points += 2 + 3; // games + bonus
						}
						teamStats[pickedTeam].totalPoints += points;
					} else if (result.teamStatus === 'INCORRECT') {
						teamStats[pickedTeam].timesLost++;
					}
				});
			});
		});
	});

	// Calculate derived stats
	const teamStatsArray = Object.values(teamStats).filter((t) => t.timesPicked > 0);
	teamStatsArray.forEach((team) => {
		team.winRate = team.timesPicked > 0 ? (team.timesWon / team.timesPicked) * 100 : 0;
		team.avgPoints = team.timesPicked > 0 ? team.totalPoints / team.timesPicked : 0;
	});

	// Build tables
	buildMostPickedTable(container, teamStatsArray);
	buildMostSuccessfulTable(container, teamStatsArray);
	buildBiggestBustsTable(container, teamStatsArray);
	buildConferenceSuccessTable(container, conferenceStats);
}

function buildMostPickedTable(container, stats) {
	const $section = createSection(
		container,
		'Most Picked Teams',
		'Teams that pool participants pick most frequently across all years and rounds.',
	);

	const { $table, $tbody } = createTable(['Rank', 'Team', 'Times Picked', 'Win Rate']);
	$section.append($table);

	// Body - Sort by times picked
	const sorted = [...stats].sort((a, b) => b.timesPicked - a.timesPicked).slice(0, 15);
	sorted.forEach((team, index) => {
		const $row = $('<tr></tr>');
		$row.append(`<td>${index + 1}</td>`);
		$row.append(`<td>${team.name}</td>`);
		$row.append(`<td>${team.timesPicked}</td>`);
		$row.append(`<td>${team.winRate.toFixed(1)}%</td>`);
		$tbody.append($row);
	});

	// Initialize DataTable
	initDataTable($table, { order: [[2, 'desc']] });
}

function buildMostSuccessfulTable(container, stats) {
	const $section = createSection(
		container,
		'Most Successful Picks',
		'Teams with the highest win rate when picked (minimum 5 picks to qualify).',
	);

	const { $table, $tbody } = createTable(['Rank', 'Team', 'Win Rate', 'Record', 'Avg Points']);
	$section.append($table);

	// Body - Sort by win rate (min 5 picks)
	const sorted = [...stats]
		.filter((t) => t.timesPicked >= 5)
		.sort((a, b) => b.winRate - a.winRate)
		.slice(0, 15);
	sorted.forEach((team, index) => {
		const $row = $('<tr></tr>');
		$row.append(`<td>${index + 1}</td>`);
		$row.append(`<td>${team.name}</td>`);
		$row.append(`<td style="font-weight: bold; color: green;">${team.winRate.toFixed(1)}%</td>`);
		$row.append(`<td>${team.timesWon}-${team.timesLost}</td>`);
		$row.append(`<td>${team.avgPoints.toFixed(1)}</td>`);
		$tbody.append($row);
	});

	// Initialize DataTable
	initDataTable($table, { order: [[2, 'desc']] });
}

function buildBiggestBustsTable(container, stats) {
	const $section = createSection(
		container,
		'Biggest Busts',
		'Teams with the lowest win rate when picked (minimum 5 picks to qualify).',
	);

	const { $table, $tbody } = createTable(['Rank', 'Team', 'Win Rate', 'Record', 'Times Picked']);
	$section.append($table);

	// Body - Sort by win rate ascending (min 5 picks)
	const sorted = [...stats]
		.filter((t) => t.timesPicked >= 5)
		.sort((a, b) => a.winRate - b.winRate)
		.slice(0, 15);
	sorted.forEach((team, index) => {
		const $row = $('<tr></tr>');
		$row.append(`<td>${index + 1}</td>`);
		$row.append(`<td>${team.name}</td>`);
		$row.append(`<td style="font-weight: bold; color: red;">${team.winRate.toFixed(1)}%</td>`);
		$row.append(`<td>${team.timesWon}-${team.timesLost}</td>`);
		$row.append(`<td>${team.timesPicked}</td>`);
		$tbody.append($row);
	});

	// Initialize DataTable
	initDataTable($table, { order: [[2, 'asc']] });
}

function buildConferenceSuccessTable(container, conferenceStats) {
	const $section = createSection(
		container,
		'Conference Success Rates',
		'Comparison of picking accuracy between Eastern and Western Conference teams.',
	);

	const { $table, $tbody } = createTable(['Conference', 'Times Picked', 'Correct Picks', 'Success Rate']);
	$section.append($table);

	['Eastern', 'Western'].forEach((conf) => {
		const stats = conferenceStats[conf];
		const successRate = stats.picked > 0 ? ((stats.correct / stats.picked) * 100).toFixed(1) : '0.0';
		const $row = $('<tr></tr>');
		$row.append(`<td>${conf}</td>`);
		$row.append(`<td>${stats.picked}</td>`);
		$row.append(`<td>${stats.correct}</td>`);
		$row.append(`<td style="font-weight: bold;">${successRate}%</td>`);
		$tbody.append($row);
	});

	// Initialize DataTable
	initDataTable($table, { order: [[3, 'desc']] });
}

// Helper function to determine conference
function getConference(teamCode) {
	// Eastern Conference teams
	const eastern = [
		'BOS',
		'BUF',
		'DET',
		'FLA',
		'MTL',
		'OTT',
		'TBL',
		'TOR',
		'CAR',
		'CBJ',
		'NJD',
		'NYI',
		'NYR',
		'PHI',
		'PIT',
		'WSH',
	];

	// Western Conference teams
	const western = [
		'ARI',
		'PHX',
		'CHI',
		'COL',
		'DAL',
		'MIN',
		'NSH',
		'STL',
		'WPG',
		'ANA',
		'CGY',
		'EDM',
		'LAK',
		'SJS',
		'VAN',
		'VGK',
		'SEA',
	];

	if (eastern.includes(teamCode)) return 'Eastern';
	if (western.includes(teamCode)) return 'Western';
	return null;
}
