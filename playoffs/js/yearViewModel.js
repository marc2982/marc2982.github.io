import { ScenarioAnalyzer } from './scenarioAnalyzer.js';
import { excelRank } from './common.js';
import { isTeamKnown } from './models.js';


/** Standings for the bar chart: one row per person, ranked, with per-round points and bar width as % of the leader. */
export function prepareStandingsViewModel(data) {
	const rows = prepareSummaryViewModel(data).rows.map((r) => ({
		person: r.person,
		rank: r.rank,
		total: r.totalPoints,
		rounds: r.roundPoints.map((rp) => rp.points),
		teams: r.teamsCorrect,
		games: r.gamesCorrect,
	}));
	rows.sort((a, b) => a.rank - b.rank || b.total - a.total || a.person.localeCompare(b.person));
	const max = Math.max(1, ...rows.map((r) => r.total));
	rows.forEach((r) => (r.widthPct = Math.round((r.total / max) * 1000) / 10));
	return { rows, max, roundCount: rows[0]?.rounds.length || 0 };
}

export function prepareSummaryViewModel(data) {
	const roundRankMaps = [];
	const cumulativePoints = {};
	data.rounds.forEach((round) => {
		for (const [person, summary] of Object.entries(round.summary.summaries)) {
			cumulativePoints[person] = (cumulativePoints[person] || 0) + summary.points;
		}
		const allPoints = Object.values(cumulativePoints);
		const rankMap = Object.fromEntries(
			Object.entries(cumulativePoints).map(([person, pts]) => [person, excelRank(allPoints, pts)])
		);
		roundRankMaps.push(rankMap);
	});

	// Columns: person, one per round, Total, Rank, Max Possible, Games, Teams, Bonus
	const headers = ['R1', 'R2', 'R3', 'R4'];
	const totalCol = headers.length + 1;
	const rankCol = totalCol + 1;
	const gamesCol = totalCol + 3;
	const teamsCol = totalCol + 4;

	return {
		headers: headers,
		rows: Object.entries(data.personSummaries).map(([person, summary]) => ({
			person: person,
			isLeader: person === data.tiebreakInfo?.winner,
			roundPoints: data.rounds.map((round, i) => {
				const roundPoints = person in round.summary.summaries ? round.summary.summaries[person].points : 0;
				const currentRank = roundRankMaps[i] ? roundRankMaps[i][person] : null;
				let rankChange = null;
				if (i > 0 && roundRankMaps[i] && roundRankMaps[i - 1]) {
					const prevRank = roundRankMaps[i - 1][person];
					const currRank = roundRankMaps[i][person];
					if (prevRank !== undefined && currRank !== undefined) {
						rankChange = prevRank - currRank;
					}
				}
				return {
					points: roundPoints,
					rankChange: rankChange,
					rank: currentRank
				};
			}),
			totalPoints: summary.points,
			rank: summary.rank,
			possiblePoints: summary.possiblePoints,
			gamesCorrect: summary.gamesCorrect,
			teamsCorrect: summary.teamsCorrect,
			bonusEarned: summary.bonusEarned,
		})),
		dataTableConfig: {
			paging: false,
			searching: false,
			info: false,
			order: [
				[totalCol, 'desc'],
				[gamesCol, 'desc'],
				[teamsCol, 'desc'],
			],
			ordering: true,
			autoWidth: false,
			columnDefs: [
				{ targets: [totalCol, rankCol], className: 'dt-body-center dt-head-center points' },
				{ targets: [-1, -2, -3, -4], width: '5%' },
				{ targets: '*', className: 'dt-body-center dt-head-center' },
			],
		},
	};
}

