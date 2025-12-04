import { prepareSummaryViewModel, prepareRoundViewModel, prepareProjectionsViewModel } from './yearViewModel.js';

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

export function renderSummary(data, table) {
	const viewModel = prepareSummaryViewModel(data);

	$(table).html(`
        <thead>
            <tr>
                <th>&nbsp;</th>
                ${viewModel.headers.map((h) => `<th>${h}</th>`).join('')}
            </tr>
        </thead>
        <tbody>
            ${viewModel.rows
				.map(
					(row) => `
                <tr ${row.isLeader ? "class='leader'" : ''}>
                    <th>${row.person}</th>
                    ${row.roundPoints.map((pts) => `<td>${pts}</td>`).join('')}
                    <td>${row.totalPoints}</td>
                    <td>${row.rank}</td>
                    <td>${row.possiblePoints}</td>
                    <td>${row.gamesCorrect}</td>
                    <td>${row.teamsCorrect}</td>
                    <td>${row.bonusEarned}</td>
                </tr>
            `,
				)
				.join('')}
        </tbody>
    `);

	$(table).DataTable(viewModel.dataTableConfig);
}

export function renderRound(teams, round, table) {
	const viewModel = prepareRoundViewModel(teams, round);
	if (!viewModel) {
		console.log('No pick results for round ' + round.number);
		return;
	}

	$(table).html(`
        <thead>
            <tr>
                <th>&nbsp;</th>
                ${viewModel.series
					.map(
						(s) => `
                    <th>
                        <div class="matchup-header">
                            <div class="team-top ${s.topSeedIsWinner ? 'winner' : ''}">${s.topSeed} (${
							s.topSeedWins
						})</div>
                            <div class="team-bottom ${s.bottomSeedIsWinner ? 'winner' : ''}">${s.bottomSeed} (${
							s.bottomSeedWins
						})</div>
                        </div>
                    </th>
                `,
					)
					.join('')}
                <th>Total Points</th>
                <th>Rank</th>
                <th>Maximum Possible Points</th>
                <th>Num Games Correct</th>
                <th>Num Teams Correct</th>
                <th>Num Bonuses Earned</th>
            </tr>
        </thead>
        <tbody>
            ${viewModel.picks
				.map(
					(p) => `
                <tr ${p.isLeader ? "class='leader'" : ''}>
                    <th>${p.person}</th>
                    ${p.seriesPicks
						.map(
							(pick) => `
                        <td>
                            <div class="pick">
                                <div class="img_container ${pick.teamStatus}">
                                    ${
										pick.teamShort
											? `<img src="${pick.teamLogo}" alt="${pick.teamName}" />`
											: '&nbsp;'
									}
                                </div>
                                <div class="games ${pick.gamesStatus}">${pick.games}</div>
                            </div>
                        </td>
                    `,
						)
						.join('')}
                    <td>${p.points}</td>
                    <td>${p.rank}</td>
                    <td>${p.possiblePoints}</td>
                    <td>${p.gamesCorrect}</td>
                    <td>${p.teamsCorrect}</td>
                    <td>${p.bonusEarned}</td>
                </tr>
            `,
				)
				.join('')}
        </tbody>
    `);

	$(table).DataTable(viewModel.dataTableConfig);
}

export function renderProjections(data, table) {
	const viewModel = prepareProjectionsViewModel(data);

	if (!viewModel.hasData) {
		console.log(viewModel.message);
		$(table).html(`<p align=center>${viewModel.message}</p>`);
		return;
	}

	$(table).html(`
        <thead>
            <tr>
                <th>&nbsp;</th>
                ${viewModel.teams
					.map(
						(team) => `
                    <th>
                        <div class="pick">
                            ${team.logo ? `<img src="${team.logo}" alt="${team.name}" />` : '&nbsp;'}
                        </div>
                    </th>
                `,
					)
					.join('')}
            </tr>
        </thead>
        <tbody>
            ${viewModel.gameScenarios
				.map(
					(scenario) => `
                <tr>
                    <td>${scenario.games}</td>
                    ${scenario.cells
						.map(
							(cell) => `
                        <td class="${cell.cssClass}">
                            <div>
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
                            </div>
                        </td>
                    `,
						)
						.join('')}
                </tr>
            `,
				)
				.join('')}
        </tbody>
    `);

	$(table).DataTable(viewModel.dataTableConfig);
}
