import { fetchJson } from './httpUtils.js';

/**
 * DataLoader handles fetching playoff bracket data from local cached files.
 * Thanks to the GitHub Action, these files are always fresh.
 */
export class DataLoader {
	constructor(year, basePath = './data/archive/') {
		this.year = year;
		this.cachedPath = `${basePath}${year}/api.json`;
		this.basePath = basePath;
	}

	async load() {
		try {
			console.log(`Attempting to load cached data from: ${this.cachedPath}`);
			return await fetchJson(this.cachedPath, true); // bust cache
		} catch (err) {
			console.error(`Cached file not found: ${this.cachedPath}. Is the GitHub Action running?`, err);
			return null;
		}
	}

	async fetchSeriesSchedule(year, seriesLetter) {
		const schedulePath = `${this.basePath}${year}/schedule_${seriesLetter}.json`;
		console.log(`Fetching cached series schedule for ${seriesLetter}: ${schedulePath}`);
		try {
			return await fetchJson(schedulePath, true); // bust cache
		} catch {
			console.log(`No schedule found for ${seriesLetter} yet at ${schedulePath}`);
			return null;
		}
	}
}
