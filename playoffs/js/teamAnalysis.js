import { escapeHtml as esc } from './html.js';
import { TEAMS } from './constants.js';
import { loadAllYearsDetailed } from './common.js';
import { createSection, createTable, initDataTable } from './tableUtils.js';

/**
 * Pure aggregation of team pick stats across loaded years.
 * @param {{summary: object}[]} results
 * @returns {{teamStatsArray: object[], conferenceStats: object}}
 */
export function aggregateTeamStats(results) {
	const teamStats = {};
	const conferenceStats = {
		Eastern: { picked: 0, correct: 0 },
		Western: { picked: 0, correct: 0 },
	};

	results.forEach(({ year, summary }) => {
		summary.rounds?.forEach((round) => {
			Object.values(round.pickResults || {}).forEach((seriesResults) => {
				Object.values(seriesResults).forEach((result) => {
					const pickedTeam = result?.pick?.team;
					if (!pickedTeam) return;

					if (!teamStats[pickedTeam]) {
						teamStats[pickedTeam] = {
							code: pickedTeam,
							name: summary.teams?.[pickedTeam]?.name || TEAMS[pickedTeam] || pickedTeam,
							timesPicked: 0,
							timesWon: 0,
							timesLost: 0,
							totalPoints: 0,
							conference: getConference(pickedTeam, year),
						};
					}
					const t = teamStats[pickedTeam];
					// Conference is per pick: DET/CBJ moved West->East in 2014, so a team-level value would be wrong for old years
					t.conference = getConference(pickedTeam, year);
					t.timesPicked++;
					t.totalPoints += result.points || 0;

					const conf = t.conference;
					if (conf) {
						conferenceStats[conf].picked++;
						if (result.teamStatus === 'CORRECT') conferenceStats[conf].correct++;
					}

					if (result.teamStatus === 'CORRECT') t.timesWon++;
					else if (result.teamStatus === 'INCORRECT') t.timesLost++;
				});
			});
		});
	});

	const teamStatsArray = Object.values(teamStats);
	teamStatsArray.forEach((team) => {
		team.winRate = (team.timesWon / team.timesPicked) * 100;
		team.avgPoints = team.totalPoints / team.timesPicked;
	});
	return { teamStatsArray, conferenceStats };
}

export async function teamAnalysis(container) {
	const { results } = await loadAllYearsDetailed();
	container.empty();

	const { teamStatsArray, conferenceStats } = aggregateTeamStats(results);

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
		$row.append(`<td>${esc(team.name)}</td>`);
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
		$row.append(`<td>${esc(team.name)}</td>`);
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
		$row.append(`<td>${esc(team.name)}</td>`);
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
export function getConference(teamCode, year) {
	// Detroit and Columbus played in the Western Conference until the 2013-14 realignment (2014 playoffs)
	if ((teamCode === 'DET' || teamCode === 'CBJ') && Number(year) <= 2013) return 'Western';
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
		'ATL', // Atlanta Thrashers (became Winnipeg)
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
		'UTA',
	];

	if (eastern.includes(teamCode)) return 'Eastern';
	if (western.includes(teamCode)) return 'Western';
	return null;
}