export function prepareRoundViewModel(teams, round, priorOverall = null) {
	const sortedSeries = [...round.serieses].sort((a, b) => (a.letter > b.letter ? 1 : -1));

	if (!round.pickResults) {
		return null;
	}

	// If the round hasn't started yet, censor picks to avoid spoilers UNLESS everyone has submitted
	if (round.roundStarted === false && round.expectedParticipants) {
		const submitted = new Set(Object.keys(round.pickResults));
		const expectedArr = round.expectedParticipants || [];
		const isEveryoneIn = expectedArr.length > 0 && expectedArr.every(person => submitted.has(person));

		if (!isEveryoneIn) {
			const allPeople = [...new Set([...expectedArr, ...submitted])].sort();
			return {
				roundNumber: round.number,
				censored: true,
				hasPriorOverall: !!priorOverall,
				series: sortedSeries.map(buildSeriesViewModel),
				participants: allPeople.map(person => ({
					person,
					hasSubmitted: submitted.has(person),
				})),
			};
		}
	}

	// Scenarios can only be enumerated once every unfinished matchup in the round is known
	const scenarioAnalyzer = round.number > 1 ? new ScenarioAnalyzer() : null;
	const scenariosPending = !!scenarioAnalyzer && scenarioAnalyzer.hasUndeterminedSeries(round);
	const isScenarioEnabled = !!scenarioAnalyzer && !scenariosPending;
	const volatility = scenarioAnalyzer ? scenarioAnalyzer.analyzeRankVolatility(round, priorOverall) : {};
	const leaders = round.summary.winners;
	const roundIsOver = sortedSeries.every(s => s.isOver());

	return {
		roundNumber: round.number,
		roundIsOver,
		hasPriorOverall: !!priorOverall,
		llmSummary: round.llmSummary,
		series: sortedSeries.map(buildSeriesViewModel),
		picks: Object.entries(round.pickResults).map(([person, results]) => {
			const summary = round.summary.summaries[person];
			const personVolatility = volatility[person];
			const isLeader = leaders.includes(person) && summary.points > 0;

			// Calculate targets (people ahead you can catch) and threats (people behind who can catch you)
			const targets = [];
			const threats = [];
			const myTotal = (priorOverall?.[person] || 0) + summary.points;

			if (isScenarioEnabled) {
				for (const [other, otherSummary] of Object.entries(round.summary.summaries)) {
					if (other === person) continue;
					const otherTotal = (priorOverall?.[other] || 0) + otherSummary.points;
					
					if (otherTotal >= myTotal) {
						// Target
						const analysis = scenarioAnalyzer.analyzeAllScenarios(person, other, round, priorOverall);
						targets.push({ 
							name: other, 
							gap: otherTotal - myTotal, 
							canCatch: analysis.canCatch,
							isTied: otherTotal === myTotal,
							analysis 
						});
					} else {
						// Threat
						const analysis = scenarioAnalyzer.analyzeAllScenarios(other, person, round, priorOverall);
						threats.push({ 
							name: other, 
							gap: myTotal - otherTotal, 
							canCatch: analysis.canCatch,
							analysis 
						});
					}
				}
			}

			return {
				person: person,
				isLeader: isLeader,
				seriesPicks: sortedSeries.map((series) => {
					const seriesResult = results[series.letter];
					const pick = seriesResult?.pick || {};
					const topIsTbd = !isTeamKnown(series.topSeed);
					const botIsTbd = !isTeamKnown(series.bottomSeed);
					const isTBD = !pick.team && (topIsTbd || botIsTbd);

					let picksToRender = [pick];
					if ((topIsTbd || botIsTbd) && seriesResult?.conditionalPicks && seriesResult.conditionalPicks.length > 1) {
						picksToRender = seriesResult.conditionalPicks;
					}

					const picksData = picksToRender.map(cp => {
						const cpTeam = teams[cp.team];
						return {
							teamShort: cpTeam?.short,
							teamLogo: cpTeam?.logo,
							teamName: cpTeam?.name,
							games: cp.games || (isTBD ? '-' : ''),
							opponent: (topIsTbd || botIsTbd) ? cp.opponent : null
						};
					});

					return {
						isTBD: isTBD,
						teamStatus: seriesResult?.teamStatus?.toLowerCase() || 'unknown',
						gamesStatus: seriesResult?.gamesStatus?.toLowerCase() || 'unknown',
						picksData: picksData,
					};
				}),
				points: summary.points,
				priorOverall: priorOverall ? (priorOverall[person] || 0) : null,
				rank: summary.rank,
				rankRange: personVolatility?.rankRange,
				scenariosAvailable: isScenarioEnabled,
				scenariosPending: scenariosPending,
				targets: targets.sort((a, b) => a.gap - b.gap),
				threats: threats.sort((a, b) => a.gap - b.gap),
				possiblePoints: summary.possiblePoints,
				gamesCorrect: summary.gamesCorrect,
				teamsCorrect: summary.teamsCorrect,
				bonusEarned: summary.bonusEarned,
			};
		}),
		dataTableConfig: getDataTableConfigForRound(sortedSeries.length, !!priorOverall),
	};
}

