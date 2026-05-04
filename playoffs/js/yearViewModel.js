import { ScenarioAnalyzer } from './scenarioAnalyzer.js';

export function prepareSummaryViewModel(data) {
	return {
		headers: [
			'Round 1',
			'Round 2',
			'Round 3',
			'Round 4',
			'Total Points',
			'Rank',
			'Maximum Possible Points',
			'Num Games Correct',
			'Num Teams Correct',
			'Num Bonuses Earned',
		],
		rows: Object.entries(data.personSummaries).map(([person, summary]) => ({
			person: person,
			isLeader: person === data.tiebreakInfo?.winner,
			roundPoints: data.rounds.map((round) => {
				const summaries = round.summary.summaries;
				return person in summaries ? summaries[person].points : 0;
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
				[5, 'desc'],
				[8, 'desc'],
				[9, 'desc'],
			],
			ordering: true,
			autoWidth: false,
			columnDefs: [
				{ targets: [5, 6], className: 'dt-body-center dt-head-center points' },
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
				participants: allPeople.map(person => ({
					person,
					hasSubmitted: submitted.has(person),
				})),
			};
		}
	}

	const isScenarioEnabled = round.number > 1;
	const scenarioAnalyzer = isScenarioEnabled ? new ScenarioAnalyzer() : null;
	const volatility = isScenarioEnabled ? scenarioAnalyzer.analyzeRankVolatility(round, priorOverall) : {};
	const leaders = round.summary.winners;

	return {
		roundNumber: round.number,
		hasPriorOverall: !!priorOverall,
		series: sortedSeries.map((series) => {
			const topIsTbd = !series.topSeed || series.topSeed === 'undefined' || series.topSeed.toUpperCase() === 'TBD';
			const botIsTbd = !series.bottomSeed || series.bottomSeed === 'undefined' || series.bottomSeed.toUpperCase() === 'TBD';
			return {
				letter: series.letter,
				topSeed: topIsTbd ? (series.possibleTopSeeds?.join('/') || 'TBD') : series.topSeed,
				topSeedWins: series.topSeedWins,
				bottomSeed: botIsTbd ? (series.possibleBottomSeeds?.join('/') || 'TBD') : series.bottomSeed,
				bottomSeedWins: series.bottomSeedWins,
				topSeedIsWinner: series.topSeedWins === 4,
				bottomSeedIsWinner: series.bottomSeedWins === 4,
				nextGameDesc: series.getNextGameDesc(),
				scoresTooltip: series.getScoresTooltip(),
				isTbd: topIsTbd || botIsTbd
			};
		}),
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
					const team = teams[pick.team];
					const topIsTbd = !series.topSeed || series.topSeed === 'undefined' || series.topSeed.toUpperCase() === 'TBD';
					const botIsTbd = !series.bottomSeed || series.bottomSeed === 'undefined' || series.bottomSeed.toUpperCase() === 'TBD';
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
