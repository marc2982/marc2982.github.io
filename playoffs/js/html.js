/**
 * Escapes a value for safe interpolation into HTML text or a quoted attribute.
 * Names, team strings and LLM-written recaps all come from data files, so every
 * dynamic value that ends up in a template literal should go through this.
 */
export function escapeHtml(value) {
	if (value === null || value === undefined) return '';
	return String(value)
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');
}
