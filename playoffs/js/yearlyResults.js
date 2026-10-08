import { TEAMS } from './constants.js';
import { fetchJson, fetchText } from './httpUtils.js';
import { showGlobalError } from './errorOverlay.js';
import { getRealYears, toNameList } from './common.js';
import { personChip, personChips, teamChip } from './badges.js';
import { heroStats } from './homeStats.js';
import { escapeHtml as esc } from './html.js';

// Hue per decade (1990s, 2000s, 2010s, 2020s, ...) used for the row tint and left stripe.
const DECADE_HUES = [35, 170, 275, 230, 330, 100];
function decadeHue(decade) {
	const n = DECADE_HUES.length;
	return DECADE_HUES[((((decade - 1990) / 10) % n) + n) % n];
}

// Chips on one line, so rows keep a constant height when a year has several winners/losers.
function chipRow(names, role) {
	return `<span class="chip-row${names.length > 1 ? ' multi' : ''}">${personChips(names, role)}</span>`;
}

// Detects current season phase and updates the progress-state span.
async function updateProgressState(year) {
	const el = document.getElementById(`progress-state-${year}`);
	if (!el) return;

	try {
		const api = await fetchJson(`./data/archive/${year}/api.json`);
		const isProjected = api?.bracketTitle?.default?.includes('Started Today');

		if (isProjected || !api?.series) {
			el.textContent = '⏳ Awaiting Matchups';
			return;
		}

		// Check if any picks have been submitted
		let hasPicks = false;
		try {
			await fetchText(`./data/archive/${year}/round1.csv`);
			hasPicks = true;
		} catch (e) {
			if (e.message !== 'NOT_FOUND') throw e;
		}

		if (!hasPicks) {
			el.textContent = '📋 Gathering Picks';
			return;
		}

		// Check if the first game has actually started
		const seriesLetters = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
		let earliestStart = null;
		for (const letter of seriesLetters) {
			try {
				const schedule = await fetchJson(`./data/archive/${year}/schedule_${letter}.json`);
				if (schedule?.games?.[0]?.startTimeUTC) {
					const gameStart = new Date(schedule.games[0].startTimeUTC);
					if (!earliestStart || gameStart < earliestStart) {
						earliestStart = gameStart;
					}
				}
			} catch {
				// Schedule not available yet, skip
			}
		}

		if (earliestStart && new Date() >= earliestStart) {
			el.textContent = '🏒 Watching Hockey';
		} else {
			el.textContent = '📋 Gathering Picks';
		}
	} catch (e) {
		if (e.message === 'NOT_FOUND') {
			el.textContent = '⏳ Awaiting Matchups';
		} else {
			console.warn('Could not determine progress state:', e);
		}
	}
}

/** Reigning champion / wooden spoon / title leader tiles above the results table. */
function renderHero(container, years) {
	const hero = heroStats(years);
	if (!container || !hero) return;
	const pts = (p) => (p === null ? '' : `<span class="hero-pts">${p} pts</span>`);
	container.innerHTML = `
		<div class="hero-strip">
			<div class="hero-tile hero-champ">
				<div class="hero-label">Reigning champion · ${hero.year}</div>
				<div class="hero-main">${personChips(hero.winners, 'winner')}${pts(hero.winnerPoints)}</div>
				<div class="hero-sub"><span class="hero-sub-label">Cup</span>${teamChip(hero.cupWinner)}</div>
			</div>
			<div class="hero-tile">
				<div class="hero-label">Wooden spoon · ${hero.year}</div>
				<div class="hero-main">${personChips(hero.losers, 'loser')}${pts(hero.loserPoints)}</div>
			</div>
			<div class="hero-tile">
				<div class="hero-label">Most titles all-time</div>
				<div class="hero-main">${hero.titleLeaders.map((n) => personChip(n)).join('')}<span class="hero-pts">${hero.titleLeaderCount} 🏆</span></div>
			</div>
		</div>`;
}

