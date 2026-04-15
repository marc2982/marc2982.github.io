import { GOOGLE_SCRIPT_URL, DEBUG_MODE } from './config.js';
import { DataLoader } from './dataLoader.js';
import { NhlApiHandler } from './nhlApiHandler.js';
import { ALL_SERIES, Series, WINNER_MAP } from './models.js';
import { PEOPLE } from './constants.js';

// Determine year (auto-detect based on current date)
const CURRENT_YEAR = (function () {
	const now = new Date();
	const year = now.getFullYear();
	// If it's September (month 8) or later, we're looking ahead to next year's playoffs
	return now.getMonth() >= 8 ? year + 1 : year;
})();
let activeRound = 1;

$(document).ready(async function () {
	$('#season-subtitle').text(`NHL Playoffs ${CURRENT_YEAR}`);
	await init();
});

async function init() {
	// Populate Names
	const nameSelect = $('#username');
	PEOPLE.forEach((name) => {
		nameSelect.append(`<option value="${name}">${name}</option>`);
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
			$('#matchups-container').html(`<div class="info">The ${CURRENT_YEAR}-${CURRENT_YEAR + 1} playoffs haven't started yet.</div>`);
			return;
		}

		// Determine target round
		const activeSeries = seriesList.filter(
			(s) => s.topSeed && s.topSeed !== 'undefined' && s.bottomSeed && s.bottomSeed !== 'undefined',
		);

		if (activeSeries.length > 0) {
			const seriesToRound = {};
			ALL_SERIES.forEach((roundLetters, roundIdx) => {
				roundLetters.forEach((letter) => (seriesToRound[letter] = roundIdx));
			});

			let maxRoundIdx = -1;
			activeSeries.forEach((s) => {
				const rIdx = seriesToRound[s.letter];
				if (rIdx > maxRoundIdx) maxRoundIdx = rIdx;
			});

			const targetRoundLetters = ALL_SERIES[maxRoundIdx];
			activeRound = maxRoundIdx + 1;
			const targetRoundSeries = activeSeries.filter((s) => seriesToRound[s.letter] === maxRoundIdx);

			// Fetch schedules for active series in this round + the lead series for unlocking logic
			const leadSeriesLetter = targetRoundLetters[0];
			const lettersToFetch = [...new Set([...targetRoundSeries.map((s) => s.letter), leadSeriesLetter])];
			await apiHandler.fetchSchedules(lettersToFetch);

			renderMatchups(seriesList, teams, maxRoundIdx);
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
                <p>Picks open 3 days before the first game of the round. The NHL hasn't announced the schedule yet, so check back later!</p>
            </div>
        `;
	}
}

function renderMatchups(seriesList, teamsObjects, targetRoundIdx) {
	const container = $('#matchups-container');
	container.empty();

	if (targetRoundIdx === -1) {
		container.html('<div class="info">No active matchups found. The bracket might not be set yet.</div>');
		return;
	}

	const seriesToRound = {};
	ALL_SERIES.forEach((roundLetters, roundIdx) => {
		roundLetters.forEach((letter) => (seriesToRound[letter] = roundIdx));
	});

	const targetSeries = seriesList.filter((s) => seriesToRound[s.letter] === targetRoundIdx);

	// 1. Check if Round is Open (3 days before Lead Series)
	const leadSeriesLetter = ALL_SERIES[targetRoundIdx][0];
	const leadSeries = seriesList.find((s) => s.letter === leadSeriesLetter);

	// Strictly require startTimeUTC. If missing, it's either TBD or a projection (not open yet).
	const isRoundOpen = !!(leadSeries && leadSeries.startTimeUTC && Series.isRoundOpen(leadSeries.startTimeUTC));

	if (!isRoundOpen) {
		if (leadSeries && leadSeries.startTimeUTC) {
			const unlockDate = new Date(new Date(leadSeries.startTimeUTC).getTime() - 3 * 24 * 60 * 60 * 1000);
			const monthStr = unlockDate.toLocaleString('default', { month: 'short' });
			const dayStr = String(unlockDate.getDate()).padStart(2, '0');
			let hr = unlockDate.getHours();
			const ampm = hr >= 12 ? 'pm' : 'am';
			hr = hr % 12 || 12;
			const formattedDate = `${unlockDate.getFullYear()}-${monthStr}-${dayStr} at ${hr}${ampm}`;

			container.html(getNotOpenHtml(formattedDate));
		} else {
			// No schedule at all = Case for projections or very early season
			container.html(getNotOpenHtml());
		}
		$('#submit-picks').prop('disabled', true).text('Locked');
		return;
	}

	// 2. Render Cards
	let allLocked = true;
	let hasContingency = false;
	targetSeries.forEach((s) => {
		const isParticipantSet = s.topSeed && s.topSeed !== 'undefined' && s.bottomSeed && s.bottomSeed !== 'undefined';

		if (isParticipantSet) {
			const topTeam = teamsObjects[s.topSeed] || { logo: '', rank: 'Top' };
			const botTeam = teamsObjects[s.bottomSeed] || { logo: '', rank: 'Bot' };

			const hasStarted = s.isLocked() || s.topSeedWins > 0 || s.bottomSeedWins > 0;
			if (!hasStarted) allLocked = false;

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

				// Check if any could have started (though TBD usually means not started)
				const hasStarted = s.isLocked() || s.topSeedWins > 0 || s.bottomSeedWins > 0;
				if (!hasStarted) allLocked = false;
			}
		}
	});

	if (allLocked) {
		$('#submit-picks').prop('disabled', true).text('Round Locked');
	} else {
		$('#submit-picks').prop('disabled', false).text('Submit Picks');
		attachEventHandlers();
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
	const hasStarted = series.isLocked() || series.topSeedWins > 0 || series.bottomSeedWins > 0;
	const disabledClass = hasStarted ? 'style="pointer-events: none; opacity: 0.7;"' : '';
	const lockBadge = hasStarted ? '<div class="lock-badge">🔒 Locked</div>' : '';
	const contingencyBadge = isContingency
		? '<div class="contingency-badge" style="background: #e2f3ff; font-size: 0.7em; padding: 2px 5px; border-radius: 4px; color: #004085; display: inline-block; margin-left:8px;">Projected</div>'
		: '';

	const desc = isContingency ? `${topTeamShort} vs ${bottomTeamShort}` : series.getShortDesc();

	return `
        <div class="matchup ${hasStarted ? 'locked' : ''} ${isContingency ? 'contingency' : ''}" 
             data-series="${series.letter}" 
             data-contingency="${isContingency}"
             data-top="${topTeamShort}"
             data-bot="${bottomTeamShort}"
             ${disabledClass}>
            <div class="matchup-header">
                <span>${desc} ${contingencyBadge}</span>
                <span>${isContingency ? 'Draft ' : ''}Series ${series.letter} ${lockBadge}</span>
            </div>
            <div class="teams">
                <div class="team" data-team="${topTeamShort}">
                    <div class="team-logo">
                        <img src="${topTeam.logo}" alt="${topTeamShort}" onerror="this.style.display='none'">
                    </div>
                    <span class="team-name">${topTeamShort}</span>
                    <span class="team-seed">${topTeam.rank}</span>
                </div>
                <div class="vs">VS</div>
                <div class="team" data-team="${bottomTeamShort}">
                    <div class="team-logo">
                         <img src="${bottomTeam.logo}" alt="${bottomTeamShort}" onerror="this.style.display='none'">
                    </div>
                    <span class="team-name">${bottomTeamShort}</span>
                    <span class="team-seed">${bottomTeam.rank}</span>
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

	$('.matchup').each(function () {
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

	// Send
	try {
		const response = await fetch(GOOGLE_SCRIPT_URL, {
			method: 'POST',
			body: JSON.stringify(payload),
		});

		const json = await response.json();

		if (json.result === 'success') {
			showStatus('Success! Your picks have been submitted.', 'success');
		} else {
			showStatus('Error: ' + json.error, 'error');
		}
	} catch (e) {
		console.error(e);
		// If using no-cors or if network fails
		showStatus(
			'Submitted! (Note: If you are seeing this, check with Admin to confirm it went through. You might have a network issue or CORS issue.)',
			'success',
		);
	} finally {
		btn.prop('disabled', false).text('Submit Picks');
	}
}

function showStatus(msg, type) {
	$('#status-message').text(msg).addClass(type).show();
}