function buildSeriesViewModel(series) {
	const topIsTbd = !isTeamKnown(series.topSeed);
	const botIsTbd = !isTeamKnown(series.bottomSeed);
	return {
		letter: series.letter,
		topSeed: topIsTbd ? series.possibleTopSeeds?.join('/') || 'TBD' : series.topSeed,
		topSeedWins: series.topSeedWins,
		bottomSeed: botIsTbd ? series.possibleBottomSeeds?.join('/') || 'TBD' : series.bottomSeed,
		bottomSeedWins: series.bottomSeedWins,
		topSeedIsWinner: series.topSeedWins === 4,
		bottomSeedIsWinner: series.bottomSeedWins === 4,
		nextGameDesc: series.getNextGameDesc(),
		scoresTooltip: series.getScoresTooltip(),
		isTbd: topIsTbd || botIsTbd,
	};
}

function getDataTableConfigForRound(numSeries, hasPriorOverall = false) {
	const orderableTargets = Array.from({ length: numSeries }, (_, i) => i + 1);
	const pointsTargets = [numSeries + 1, numSeries + 2];
	const smallColTargets = hasPriorOverall ? [-1, -2, -3, -4, -5] : [-1, -2, -3, -4];
	const defaultOrder = hasPriorOverall ? [[numSeries + 7, 'desc']] : [[0, 'asc']];

	return {
		paging: false,
		searching: false,
		info: false,
		order: defaultOrder,
		ordering: true,
		autoWidth: false,
		columnDefs: [
			{ targets: pointsTargets, className: 'dt-body-center dt-head-center points' },
			{ orderable: false, targets: orderableTargets },
			{ targets: smallColTargets, width: '5%' },
			{ targets: '*', className: 'dt-body-center dt-head-center' },
		],
	};
}

export function prepareProjectionsViewModel(data) {
	if (!data.projections || !data.projections[4]) {
		return { hasData: false, message: 'No projections data' };
	}

	const round4 = data.rounds.find(r => r.number === 4);
	if (round4 && round4.expectedParticipants) {
		const submitted = new Set(Object.keys(round4.pickResults || {}));
		const expectedArr = round4.expectedParticipants || [];
		const isEveryoneIn = expectedArr.length > 0 && expectedArr.every(person => submitted.has(person));
		if (!isEveryoneIn) {
			return { hasData: false, message: '\u{1F512} Projections are hidden until all Round 4 picks are submitted.' };
		}
	}

	const sortedGames = Object.keys(data.projections)
		.map((key) => Number(key))
		.sort((a, b) => a - b);

	const teams = Object.keys(data.projections[4] || {}).sort();

	if (teams.length === 0 || teams[0] === '' || teams[1] === '') {
		return { hasData: false, message: 'Awaiting Stanley Cup Final matchup.' };
	}

	return {
		hasData: true,
		teams: teams.map((team) => ({
			short: team,
			logo: data.teams[team]?.logo,
			name: data.teams[team]?.name,
		})),
		gameScenarios: sortedGames.map((games) => ({
			games: games,
			cells: teams.map((team) => {
				const cell = data.projections[games][team];
				return {
					team: team,
					cssClass: getProjectionsCellClass(cell),
					first: cell.first,
					second: cell.second,
					third: cell.third,
					losers: cell.losers,
				};
			}),
		})),
		dataTableConfig: {
			paging: false,
			searching: false,
			info: false,
			order: [[1, 'asc']],
			ordering: false,
			autoWidth: false,
			columnDefs: [
				{ targets: [1, 2], type: 'html' },
				{ targets: '*', className: 'dt-body-center dt-head-center' },
			],
		},
	};
}

function getProjectionsCellClass(cell) {
	if (!cell.isPossible) {
		return 'incorrect';
	} else if (cell.isOver) {
		return 'correct';
	}
	return '';
}
