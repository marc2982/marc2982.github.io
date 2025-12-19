import { fetchJson } from './httpUtils.js';

/**
 * DataLoader handles fetching playoff bracket data from either cached JSON files or the live NHL API.
 * It automatically falls back to the API if the cached file doesn't exist.
 */
export class DataLoader {
	constructor(year, basePath = './data/archive/') {
		this.year = year;
		this.apiUrl = `https://api-web.nhle.com/v1/playoff-bracket/${year}`;
		this.cachedPath = `${basePath}${year}/api.json`;
	}

	async load() {
		try {
			// try to load from cached JSON file first
			console.log(`Attempting to load cached data from: ${this.cachedPath}`);
			return await fetchJson(this.cachedPath, true); // bust cache
		} catch (err) {
			// If cached file doesn't exist, fetch from live API
			console.log(`Cached file not found, fetching from live API: ${this.apiUrl}`);
			return await this._fetchApi(this.apiUrl);
		}
	}

	async fetchSeriesSchedule(year, seriesLetter) {
		const season = `${year - 1}${year}`;
		const url = `https://api-web.nhle.com/v1/schedule/playoff-series/${season}/${seriesLetter}`;
		console.log(`Fetching series schedule for ${seriesLetter}: ${url}`);
		return await this._fetchApi(url);
	}

	/**
	 * Internal helper to fetch from the NHL API using a CORS proxy.
	 */
	async _fetchApi(url) {
		try {
			const corsProxy = 'https://corsproxy.io/?';
			return await fetchJson(corsProxy + encodeURIComponent(url));
		} catch (err) {
			console.error(`API fetch failed for ${url}:`, err);
			return null;
		}
	}
}
