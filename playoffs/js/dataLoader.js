import { fetchJson } from './httpUtils.js';

/**
 * DataLoader handles fetching playoff bracket data from either cached JSON files or the live NHL API.
 * It automatically falls back to the API if the cached file doesn't exist.
 */
export class DataLoader {
	constructor(year) {
		this.year = year;
		this.apiUrl = `https://api-web.nhle.com/v1/playoff-bracket/${year}`;
		this.cachedPath = `./data/${year}/api.json`;
	}

	async load() {
		try {
			// try to load from cached JSON file first
			console.log(`Attempting to load cached data from: ${this.cachedPath}`);
			const data = await fetchJson(this.cachedPath, true); // bust cache
			console.log(`✓ Loaded cached data for ${this.year}`);
			return data;
		} catch (err) {
			// If cached file doesn't exist, fetch from live API
			console.log(`Cached file not found, fetching from live API: ${this.apiUrl}`);
			try {
				// Use a CORS proxy to bypass browser security restrictions
				const corsProxy = 'https://corsproxy.io/?';
				const data = await fetchJson(corsProxy + encodeURIComponent(this.apiUrl));
				console.log(`✓ Successfully fetched live data for ${this.year}`);
				return data;
			} catch (apiErr) {
				throw new Error(`Failed to load data from both cache and API afor ${this.year}`, apiErr);
			}
		}
	}
}
