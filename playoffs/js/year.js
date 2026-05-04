import { prepareSummaryViewModel, prepareRoundViewModel, prepareProjectionsViewModel } from './yearViewModel.js';

export function renderPage(data) {
	renderTiebreaker(data, $('#tiebreaker'));
	renderSummary(data, $('#summaryTable'));
	const cumulativePoints = {};
	$.each(data.rounds, function (_, round) {
		const priorOverall = {};
		if (round.number > 1) {
			data.rounds.forEach(r => {
				if (r.number < round.number) {
					Object.entries(r.summary.summaries).forEach(([person, summary]) => {
						priorOverall[person] = (priorOverall[person] || 0) + summary.points;
					});
				}
			});
		}

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
                    ${row.roundPoints.map((rp, idx) => `<td>${rp.points}${renderRankChange(rp, idx)}</td>`).join('')}
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
                <tr class="${p.isLeader ? 'leader' : ''} clickable-row">
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
                    <td>
						${p.rank}
						${p.rankRange ? `<span class="volatility">(${p.rankRange[0]}-${p.rankRange[1]})</span>` : ''}
					</td>
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

	const dt = $(table).DataTable(viewModel.dataTableConfig);

	// Click listener for scenario expansion
	$(table).find('tbody').on('click', 'tr.clickable-row', function () {
		const tr = $(this);
		const row = dt.row(tr);
		const person = tr.find('th').first().text().trim();
		const pickData = viewModel.picks.find(p => p.person === person);

		if (row.child.isShown()) {
			row.child.hide();
			tr.removeClass('shown');
		} else {
			row.child(formatScenario(pickData)).show();
			tr.addClass('shown');
		}
	});
}

function formatScenario(pickData) {
	const { targets, threats, person } = pickData;
	
	const renderList = (list, title, isTarget) => {
		if (list.length === 0) return `<div class="scenario-column"><h5>${title}</h5><p>None</p></div>`;
		
		return `
			<div class="scenario-column">
				<h5>${title}</h5>
				<ul class="scenario-list">
					${list.slice(0, 3).map(item => {
						let badgeClass = 'cant-catch-badge';
						let badgeText = isTarget ? 'Locked' : 'Safe';
						
						if (item.isTied) {
							badgeClass = 'can-catch-badge';
							badgeText = 'Tied';
						} else if (item.canCatch) {
							badgeClass = 'can-catch-badge';
							badgeText = isTarget ? 'Possible' : 'Threat';
						}

						const analysis = item.analysis;
						const successRate = Math.round((analysis.successCount / analysis.totalCount) * 100);
						
						let statsHtml = '';
						if (analysis.canCatch && !item.isTied) {
							const primaryImpact = analysis.highImpact[0];
							const impactHtml = primaryImpact 
								? `<div class="high-impact"><b>High Impact:</b> ${primaryImpact.team}${primaryImpact.type === 'OUTCOME' ? ` in ${primaryImpact.games}` : ''} (${Math.round(primaryImpact.frequency * 100)}% of paths)</div>`
								: '';
							statsHtml = `
								<div class="scenario-stats">
									${analysis.successCount} / ${analysis.totalCount} different ways to ${isTarget ? 'overtake' : 'be overtaken'} - ${successRate}% chance
									${impactHtml}
								</div>
							`;
						}

						const renderPath = (pathObj, label) => {
							if (!pathObj) return '';
							const relativeLead = pathObj.totalRelativeGain - item.gap;
							
							let leadText = '';
							if (relativeLead > 0) {
								leadText = isTarget 
									? `${person} would lead ${item.name} by ${relativeLead} pt${relativeLead === 1 ? '' : 's'}`
									: `${item.name} would lead ${person} by ${relativeLead} pt${relativeLead === 1 ? '' : 's'}`;
							} else {
								leadText = `Result would be a tie`;
							}
							
							return `
								<div class="path-container">
									<div class="path-label">${label}:</div>
									<div class="scenario-item-path">
										${pathObj.path.map(p => `
											<span class="path-step" title="${p.seriesDesc}">${p.seriesLetter}: ${p.outcome.team} (${p.outcome.games})</span>
										`).join('')}
									</div>
									<div class="path-result">Result: ${leadText}</div>
								</div>
							`;
						};

						const pathsHtml = analysis.canCatch && !item.isTied
							? `${renderPath(analysis.aggressivePath, 'The Big Swing')}
							   ${analysis.conservativePath && analysis.conservativePath.totalRelativeGain !== analysis.aggressivePath.totalRelativeGain 
								   ? renderPath(analysis.conservativePath, 'Narrow Overtake') 
								   : ''}`
							: `<div class="scenario-item-path">${item.isTied ? 'Currently tied' : `No path to bridge the ${item.gap} pt gap`}</div>`;

						return `
							<li class="scenario-item">
								<div class="scenario-item-header">
									<span>${item.name} (Gap: ${item.gap} pt${item.gap === 1 ? '' : 's'})</span>
									<span class="${badgeClass}">${badgeText}</span>
								</div>
								${statsHtml}
								${pathsHtml}
							</li>
						`;
					}).join('')}
				</ul>
			</div>
		`;
	};

	return `
		<div class="scenario-container">
			<div class="scenario-grid">
				${renderList(targets, `Targets for ${person}`, true)}
				${renderList(threats, `Threats to ${person}`, false)}
			</div>
		</div>
	`;
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

function renderRankChange(rp, roundIndex) {
	if (roundIndex === 0) return '';

	const change = rp.rankChange;
	if (change === null || change === 0) return '';
	const color = change > 0 ? '#28a745' : '#dc3545';
	const arrow = change > 0 ? '↑' : '↓';
	const absChange = Math.abs(change);
	return `<span class="rank-change" style="color: ${color}; font-size: 0.75rem; margin-left: 4px; font-weight: bold;">${arrow}${absChange}</span>`;
}
