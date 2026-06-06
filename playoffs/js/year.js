import { prepareSummaryViewModel, prepareRoundViewModel, prepareProjectionsViewModel } from './yearViewModel.js';

export function renderPage(data) {
	renderYearlySummary(data, $('#yearlySummary'));
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
                <th class="stats-divider">Total</th>
                <th>Rank</th>
                <th>Max Possible</th>
                <th>Games ✓</th>
                <th>Teams ✓</th>
                <th>Bonus</th>
            </tr>
        </thead>
        <tbody>
            ${viewModel.rows
				.map(
					(row) => `
                <tr ${row.isLeader ? "class='leader'" : ''}>
                    <th>${row.person}</th>
                    ${row.roundPoints.map((rp, idx) => `<td class="round-points-cell"><span class="points-wrap">${rp.points}</span>${renderRankChange(rp, idx)}</td>`).join('')}
                    <td class="stats-divider stats-cell">${row.totalPoints}</td>
                    <td class="stats-cell rank-cell">${row.rank}</td>
                    <td class="stats-cell">${row.possiblePoints}</td>
                    <td class="stats-cell">${row.gamesCorrect}</td>
                    <td class="stats-cell">${row.teamsCorrect}</td>
                    <td class="stats-cell">${row.bonusEarned}</td>
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

	// Add LLM Summary if it exists
	$(table).siblings('.round-recap').remove();
	if (viewModel.llmSummary) {
		$(table).siblings('h2').after(`
			<div class="round-recap">
				<h4>🤖 AI Round Recap</h4>
				<p>${viewModel.llmSummary}</p>
			</div>
		`);
	}

	// Censored mode: round hasn't started, just show submission status
	if (viewModel.censored) {
		const submitted = viewModel.participants.filter(p => p.hasSubmitted);
		const missing = viewModel.participants.filter(p => !p.hasSubmitted);

		const numColumns = 1 + viewModel.series.length + 6 + (viewModel.hasPriorOverall ? 1 : 0);

		$(table).html(`
			<thead>
				<tr>
					<th>&nbsp;</th>
					${viewModel.series
						.map(
						(s) => `
					<th class="matchup-th">
						<div class="matchup-header ${s.scoresTooltip ? 'has-tooltip' : ''}">
								<div class="team-top ${s.topSeedIsWinner ? 'winner' : ''}">${s.topSeed} (${s.topSeedWins})</div>
								<div class="team-bottom ${s.bottomSeedIsWinner ? 'winner' : ''}">${s.bottomSeed} (${s.bottomSeedWins})</div>
								${s.nextGameDesc ? `<div class="next-game">${s.nextGameDesc}</div>` : ''}
								${s.scoresTooltip ? `<div class="scores-tooltip">${s.scoresTooltip}</div>` : ''}
							</div>
						</th>
					`,
						)
						.join('')}
					<th class="stats-divider">Total</th>
					<th>Rank</th>
					<th>Max Possible</th>
					<th>Games ✓</th>
					<th>Teams ✓</th>
					<th>Bonus</th>
					${viewModel.hasPriorOverall ? '<th>Prev. Overall</th>' : ''}
				</tr>
			</thead>
			<tbody>
				<tr>
					<td colspan="${numColumns}" style="padding: 20px;">
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
					</td>
				</tr>
			</tbody>
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
                    <th class="matchup-th">
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
                <th class="stats-divider">Total</th>
                <th>Rank</th>
                <th>Max Possible</th>
                <th>Games ✓</th>
                <th>Teams ✓</th>
                <th>Bonus</th>
                ${viewModel.hasPriorOverall ? '<th>Prev. Overall</th>' : ''}
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
								return `<div class="pick pick-box" style="${scaleStyle}"><div class="img_container ${pick.teamStatus}">${teamHtml}${opponentHtml}</div><div class="games ${pick.gamesStatus}">${cp.games}</div></div>`;
							}).join('')}
                            </div>
                        </td>
                    `,
						)
						.join('')}
                    <td class="stats-divider stats-cell">${p.points}</td>
                    <td class="stats-cell rank-cell">
						${p.rank}
						${!viewModel.roundIsOver && p.rankRange && p.rankRange[0] !== p.rankRange[1] ? `
							<span class="rank-volatility best" title="Best possible rank">↑${p.rankRange[0]}</span>
							<span class="rank-volatility worst" title="Worst possible rank">↓${p.rankRange[1]}</span>
						` : ''}
					</td>
                    <td class="stats-cell">${p.possiblePoints}</td>
                    <td class="stats-cell">${p.gamesCorrect}</td>
                    <td class="stats-cell">${p.teamsCorrect}</td>
                    <td class="stats-cell">${p.bonusEarned}</td>
                    ${viewModel.hasPriorOverall ? `<td class="stats-cell">${p.priorOverall}</td>` : ''}
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
					${list.map(item => {
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
                            <div class="projection-box">
                                <div class="projection-content">
                                    <div class="projection-winners">
                                        ${cell.first.length ? `<div class="place-row"><span class="place gold">1st${cell.first.length > 1 ? ' (tie)' : ''}:</span> <span class="names">${cell.first.join(', ')}</span></div>` : ''}
                                        ${cell.second.length ? `<div class="place-row"><span class="place silver">2nd${cell.second.length > 1 ? ' (tie)' : ''}:</span> <span class="names">${cell.second.join(', ')}</span></div>` : ''}
                                        ${cell.third.length ? `<div class="place-row"><span class="place bronze">3rd${cell.third.length > 1 ? ' (tie)' : ''}:</span> <span class="names">${cell.third.join(', ')}</span></div>` : ''}
                                    </div>
                                    <div class="projection-losers">
                                        ${cell.losers.length ? `<div class="place-row"><span class="place">Loser(s):</span> <span class="names">${cell.losers.join(', ')}</span></div>` : ''}
                                    </div>
                                </div>
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

export function renderYearlySummary(data, container) {
	// Check if playoffs are complete (all 4 rounds have series that are over)
	const allRoundsComplete = data.rounds.every(round => 
		round.serieses.every(series => series.isOver())
	);

	if (!allRoundsComplete || !data.personSummaries || Object.keys(data.personSummaries).length === 0) {
		container.hide();
		return;
	}

	// Get sorted participants by total points
	const participants = Object.entries(data.personSummaries)
		.map(([person, summary]) => ({
			person,
			...summary
		}))
		.sort((a, b) => b.points - a.points);

	const winner = participants[0];
	const second = participants[1];
	const third = participants[2];

	// Calculate fun stats
	const funStats = calculateFunStats(data);

	// Get all series results
	const allSeries = [];
	data.rounds.forEach(round => {
		round.serieses.forEach(series => {
			allSeries.push({
				round: round.number,
				letter: series.letter,
				topSeed: series.topSeed,
				bottomSeed: series.bottomSeed,
				topSeedWins: series.topSeedWins,
				bottomSeedWins: series.bottomSeedWins,
				winner: series.topSeedWins === 4 ? series.topSeed : series.bottomSeed,
				loser: series.topSeedWins === 4 ? series.bottomSeed : series.topSeed
			});
		});
	});

	// Get cup winner (winner of Round 4 - the Stanley Cup Final)
	const finalSeries = allSeries.find(s => s.round === 4);
	const cupWinner = finalSeries ? finalSeries.winner : 'Unknown';

	// Build HTML
	container.html(`
		<div class="yearly-summary-header">
			<h2>${data.year} Playoff Pool Summary</h2>
		</div>

		<div class="winner-announcement">
			<div class="winner-trophy">🏆</div>
			<div class="winner-info">
				<h3>Pool Winner</h3>
				<div class="winner-name">${winner.person}</div>
				<div class="winner-points">${winner.points} points</div>
			</div>
		</div>

		${data.overallSummary ? `
		<div class="overall-summary">
			<h3>Playoff Recap</h3>
			<p>${data.overallSummary}</p>
		</div>
		` : ''}

		<div class="podium">
			<div class="podium-item second">
				<div class="podium-place">2nd</div>
				<div class="podium-name">${second.person}</div>
				<div class="podium-points">${second.points} pts</div>
			</div>
			<div class="podium-item first">
				<div class="podium-place">1st</div>
				<div class="podium-name">${winner.person}</div>
				<div class="podium-points">${winner.points} pts</div>
			</div>
			<div class="podium-item third">
				<div class="podium-place">3rd</div>
				<div class="podium-name">${third.person}</div>
				<div class="podium-points">${third.points} pts</div>
			</div>
		</div>

		<div class="fun-stats">
			<h3>Fun Stats</h3>
			<div class="stats-grid">
				${funStats.map(stat => `
					<div class="stat-card">
						<div class="stat-icon">${stat.icon}</div>
						<div class="stat-value">${stat.value}</div>
						<div class="stat-label">${stat.label}</div>
						<div class="stat-holder">${stat.holder}</div>
					</div>
				`).join('')}
			</div>
		</div>

		<div class="series-overview">
			<h3>Series Results</h3>
			<div class="series-grid">
				${[1, 2, 3, 4].map(round => `
					<div class="series-round">
						<h4>Round ${round}</h4>
						${allSeries.filter(s => s.round === round).map(series => `
							<div class="series-matchup">
								<div class="series-team winner">
									${data.teams[series.winner]?.logo ? `<img src="${data.teams[series.winner].logo}" alt="${series.winner}" class="team-logo-small" />` : ''}
									<span>${series.winner}</span>
								</div>
								<span class="series-score">${series.topSeedWins}-${series.bottomSeedWins}</span>
								<div class="series-team loser">
									<span>${series.loser}</span>
									${data.teams[series.loser]?.logo ? `<img src="${data.teams[series.loser].logo}" alt="${series.loser}" class="team-logo-small" />` : ''}
								</div>
							</div>
						`).join('')}
					</div>
				`).join('')}
			</div>
		</div>

		<div class="cup-winner">
			<h3>Stanley Cup Champion</h3>
			${data.teams[cupWinner]?.logo ? `<img src="${data.teams[cupWinner].logo}" alt="${cupWinner}" class="cup-logo" />` : ''}
			<div class="cup-team">${cupWinner}</div>
		</div>
	`);

	container.show();
}

function calculateFunStats(data) {
	const stats = [];

	// Most points in a single round
	let maxRoundPoints = 0;
	let maxRoundPerson = '';
	let maxRoundNumber = 0;

	data.rounds.forEach(round => {
		Object.entries(round.summary.summaries).forEach(([person, summary]) => {
			if (summary.points > maxRoundPoints) {
				maxRoundPoints = summary.points;
				maxRoundPerson = person;
				maxRoundNumber = round.number;
			}
		});
	});

	stats.push({
		icon: '🔥',
		value: `${maxRoundPoints} pts`,
		label: `Best Single Round (R${maxRoundNumber})`,
		holder: maxRoundPerson
	});

	// Most teams correct overall
	let maxTeams = 0;
	let maxTeamsPerson = '';
	Object.entries(data.personSummaries).forEach(([person, summary]) => {
		if (summary.teamsCorrect > maxTeams) {
			maxTeams = summary.teamsCorrect;
			maxTeamsPerson = person;
		}
	});

	stats.push({
		icon: '🎯',
		value: `${maxTeams} teams`,
		label: 'Most Teams Correct',
		holder: maxTeamsPerson
	});

	// Most games correct overall
	let maxGames = 0;
	let maxGamesPerson = '';
	Object.entries(data.personSummaries).forEach(([person, summary]) => {
		if (summary.gamesCorrect > maxGames) {
			maxGames = summary.gamesCorrect;
			maxGamesPerson = person;
		}
	});

	stats.push({
		icon: '📅',
		value: `${maxGames} games`,
		label: 'Most Games Correct',
		holder: maxGamesPerson
	});

	// Perfect picks (team + games correct = bonus)
	// Note: earnedBonusPoints field is unreliable in saved data, so we check both statuses directly
	const perfectCounts = {};
	data.rounds.forEach(round => {
		Object.entries(round.pickResults).forEach(([person, results]) => {
			if (!perfectCounts[person]) perfectCounts[person] = 0;
			Object.values(results).forEach(result => {
				if (result.teamStatus === 'CORRECT' && result.gamesStatus === 'CORRECT') {
					perfectCounts[person]++;
				}
			});
		});
	});

	let perfectPicks = 0;
	let perfectPerson = '';
	Object.entries(perfectCounts).forEach(([person, count]) => {
		if (count > perfectPicks) {
			perfectPicks = count;
			perfectPerson = person;
		}
	});

	stats.push({
		icon: '✨',
		value: `${perfectPicks} pick${perfectPicks !== 1 ? 's' : ''}`,
		label: 'Most Perfect Picks',
		holder: perfectPerson || '-'
	});

	// Round 1 upsets (bottom seed beating top seed)
	const round1Series = data.rounds[0]?.serieses || [];
	const round1Upsets = round1Series.filter(s => s.bottomSeedWins === 4);
	if (round1Upsets.length > 0) {
		const upsetTeams = round1Upsets.map(s => s.bottomSeed).join(', ');
		stats.push({
			icon: '😤',
			value: `${round1Upsets.length} upset${round1Upsets.length > 1 ? 's' : ''}`,
			label: 'Round 1 Upsets',
			holder: upsetTeams
		});
	}

	return stats;
}

function renderRankChange(rp, roundIndex) {
	if (roundIndex === 0) return '';

	const change = rp.rankChange;
	if (change === null || change === 0) return '';
	const color = change > 0 ? '#28a745' : '#dc3545';
	const bgColor = change > 0 ? 'rgba(40, 167, 69, 0.15)' : 'rgba(220, 53, 69, 0.15)';
	const arrow = change > 0 ? '↑' : '↓';
	const absChange = Math.abs(change);
	const direction = change > 0 ? 'Up' : 'Down';
	const tooltip = `Rank ${direction} ${absChange} (now #${rp.rank})`;
	return `<span class="rank-change" title="${tooltip}" style="position: absolute; left: calc(50% + 1.5em + 2px); top: 50%; transform: translateY(-50%); color: ${color}; background: ${bgColor}; font-size: 0.65rem; font-weight: bold; padding: 1px 4px; border-radius: 8px; cursor: help; white-space: nowrap; font-variant-numeric: tabular-nums;">${arrow}${absChange}</span>`;
}
