import { GOOGLE_SCRIPT_URL, DEBUG_MODE } from './config.js';
import { DataLoader } from './dataLoader.js';
import { NhlApiHandler } from './nhlApiHandler.js';
import { ALL_SERIES } from './models.js';

// Determine year (auto-detect or default)
const CURRENT_YEAR = 2025; // Could be dynamic, but manual update is safer for playoffs

$(document).ready(async function () {
	await init();
});

import { PEOPLE } from './constants.js';

// ... existing imports ...

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
		const teams = apiHandler.getTeams(); // Get team data including logos
		const seriesList = apiHandler.getSeriesList();
		renderMatchups(seriesList, teams);
	} catch (e) {
		console.error('Failed to load data', e);
		$('#matchups-container').html(`<div class="error">Failed to load playoff data. Please try again later.</div>`);
	}

	$('#submit-picks').on('click', handleSubmit);
}

function renderMatchups(seriesList, teamsObjects) {
	const container = $('#matchups-container');
	container.empty();

	// 1. Filter for active series
	const activeSeries = seriesList.filter(
		(s) => s.topSeed && s.topSeed !== 'undefined' && s.bottomSeed && s.bottomSeed !== 'undefined',
	);

	if (activeSeries.length === 0) {
		container.html('<div class="info">No active matchups found. The bracket might not be set yet.</div>');
		return;
	}

	// 2. Group by Round
	const seriesToRound = {};
	ALL_SERIES.forEach((roundLetters, roundIdx) => {
		roundLetters.forEach((letter) => (seriesToRound[letter] = roundIdx));
	});

	let maxRoundIdx = -1;
	activeSeries.forEach((s) => {
		const rIdx = seriesToRound[s.letter];
		if (rIdx > maxRoundIdx) maxRoundIdx = rIdx;
	});

	const targetSeries = activeSeries.filter((s) => seriesToRound[s.letter] === maxRoundIdx);

	// RESTRICTION: Check if round has started (any wins recorded)
	const hasRoundStarted = targetSeries.some((s) => s.topSeedWins > 0 || s.bottomSeedWins > 0);

	if (hasRoundStarted) {
		container.append(`
            <div class="intro-card" style="background-color: #fff3cd; color: #856404; border-color: #ffeeba;">
                <h3>⚠️ Picks Closed</h3>
                <p>This round has already started (games have been done). Submissions are currently disabled.</p>
            </div>
        `);
	}

	// 3. Render Cards
	targetSeries.forEach((s) => {
		// Look up full team objects for logos/ranks
		const topTeam = teamsObjects[s.topSeed] || { logo: '', rank: 'Top' };
		const botTeam = teamsObjects[s.bottomSeed] || { logo: '', rank: 'Bot' };

		// Disable interaction if round started
		const disabledClass = hasRoundStarted ? 'style="pointer-events: none; opacity: 0.7;"' : '';

		const html = `
            <div class="matchup" data-series="${s.letter}" ${disabledClass}>
                <div class="matchup-header">
                    <span>${s.getShortDesc()}</span>
                    <span>Series ${s.letter}</span>
                </div>
                <div class="teams">
                    <div class="team" data-team="${s.topSeed}">
                        <div class="team-logo">
                            <img src="${topTeam.logo}" alt="${s.topSeed}" onerror="this.style.display='none'">
                        </div>
                        <span class="team-name">${s.topSeed}</span>
                        <span class="team-seed">${topTeam.rank}</span>
                    </div>
                    <div class="vs">VS</div>
                    <div class="team" data-team="${s.bottomSeed}">
                        <div class="team-logo">
                             <img src="${botTeam.logo}" alt="${s.bottomSeed}" onerror="this.style.display='none'">
                        </div>
                        <span class="team-name">${s.bottomSeed}</span>
                        <span class="team-seed">${botTeam.rank}</span>
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
		container.append(html);
	});

	// Disable interaction if round started
	if (hasRoundStarted) {
		$('#submit-picks').prop('disabled', true).text('Picks Closed');
	} else {
		attachEventHandlers();
	}
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
		const selectedTeam = $(this).find('.team.selected').data('team');
		const selectedGames = $(this).find('.game-option.selected').data('games');

		if (!selectedTeam || !selectedGames) {
			isValid = false;
			return false; // break loop
		}

		picks.push({
			series: seriesLetter,
			winner: selectedTeam,
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
