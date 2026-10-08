import { escapeHtml as esc } from './html.js';
import { GOOGLE_SCRIPT_URL, DEBUG_MODE } from './config.js';
import { DataLoader } from './dataLoader.js';
import { NhlApiHandler } from './nhlApiHandler.js';
import { WINNER_MAP } from './models.js';
import { picksYear, highestActiveRound, lettersToFetch, pickTargetRound, roundPicksState, roundIndexOf, hasTeams } from './picksStatus.js';
import { PEOPLE } from './constants.js';

// Picks season (auto-detected; shared with the home page button, see picksStatus.js)
const CURRENT_YEAR = picksYear();
let activeRound = 1;

// Late-pass mode (?late=1): lets someone Marc has approved submit for series that already started.
// The server only accepts it if their name is listed in the LATE_PASSES script property.
const LATE_MODE = new URLSearchParams(window.location.search).get('late') === '1';

function hasSeriesStarted(s) {
	if (LATE_MODE) return false;
	return s.isLocked() || s.topSeedWins > 0 || s.bottomSeedWins > 0;
}

$(document).ready(async function () {
	$('#season-subtitle').text(`NHL Playoffs ${CURRENT_YEAR}`);
	await init();
});

async function init() {
	// Populate Names
	const nameSelect = $('#username');
	PEOPLE.forEach((name) => {
		nameSelect.append(`<option value="${esc(name)}">${esc(name)}</option>`);
	});

	const loader = new DataLoader(CURRENT_YEAR);
	const apiHandler = new NhlApiHandler(CURRENT_YEAR, loader);

	try {
		await apiHandler.load();
		const teams = apiHandler.getTeams();
		const seriesList = apiHandler.getSeriesList();

		// Check if playoffs are complete (SCF is over)
		const scf = seriesList.find((s) => s.letter === 'O');
		const isComplete = scf && scf.isOver();

		if (isComplete) {
			$('#matchups-container').html(
				`<div class="info">The ${CURRENT_YEAR}-${CURRENT_YEAR + 1} playoffs haven't started yet.</div>`,
			);
			return;
		}

		// Determine target round (shared with the home page button, see picksStatus.js)
		const maxRoundIdx = highestActiveRound(seriesList);

		if (maxRoundIdx >= 0) {
			await apiHandler.fetchSchedules(lettersToFetch(maxRoundIdx));
			const targetRoundIdx = pickTargetRound(seriesList);
			activeRound = targetRoundIdx + 1;
			renderMatchups(seriesList, teams, targetRoundIdx, apiHandler);
		} else {
			// Bracket not set yet
			$('#matchups-container').html(getNotOpenHtml());
		}
	} catch (e) {
		console.error('Failed to load data', e);
		if (e.message === 'PLAYOFFS_NOT_STARTED') {
			$('#matchups-container').html(getNotOpenHtml());
		} else {
			$('#matchups-container').html(
				`<div class="error">Failed to load playoff data, please let Marc know!</div>`,
			);
		}
	}

	$('#submit-picks').on('click', handleSubmit);
}

function getNotOpenHtml(unlockDateStr) {
	if (unlockDateStr) {
		return `
            <div class="intro-card" style="background-color: #e2f3ff; color: #004085; border-color: #b8daff;">
                <h3>🔒 Picks Not Open Yet</h3>
                <p>Picks for this round will open on <b>${unlockDateStr}</b> (3 days before the first game).</p>
            </div>
        `;
	} else {
		return `
            <div class="intro-card" style="background-color: #e2f3ff; color: #004085; border-color: #b8daff;">
                <h3>🔒 Picks Not Open Yet</h3>
                <p>Picks open once the matchups are announced and 3 (or fewer) days exist before the first game of the round.</p>
            </div>
        `;
	}
}

