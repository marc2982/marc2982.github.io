import { loadAndProcessCsvs } from './main.js';
import { fetchJson } from './httpUtils.js';
import JSZip from 'https://cdn.skypack.dev/jszip';

export async function loadAvailableYears() {
	try {
		const years = await fetchJson('./data/years.json');
		return years; // Already sorted in descending order
	} catch (error) {
		console.error('Error loading years.json:', error);
		return [];
	}
}

export async function buildYearSummary(year) {
	console.log(`Building ${year}...`);

	// Use existing loadAndProcessCsvs function
	const dataPath = `./data/archive/${year}`;
	const summary = await loadAndProcessCsvs(year, dataPath);

	// Serialize to JSON
	const json = JSON.stringify(summary, null, 2);

	// Trigger download
	downloadFile(`${year}.json`, json);

	console.log(`✅ ${year}.json generated`);
	return summary;
}

export async function buildYearlyIndex() {
	console.log('Building yearly index...');

	const years = await loadAvailableYears();
	const index = {};

	// Load each year's summary from summaries directory
	for (const year of years) {
		try {
			const summary = await fetchJson(`./data/summaries/${year}.json`, true); // bust cache

			// Extract points
			const points = {};
			if (summary.personSummaries) {
				for (const [person, data] of Object.entries(summary.personSummaries)) {
					points[person] = data.points;
				}
			}

			// Extract minimal data for index
			index[year] = {
				year: parseInt(year),
				poolWinner: summary.tiebreakInfo?.winner || summary.winners?.[0] || null,
				poolLoser: summary.losers?.[0] || null,
				cupWinner: getCupWinner(summary),
				tiebreaker: summary.tiebreakInfo?.winner ? summary.tiebreakInfo : null,
				points: points,
			};
		} catch (error) {
			console.warn(`Skipping ${year} (not found in summaries):`, error.message);
		}
	}

	const json = JSON.stringify(index, null, 2);
	downloadFile('yearly_index.json', json);

	console.log(`✅ yearly_index.json generated with ${Object.keys(index).length} years`);
}

function getCupWinner(summary) {
	// First check if cupWinner is directly on the summary (for manual summaries)
	if (summary.cupWinner) {
		return summary.cupWinner;
	}

	// Otherwise, get the Stanley Cup winner from the final round
	const finalRound = summary.rounds?.find((r) => r.number === 4);
	if (!finalRound) return null;

	const scfSeries = finalRound.serieses?.[0];
	if (!scfSeries) return null;

	// Check who won
	if (scfSeries.topSeedWins === 4) {
		return scfSeries.topSeed;
	} else if (scfSeries.bottomSeedWins === 4) {
		return scfSeries.bottomSeed;
	}

	return null;
}

function downloadFile(filename, content) {
	const blob = new Blob([content], { type: 'application/json' });
	const url = URL.createObjectURL(blob);
	const a = document.createElement('a');
	a.href = url;
	a.download = filename;
	document.body.appendChild(a);
	a.click();
	document.body.removeChild(a);
	URL.revokeObjectURL(url);
}

// UI Functions
export async function initializeBuilder() {
	const years = await loadAvailableYears();
	const $select = $('#yearSelect');
	if (years.length > 0) {
		$select.html(years.map((year) => `<option value="${year}">${year}</option>`).join(''));
	} else {
		$select.html('<option value="">No years found</option>');
	}
}

export async function handleBuildYear() {
	const year = $('#yearSelect').val();
	if (!year) {
		showStatus('Please select a year', 'error');
		return;
	}

	showStatus(`Building ${year}...`, 'info');
	setButtonsEnabled(false);

	try {
		await buildYearSummary(year);
		showStatus(`✅ ${year}.json built successfully! Check your downloads folder.`, 'success');
	} catch (error) {
		showStatus(`❌ Error building ${year}: ${error.message}`, 'error');
		console.error(error);
	} finally {
		setButtonsEnabled(true);
	}
}

export async function handleBuildAllYears() {
	showStatus('Building all years...', 'info');
	setButtonsEnabled(false);

	const years = await loadAvailableYears();
	const jsonFiles = {};
	let successCount = 0;
	let failCount = 0;

	for (const year of years) {
		try {
			showStatus(`Building ${year}... (${successCount + failCount + 1}/${years.length})`, 'info');

			const dataPath = `./data/archive/${year}`;
			const summary = await loadAndProcessCsvs(year, dataPath);
			const json = JSON.stringify(summary, null, 2);

			jsonFiles[`${year}.json`] = json;
			successCount++;
		} catch (error) {
			console.error(`Failed to build ${year}:`, error);
			failCount++;
		}
	}

	// Create ZIP file
	showStatus('Creating ZIP file...', 'info');
	const zip = new JSZip();

	for (const [filename, content] of Object.entries(jsonFiles)) {
		zip.file(filename, content);
	}

	const blob = await zip.generateAsync({ type: 'blob' });
	const url = URL.createObjectURL(blob);
	const $a = $('<a>')
		.attr({
			href: url,
			download: 'yearly-summaries.zip',
		})
		.appendTo('body');
	$a[0].click();
	$a.remove();
	URL.revokeObjectURL(url);

	showStatus(`✅ Built ${successCount} years. ${failCount} failed. Downloaded yearly-summaries.zip`, 'success');
	setButtonsEnabled(true);
}

export async function handleBuildIndex() {
	showStatus('Generating yearly index...', 'info');
	setButtonsEnabled(false);

	try {
		await buildYearlyIndex();
		showStatus('✅ yearly_index.json generated successfully! Check your downloads folder.', 'success');
	} catch (error) {
		showStatus(`❌ Error generating index: ${error.message}`, 'error');
		console.error(error);
	} finally {
		setButtonsEnabled(true);
	}
}

function showStatus(message, type) {
	$('#status').text(message).attr('class', type).show();
}

function setButtonsEnabled(enabled) {
	$('#buildYearBtn, #buildAllBtn, #buildIndexBtn').prop('disabled', !enabled);
}
