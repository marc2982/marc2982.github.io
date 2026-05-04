import { prepareSummaryViewModel, prepareRoundViewModel, prepareProjectionsViewModel } from './yearViewModel.js';

export function renderPage(data) {
	renderTiebreaker(data, $('#tiebreaker'));
	renderSummary(data, $('#summaryTable'));
	const cumulativePoints = {};
	$.each(data.rounds, function (_, round) {
		const priorOverall = round.number > 1 ? { ...cumulativePoints } : null;
		let tableName = '#round' + round.number + 'Table';
		renderRound(data.teams, round, $(tableName), priorOverall);
		for (const [person, summary] of Object.entries(round.summary?.summaries || {})) {
			cumulativePoints[person] = (cumulativePoints[person] || 0) + summary.points;
		}
	});
	renderProjections(data, $('#projectionsTable'));

	// Hide loading spinner and show content after all rendering is complete
	$('#loading').hide();
	$('#main-content').fadeIn();
}

export function renderTiebreaker(data, div) {
	const leaderCount = data.tiebreakInfo?.leaders?.length ?? 0;
	const isFinalRoundComplete = data.rounds?.[3]?.serieses?.[0]?.isOver() ?? false;
	
	if (leaderCount > 1 && isFinalRoundComplete) {
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

export function renderRound(teams, round, table, priorOverall = null) {
	const viewModel = prepareRoundViewModel(teams, round, priorOverall);
	if (!viewModel) {
		console.log('No pick results for round ' + round.number);
		return;
	}

	// Censored mode: round hasn't started, just show submission status
	if (viewModel.censored) {
		const submitted = viewModel.participants.filter(p => p.hasSubmitted);
		const missing = viewModel.participants.filter(p => !p.hasSubmitted);

		$(table).html(`
			<div class="censored-round">
				<p class="censored-notice">\u{1F512} Picks are hidden until the round begins.</p>
				<div class="censored-lists">
					<div class="censored-group submitted">
						<h4>Submitted (${submitted.length})</h4>
						<ul>
							${submitted.map(p => `<li>\u{1F92B} ${p.person}</li>`).join('')}
						</ul>
					</div>
					<div class="censored-group missing">
						<h4>Still Needed (${missing.length})</h4>
						<ul>
							${missing.map(p => `<li>\u{274C} ${p.person}</li>`).join('')}
						</ul>
					</div>
				</div>
			</div>
		`);
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
                        <div class="matchup-header ${s.scoresTooltip ? 'has-tooltip' : ''}">
                            <div class="team-top ${s.topSeedIsWinner ? 'winner' : ''}">${s.topSeed} (${
						s.topSeedWins
					})</div>
                            <div class="team-bottom ${s.bottomSeedIsWinner ? 'winner' : ''}">${s.bottomSeed} (${
						s.bottomSeedWins
					})</div>
                            ${s.nextGameDesc ? `<div class="next-game">${s.nextGameDesc}</div>` : ''}
                            ${s.scoresTooltip ? `<div class="scores-tooltip">${s.scoresTooltip}</div>` : ''}
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
                ${viewModel.hasPriorOverall ? '<th>Prev. Overall Pts</th>' : ''}
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
                            <div style="${pick.picksData.length > 1 ? 'display:flex;gap:8px;justify-content:center;' : ''}">
                            ${pick.picksData.map((cp, idx) => {
								const isMulti = pick.picksData.length > 1;
								const scaleStyle = isMulti ? 'transform:scale(0.85);margin:-8px 0;' : '';
								const teamHtml = cp.teamShort
									? `<img src="${cp.teamLogo}" alt="${cp.teamName}" />`
									: (pick.isTBD ? '<span style="color:#999;font-weight:bold;font-size:0.8rem;margin-top:10px;display:inline-block;">TBD</span>' : '&nbsp;');
								const opponentHtml = cp.opponent ? `<div style="font-size:0.65rem;color:var(--bs-body-color);margin-top:1px;">vs ${cp.opponent}</div>` : '';
								return `<div class="pick" style="${scaleStyle}"><div class="img_container ${pick.teamStatus}">${teamHtml}${opponentHtml}</div><div class="games ${pick.gamesStatus}">${cp.games}</div></div>`;
							}).join('')}
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
                    ${viewModel.hasPriorOverall ? `<td>${p.priorOverall}</td>` : ''}
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
