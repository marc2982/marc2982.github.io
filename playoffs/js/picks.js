import { GOOGLE_SCRIPT_URL, DEBUG_MODE } from './config.js';
import { DataLoader } from './dataLoader.js';
import { NhlApiHandler } from './nhlApiHandler.js';
import { ALL_SERIES, Series } from './models.js';
import { PEOPLE } from './constants.js';

// Determine year (auto-detect based on current date)
const CURRENT_YEAR = (function () {
	const now = new Date();
	const year = now.getFullYear();
	// If it's September (month 8) or later, we're looking ahead to next year's playoffs
	return now.getMonth() >= 8 ? year + 1 : year;
})();

$(document).ready(async function () {
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
			$('#matchups-container').html(`<div class="info">${getSeasonStr(true)}</div>`);
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
			const targetRoundSeries = activeSeries.filter((s) => seriesToRound[s.letter] === maxRoundIdx);

			// Fetch schedules for active series in this round + the lead series for unlocking logic
			const leadSeriesLetter = targetRoundLetters[0];
			const lettersToFetch = [...new Set([...targetRoundSeries.map((s) => s.letter), leadSeriesLetter])];
			await apiHandler.fetchSchedules(lettersToFetch);

			renderMatchups(seriesList, teams, maxRoundIdx);
		} else {
			// Bracket not set yet
			$('#matchups-container').html(`<div class="info">${getSeasonStr(false)}</div>`);
		}
	} catch (e) {
		console.error('Failed to load data', e);
		if (e.message === 'PLAYOFFS_NOT_STARTED') {
			$('#matchups-container').html(`<div class="info">${getSeasonStr(false)}</div>`);
		} else {
			$('#matchups-container').html(
				`<div class="error">Failed to load playoff data, please let Marc know!</div>`,
			);
		}
	}

	$('#submit-picks').on('click', handleSubmit);
}

function getSeasonStr(isNextSeason) {
	const startYear = isNextSeason ? CURRENT_YEAR : CURRENT_YEAR - 1;
	return `${startYear}-${startYear + 1} playoffs haven't started yet.`;
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
			container.html(`
                <div class="intro-card" style="background-color: #e2f3ff; color: #004085; border-color: #b8daff;">
                    <h3>🔒 Picks Not Open Yet</h3>
                    <p>Picks for this round will open on <b>${unlockDate.toLocaleDateString()} at ${unlockDate.toLocaleTimeString()}</b> (3 days before the first game).</p>
                </div>
            `);
		} else {
			// No schedule at all = Case for projections or very early season
			container.html(`<div class="info">${getSeasonStr(false)}</div>`);
		}
		$('#submit-picks').prop('disabled', true).text('Locked');
		return;
	}

	// 2. Render Cards
	let allLocked = true;
	targetSeries.forEach((s) => {
		const isParticipantSet = s.topSeed && s.topSeed !== 'undefined' && s.bottomSeed && s.bottomSeed !== 'undefined';

		if (!isParticipantSet) {
			// Skip for now, Phase 2 will handle contingency cards
			return;
		}

		// Look up full team objects for logos/ranks
		const topTeam = teamsObjects[s.topSeed] || { logo: '', rank: 'Top' };
		const botTeam = teamsObjects[s.bottomSeed] || { logo: '', rank: 'Bot' };

		// SMART LOCKING: Check if individual series started
		// Also check wins as fallback
		const hasStarted = s.isLocked() || s.topSeedWins > 0 || s.bottomSeedWins > 0;
		if (!hasStarted) allLocked = false;

		const disabledClass = hasStarted ? 'style="pointer-events: none; opacity: 0.7;"' : '';
		const lockBadge = hasStarted ? '<div class="lock-badge">🔒 Locked</div>' : '';

		const html = `
            <div class="matchup ${hasStarted ? 'locked' : ''}" data-series="${s.letter}" ${disabledClass}>
                <div class="matchup-header">
                    <span>${s.getShortDesc()}</span>
                    <span>Series ${s.letter} ${lockBadge}</span>
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

	if (allLocked) {
		$('#submit-picks').prop('disabled', true).text('Round Locked');
	} else {
		$('#submit-picks').prop('disabled', false).text('Submit Picks');
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