function renderMatchups(seriesList, teamsObjects, targetRoundIdx, apiHandler) {
	const container = $('#matchups-container');
	container.empty();

	if (targetRoundIdx === -1) {
		container.html('<div class="info">No active matchups found. The bracket might not be set yet.</div>');
		return;
	}

	const targetSeries = seriesList.filter((s) => roundIndexOf(s.letter) === targetRoundIdx);

	// 1. Check if Round is Open (3 days before chronological Lead Series); see picksStatus.js
	const roundState = roundPicksState(seriesList, targetRoundIdx, new Date(), { late: LATE_MODE });

	if (roundState.state === 'not-open') {
		if (roundState.unlockDate) {
			const unlockDate = roundState.unlockDate;
			const weekdayStr = unlockDate.toLocaleString('default', { weekday: 'long' });
			const monthStr = unlockDate.toLocaleString('default', { month: 'short' });
			const dayStr = unlockDate.getDate();
			let hr = unlockDate.getHours();
			const ampm = hr >= 12 ? 'pm' : 'am';
			hr = hr % 12 || 12;
			const formattedDate = `${weekdayStr}, ${monthStr} ${dayStr} @ ${hr}${ampm}`;

			container.html(getNotOpenHtml(formattedDate));
		} else {
			// No schedule at all = Case for projections or very early season
			container.html(getNotOpenHtml());
		}
		$('#submit-picks').prop('disabled', true).text('Locked');
		return;
	}

	// 2. Render Cards
	let hasContingency = false;
	targetSeries.forEach((s) => {
		if (hasTeams(s)) {
			const topTeam = teamsObjects[s.topSeed] || { logo: '', rank: 'Top' };
			const botTeam = teamsObjects[s.bottomSeed] || { logo: '', rank: 'Bot' };

			container.append(renderMatchupCard(s, s.topSeed, topTeam, s.bottomSeed, botTeam));
		} else {
			// Phase 2: Contingency Matchups
			hasContingency = true;
			const parents = WINNER_MAP[s.letter];
			if (parents) {
				const leftOptions = apiHandler.getPossibleWinners(parents[0]);
				const rightOptions = apiHandler.getPossibleWinners(parents[1]);

				leftOptions.forEach((leftTeamShort) => {
					rightOptions.forEach((rightTeamShort) => {
						const leftTeam = teamsObjects[leftTeamShort] || { logo: '', rank: '?' };
						const rightTeam = teamsObjects[rightTeamShort] || { logo: '', rank: '?' };
						container.append(
							renderMatchupCard(s, leftTeamShort, leftTeam, rightTeamShort, rightTeam, true),
						);
					});
				});
			}
		}
	});

	if (roundState.state === 'locked') {
		$('#submit-picks').prop('disabled', true).text('Round Locked');
	} else {
		$('#submit-picks').prop('disabled', false).text('Submit Picks');
		attachEventHandlers();
	}

	if (LATE_MODE) {
		container.prepend('<div class="intro-card" style="background-color: #fff3cd; color: #856404; border-color: #ffeeba; margin-bottom: 20px;"><h3>Late pass mode</h3><p>Started series are open for you. This only works if Marc has added your name.</p></div>');
	}

	if (hasContingency) {
		container.prepend(`
            <div class="intro-card contingency-banner" style="background-color: #fff3cd; color: #856404; border-color: #ffeeba; margin-bottom: 20px;">
                <h3>⚠️ Overlapping Round</h3>
                <p>The matchups for this round are not fully decided yet! Please submit your picks for <b>all possible permutations</b> below. Only the matchup that actually occurs will be scored.</p>
            </div>
        `);
	}
}

function renderMatchupCard(series, topTeamShort, topTeam, bottomTeamShort, bottomTeam, isContingency = false) {
	const hasStarted = hasSeriesStarted(series);
	const disabledClass = hasStarted ? 'style="pointer-events: none; opacity: 0.7;"' : '';
	const lockBadge = hasStarted ? '<div class="lock-badge">🔒 Locked</div>' : '';
	const contingencyBadge = isContingency
		? '<div class="contingency-badge" style="background: #e2f3ff; font-size: 0.7em; padding: 2px 5px; border-radius: 4px; color: #004085; display: inline-block; margin-left:8px;">Projected</div>'
		: '';

	const desc = isContingency ? `${esc(topTeamShort)} vs ${esc(bottomTeamShort)}` : series.getShortDesc();

	return `
        <div class="matchup ${hasStarted ? 'locked' : ''} ${isContingency ? 'contingency' : ''}" 
             data-series="${esc(series.letter)}" 
             data-contingency="${isContingency}"
             data-top="${esc(topTeamShort)}"
             data-bot="${esc(bottomTeamShort)}"
             ${disabledClass}>
            <div class="matchup-header">
                <span>${desc} ${contingencyBadge}</span>
                <span>${isContingency ? 'Draft ' : ''}Series ${esc(series.letter)} ${lockBadge}</span>
            </div>
            <div class="teams">
                <div class="team" data-team="${esc(topTeamShort)}">
                    <div class="team-logo">
                        <img src="${esc(topTeam.logo)}" alt="${esc(topTeamShort)}" onerror="this.style.display='none'">
                    </div>
                    <span class="team-name">${esc(topTeamShort)}</span>
                    <span class="team-seed">${esc(topTeam.rank)}</span>
                </div>
                <div class="vs">VS</div>
                <div class="team" data-team="${esc(bottomTeamShort)}">
                    <div class="team-logo">
                         <img src="${esc(bottomTeam.logo)}" alt="${esc(bottomTeamShort)}" onerror="this.style.display='none'">
                    </div>
                    <span class="team-name">${esc(bottomTeamShort)}</span>
                    <span class="team-seed">${esc(bottomTeam.rank)}</span>
                </div>
            </div>
            <div class="prediction-options">
                <p>In how many games?</p>
                <div class="games-select">
                    <div class="game-option" data-games="4">4</div>
                    <div class="game-option" data-games="5">5</div>
                    <div class="game-option" data-games="6">6</div>
                    <div class="game-option" data-games="7">7</div>
                </div>
            </div>
        </div>
    `;
}

