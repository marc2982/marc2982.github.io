const extraStatsColumns = { targets: [-1, -2, -3, -4], width: '5%' };

export function renderPage(data) {
	renderTiebreaker(data, $('#tiebreaker'));
	renderSummary(data, $('#summaryTable'));
	$.each(data.rounds, function (_, round) {
		let tableName = '#round' + round.number + 'Table';
		renderRound(data.teams, round, $(tableName));
	});
	renderProjections(data, $('#projectionsTable'));

	// Hide loading spinner and show content after all rendering is complete
	$('#loading').hide();
	$('#main-content').fadeIn();
}

export function renderTiebreaker(data, div) {
	const leaderCount = data.tiebreakInfo?.leaders?.length ?? 0;
	if (leaderCount > 1) {
		div.show();
	} else {
		div.hide();
	}
}

function getProjectionsClass(cell) {
	if (!cell.isPossible) {
		return 'incorrect';
	} else if (cell.isOver) {
		return 'correct';
	} else {
		return '';
	}
}

export function renderSummary(data, table) {
	$(table).html(`
        <thead>
            <tr>
                <th>&nbsp;</th>
                <th>Round 1</th>
                <th>Round 2</th>
                <th>Round 3</th>
                <th>Round 4</th>
                <th>Total Points</th>
                <th>Rank</th>
                <th>Maximum Possible Points</th>
                <th>Num Games Correct</th>
                <th>Num Teams Correct</th>
                <th>Num Bonuses Earned</th>
            </tr>
        </thead>
        <tbody>
            ${$.map(data.personSummaries, function (summary, person) {
				let leaderClass = person === data.tiebreakInfo?.winner ? "class='leader'" : '';
				return `<tr ${leaderClass}>
                        <th>${person}</th>
                        ${$.map(data.rounds, function (round) {
							let summaries = round.summary.summaries;
							return `<td>${person in summaries ? summaries[person].points : 0}</td>`;
						})}
                        <td>${summary.points}</td>
                        <td>${summary.rank}</td>
                        <td>${summary.possiblePoints}</td>
                        <td>${summary.gamesCorrect}</td>
                        <td>${summary.teamsCorrect}</td>
                        <td>${summary.bonusEarned}</td>
                    </tr>`;
			}).join('')}
        </tbody>
    `);
	$(table).DataTable({
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
			extraStatsColumns,
			{ targets: '*', className: 'dt-body-center dt-head-center' },
		],
	});
}