/** Expands / collapses a row's recap (the year's overall roast), loaded on first open. */
async function toggleRecap(row, year, button) {
	const existing = row.nextElementSibling;
	if (existing && existing.classList.contains('roast-row')) {
		const open = existing.classList.toggle('roast-hidden') === false;
		button.setAttribute('aria-expanded', String(open));
		button.textContent = open ? '▾' : '▸';
		return;
	}
	const detail = document.createElement('tr');
	detail.className = 'roast-row';
	detail.dataset.decade = row.dataset.decade;
	detail.style.setProperty('--dh', row.style.getPropertyValue('--dh'));
	const cell = detail.insertCell();
	cell.colSpan = 4;
	cell.innerHTML = '<div class="roast-body"><em>Loading recap…</em></div>';
	row.after(detail);
	button.setAttribute('aria-expanded', 'true');
	button.textContent = '▾';
	let text = '';
	try {
		const data = await fetchJson(`./data/archive/${year}/summaries.json`);
		text = data.overall || '';
	} catch {
		text = '';
	}
	const body = cell.querySelector('.roast-body');
	body.innerHTML = `${text ? `<p>${esc(text)}</p>` : '<p><em>No recap on file for this year.</em></p>'}<a href="year.html?year=${year}">Open ${year} →</a>`;
}

export async function yearlyResults(resultsTable) {
	try {
		// Load yearly index
		const yearlyIndex = await fetchJson('./data/summaries/yearly_index.json');

		// Convert to array and sort by year descending
		const years = getRealYears(yearlyIndex).sort((a, b) => b.year - a.year);
		renderHero(document.getElementById('hero'), years);

		let thead = document.createElement('thead');
		resultsTable.append(thead);

		let headerRow = thead.insertRow();
		headerRow.insertCell().outerHTML = '<th>Year</th>';
		headerRow.insertCell().outerHTML = '<th>Pool Winner(s)</th>';
		headerRow.insertCell().outerHTML = '<th>Pool Loser(s)</th>';
		headerRow.insertCell().outerHTML = '<th>Cup Winner</th>';

		let tbody = document.createElement('tbody');
		resultsTable.append(tbody);

		years.forEach((yearData) => {
			const poolWinner = yearData.poolWinner || '-';
			const poolLoser = yearData.poolLoser || '-';
			const cupWinner = yearData.cupWinner || '';

			const isCurrentProgress = poolWinner === 'In Progress';
			const isLockout = cupWinner === 'LOCKOUT';
			const shouldSpan = isCurrentProgress || isLockout;

			const poolWinners = toNameList(poolWinner);
			const poolLosers = toNameList(poolLoser);
			const poolWinnersHtml = isCurrentProgress
				? `<span id="progress-state-${yearData.year}">In Progress</span>`
				: chipRow(poolWinners, 'winner');

			var row = tbody.insertRow();
			if (isLockout) {
				row.classList.add('year-dimmed');
			}

			const hasLink = yearData.year >= 1997 && yearData.year !== 2005 && yearData.year !== 2013;
			if (hasLink) {
				row.classList.add('clickable-row');
				row.addEventListener('click', () => {
					window.location.href = 'year.html?year=' + yearData.year;
				});
			}
			
			if (yearData.year % 10 === 9) row.classList.add('decade-start');
			const decade = Math.floor(yearData.year / 10) * 10;
			row.dataset.decade = String(decade);
			row.style.setProperty('--dh', String(decadeHue(decade)));

			const toggle = hasLink
				? '<button class="roast-toggle" type="button" aria-expanded="false" aria-label="Show ' + yearData.year + ' recap" title="Show recap">▸</button>'
				: '';
			row.insertCell().outerHTML = '<td data-label="Year">' + toggle + '<span class="year-badge">' + yearData.year + '</span></td>';
			const statusHtml = isLockout ? esc(TEAMS[cupWinner] || cupWinner) : poolWinnersHtml;
			row.insertCell().outerHTML = '<td data-label="Winner" class="' + (shouldSpan ? 'status-span' : '') + '">' + statusHtml + '</td>';
			row.insertCell().outerHTML = '<td data-label="Last place">' + (shouldSpan ? '' : chipRow(poolLosers, 'loser')) + '</td>';
			row.insertCell().outerHTML = '<td data-label="Cup winner">' + (shouldSpan ? '' : teamChip(cupWinner)) + '</td>';

			if (hasLink) {
				const button = row.querySelector('.roast-toggle');
				button.addEventListener('click', (e) => {
					e.stopPropagation();
					toggleRecap(row, yearData.year, button);
				});
			}

			if (isCurrentProgress) {
				updateProgressState(yearData.year);
			}
		});

		resultsTable.DataTable({
			info: false,
			order: [[0, 'desc']],
			ordering: false,
			paging: false,
			searching: false,
		});

	} catch (e) {
		console.error("Critical home page rendering error:", e);
		showGlobalError(e);
	}
}
