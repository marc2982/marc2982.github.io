import { PEOPLE } from './constants.js';
import { fetchJson } from './httpUtils.js';

export async function performanceStats(tableElement) {
	// Load yearly index
	const yearlyIndex = await fetchJson('./data/summaries/yearly_index.json');
	const years = Object.values(yearlyIndex);

	// Initialize stats object for each person
	const stats = {};
	PEOPLE.forEach((person) => {
		stats[person] = {
			name: person,
			totalPoints: 0,
			yearsParticipated: 0,
			bestScore: -Infinity,
			worstScore: Infinity,
			bestYear: null,
			worstYear: null,
		};
	});

	// Process each year
	years.forEach((yearData) => {
		if (!yearData.points) return;

		Object.entries(yearData.points).forEach(([person, points]) => {
			// Skip if person not in PEOPLE list (legacy or removed people)
			if (!stats[person]) return;

			// Skip if points is null/undefined (didn't participate) or 0 (placeholder/missing data)
			if (points === undefined || points === null || points === 0) return;

			stats[person].totalPoints += points;
			stats[person].yearsParticipated++;

			if (points > stats[person].bestScore) {
				stats[person].bestScore = points;
				stats[person].bestYear = yearData.year;
			}

			if (points < stats[person].worstScore) {
				stats[person].worstScore = points;
				stats[person].worstYear = yearData.year;
			}
		});
	});

	// Calculate averages and format for table
	const tableData = Object.values(stats)
		.filter((s) => s.yearsParticipated > 0) // Only show people who have participated
		.map((s) => ({
			name: s.name,
			average: (s.totalPoints / s.yearsParticipated).toFixed(1),
			best: `${s.bestScore} (${s.bestYear})`,
			worst: `${s.worstScore} (${s.worstYear})`,
			years: s.yearsParticipated,
		}));

	// Build Table Header
	let thead = document.createElement('thead');
	tableElement.append(thead);
	let headerRow = thead.insertRow();
	headerRow.insertCell().outerHTML = '<th>Person</th>';
	headerRow.insertCell().outerHTML = '<th>Avg Points</th>';
	headerRow.insertCell().outerHTML = '<th>Best Score</th>';
	headerRow.insertCell().outerHTML = '<th>Worst Score</th>';
	headerRow.insertCell().outerHTML = '<th>Years Played</th>';

	// Build Table Body
	let tbody = document.createElement('tbody');
	tableElement.append(tbody);

	tableData.forEach((row) => {
		let tr = tbody.insertRow();
		tr.insertCell().textContent = row.name;
		tr.insertCell().textContent = row.average;
		tr.insertCell().textContent = row.best;
		tr.insertCell().textContent = row.worst;
		tr.insertCell().textContent = row.years;
	});

	// Initialize DataTable
	tableElement.DataTable({
		info: false,
		paging: false,
		searching: false,
		order: [[1, 'desc']], // Sort by Average Points by default
	});
}
