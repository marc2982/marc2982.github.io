/**
 * Shared utility functions for creating consistent table UI elements.
 */

export function createSection(container, title, explanationText) {
	const $section = $(`<div class="section-card"><h2>${title}</h2></div>`);

	if (explanationText) {
		const $explanation = $(`<p class="table-explanation">${explanationText}</p>`);
		$section.append($explanation);
	}

	container.append($section);
	return $section;
}

export function createTable(headers) {
	const $table = $('<table class="stripe"></table>');
	const $thead = $('<thead></thead>');
	const $headerRow = $('<tr></tr>');

	headers.forEach((header) => {
		$headerRow.append(`<th>${header}</th>`);
	});

	$thead.append($headerRow);
	const $tbody = $('<tbody></tbody>');

	$table.append($thead);
	$table.append($tbody);

	return { $table, $tbody };
}

export function initDataTable($table, options = {}) {
	const defaultOptions = {
		info: false,
		paging: false,
		searching: false,
	};
	$table.DataTable({ ...defaultOptions, ...options });
}