function attachEventHandlers() {
	// Select Team
	$('.team').on('click', function () {
		if (!$('#username').val()) {
			alert('Please select your name first before making your picks!');
			$('#username').focus();
			return;
		}
		if (!$('#passcode').val().trim()) {
			alert('Please enter the league passcode first before making your picks!');
			$('#passcode').focus();
			return;
		}

		const matchup = $(this).closest('.matchup');

		// Remove active from sibling
		matchup.find('.team').removeClass('selected');

		// Add active to self
		$(this).addClass('selected');

		// Show games options
		matchup.find('.prediction-options').addClass('active');
	});

	// Select Games
	$('.game-option').on('click', function () {
		if (!$('#username').val()) {
			alert('Please select your name first before making your picks!');
			$('#username').focus();
			return;
		}
		if (!$('#passcode').val().trim()) {
			alert('Please enter the league passcode first before making your picks!');
			$('#passcode').focus();
			return;
		}

		const options = $(this).closest('.games-select');
		options.find('.game-option').removeClass('selected');
		$(this).addClass('selected');
	});
}

async function handleSubmit() {
	console.log('Submit clicked');
	$('#status-message').hide().removeClass('success error');

	// Validation
	const name = $('#username').val();
	const passcode = $('#passcode').val();

	if (!name) {
		showStatus('Please enter your name.', 'error');
		return;
	}
	if (!passcode) {
		showStatus('Please enter the league passcode.', 'error');
		return;
	}

	const picks = [];
	let isValid = true;

	$('.matchup:not(.locked)').each(function () {
		const seriesLetter = $(this).data('series');
		const isContingency = $(this).data('contingency');
		const topTeam = $(this).data('top');
		const botTeam = $(this).data('bot');
		const selectedTeam = $(this).find('.team.selected').data('team');
		const selectedGames = $(this).find('.game-option.selected').data('games');

		if (!selectedTeam || !selectedGames) {
			isValid = false;
			return false; // break loop
		}

		let finalWinner = selectedTeam;
		if (isContingency) {
			const opponent = selectedTeam === topTeam ? botTeam : topTeam;
			finalWinner = `${selectedTeam} (vs ${opponent})`;
		}

		picks.push({
			series: seriesLetter,
			winner: finalWinner,
			games: selectedGames,
		});
	});

	if (picks.length === 0 && isValid) {
		showStatus('There are no open matchups to pick.', 'error');
		return;
	}

	if (!isValid) {
		showStatus('Please make a selection (Winner + Games) for EVERY series.', 'error');
		return;
	}

	// Disable button
	const btn = $('#submit-picks');
	btn.prop('disabled', true).text('Submitting...');

	// Payload
	const payload = {
		name: name,
		passcode: passcode,
		year: CURRENT_YEAR,
		round: activeRound,
		picks: picks,
	};

	if (DEBUG_MODE) {
		console.log('Payload:', payload);
		showStatus('Debug Mode: Check console for payload. Not sent.', 'success');
		btn.prop('disabled', false).text('Submit Picks');
		return;
	}

	if (!GOOGLE_SCRIPT_URL.startsWith('http')) {
		showStatus('Configuration Error: GOOGLE_SCRIPT_URL not set in js/config.js', 'error');
		btn.prop('disabled', false).text('Submit Picks');
		return;
	}

	let success = false;
	// Send
	try {
		const response = await fetch(GOOGLE_SCRIPT_URL, {
			method: 'POST',
			body: JSON.stringify(payload),
		});

		const json = await response.json();

		if (json.result === 'success') {
			showStatus('Success! Your picks have been submitted.', 'success');
			success = true;
		} else {
			showStatus('Error: ' + (json.error || 'Unknown error'), 'error');
		}
	} catch (e) {
		console.error(e);
		// The request may or may not have reached the server; resubmitting is safe because the server rejects duplicates.
		showStatus(
			'Could not confirm your submission (network or server error). Please try again; if it says you already submitted, you are all set.',
			'error',
		);
	} finally {
		if (!success) {
			btn.prop('disabled', false).text('Submit Picks');
		} else {
			btn.text('Submitted');
		}
	}
}

function showStatus(msg, type) {
	$('#status-message').text(msg).addClass(type).show();
}