export function renderRound(teams, round, table) {
	var sortedSeries = round.serieses.sort((a, b) => (a.letter > b.letter ? 1 : -1));
	if (!round.pickResults) {
		console.log('No pick results for round ' + round.number);
		return;
	}
	$(table).html(`
        <thead>
            <tr>
                <th>&nbsp;</th>
                ${$.map(round.serieses, function (series) {
					const winningSeedClass = 'winning_seed';
					let topSeedClass = series.topSeedWins == 4 ? winningSeedClass : '';
					let bottomSeedClass = series.bottomSeedWins == 4 ? winningSeedClass : '';
					return `<th>
                            <span>Series ${series.letter}: </span>
                            <br />
                            ${
								series.topSeed
									? `<span class='${topSeedClass}'>${series.topSeed} ${series.topSeedWins}</span>`
									: `<span>?</span>`
							}
                            <br />
                            ${
								series.bottomSeed
									? `<span class='${bottomSeedClass}'>${series.bottomSeed} ${series.bottomSeedWins}</span>`
									: `<span>?</span>`
							}
                        </th>`;
				})}
                <th>Points</th>
                <th>Rank</th>
                <th>Maximum Possible Points</th>
                <th>Num Games Correct</th>
                <th>Num Teams Correct</th>
                <th>Num Bonuses Earned</th>
            </tr>
        </thead>
        <tbody>
            ${$.map(round.pickResults, function (results, person) {
				let summary = round.summary.summaries[person];
				let leaderClass = round.summary.winners.includes(person) && summary.points > 0 ? "class='leader'" : '';
				return `<tr ${leaderClass}>
                        <th>${person}</th>
                        ${$.map(sortedSeries, function (series, _) {
							let seriesResult = results[series.letter];
							let pick = seriesResult.pick;
							let team = teams[pick.team]?.short;
							let teamLogo = teams[pick.team]?.logo;
							let teamName = teams[pick.team]?.name;
							return `<td>
                                <div class="pick">
                                    <div class="img_container ${seriesResult.teamStatus.toLowerCase()}">
                                        ${teams[team] ? `<img src="${teamLogo}" alt="${teamName}" />` : '&nbsp;'}
                                    </div>
                                    <div class="games ${seriesResult.gamesStatus.toLowerCase()}">${pick.games}</div>
                                </div>
                                </td>`;
						})}
                        <td>${summary.points}</td>
                        <td>${summary.rank}</td>
                        <td>${summary.possiblePoints}</td>
                        <td>${summary.gamesCorrect}</td>
                        <td>${summary.teamsCorrect}</td>
                        <td>${summary.bonusEarned}</td>
                    </tr>`;
			}).join('')}
        </tbody>
    `);
	let pointsColumns = { targets: [], className: '' };
	let orderable = { orderable: true, targets: [] };
	switch (round.number) {
		case 1:
			pointsColumns = { targets: [9, 10], className: 'dt-body-center dt-head-center points' };
			orderable = { orderable: false, targets: [1, 2, 3, 4, 5, 6, 7, 8] };
			break;
		case 2:
			pointsColumns = { targets: [5, 6], className: 'dt-body-center dt-head-center points' };
			orderable = { orderable: false, targets: [1, 2, 3, 4] };
			break;
		case 3:
			pointsColumns = { targets: [3, 4], className: 'dt-body-center dt-head-center points' };
			orderable = { orderable: false, targets: [1, 2] };
			break;
		case 4:
			pointsColumns = { targets: [2, 3], className: 'dt-body-center dt-head-center points' };
			orderable = { orderable: false, targets: [1] };
			break;
	}
	$(table).DataTable({
		paging: false,
		searching: false,
		info: false,
		order: [[0, 'asc']], // sort rounds by name
		ordering: true,
		autoWidth: false,
		columnDefs: [
			pointsColumns,
			orderable,
			extraStatsColumns,
			{ targets: '*', className: 'dt-body-center dt-head-center' },
		],
	});
}

function renderProjectionCell(cell) {
	return `<div>
        <table style="width: 100%">
            <tbody>
                <tr>
                    <td style="width: 50%">1st: ${cell.first.join()}</td>
                    <td style="width: 50%" rowspan=3>Loser(s): ${cell.losers.join()}</td>
                </tr>
                <tr>
                    <td>2nd: ${cell.second.join()}</td>
                </tr>
                <tr>
                    <td>3rd: ${cell.third.join()}</td>
                </tr>
            </tbody>
        </table>
    </div>`;
}

export function renderProjections(data, table) {
	console.log('Rendering projections');
	console.log(data.projections);
	if (!data.projections || !data.projections[4]) {
		console.log('No projections data');
		$(table).html('<p>No projections data</p>');
		return;
	}
	let sortedGames = Object.keys(data.projections)
		.map((key) => Number(key))
		.sort((a, b) => a - b); // sort 4 -> 7
	let teams = Object.keys(data.projections[4] || {}).sort(); // sort teams alphabetically
	if (teams.length === 0 || teams[0] === '' || teams[1] === '') {
		$(table).html('<p align=center>Awaiting Stanley Cup Final matchup.</p>');
		return;
	}
	$(table).html(`
        <thead>
            <tr>
                <th>&nbsp;</th>
                ${$.map(teams, function (team) {
					return `<th>
                            <div class="pick">
                                ${
									data.teams[team]
										? `<img src="${data.teams[team].logo}" alt="${data.teams[team].name}" />`
										: '&nbsp;'
								}
                            </div>
                        </th>`;
				})}
            </tr>
        </thead>
        <tbody>
            ${$.map(sortedGames, function (game) {
				return `<tr>
                        <td>${game}</td>
                        ${$.map(data.projections[game], function (cell, team) {
							let tdClass = getProjectionsClass(cell);
							let renderedCell = renderProjectionCell(cell);
							return `<td class="${tdClass}">${renderedCell}</td>`;
						})}
                    </tr>`;
			}).join('')}
        </tbody>
    `);
	$(table).DataTable({
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
	});
}
