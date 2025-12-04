import { parse } from 'https://cdn.skypack.dev/@vanillaes/csv';
import { fetchText } from './httpUtils.js';

export async function loadCsv(filename) {
	try {
		const data = await fetchText(filename);
		return parse(data);
	} catch (err) {
		console.error(`Failed to load CSV file ${filename}:`, err);
		throw err;
	}
}
