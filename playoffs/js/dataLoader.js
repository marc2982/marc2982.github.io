/**
 * DataLoader handles fetching playoff bracket data from either cached JSON files or the live NHL API.
 * It automatically falls back to the API if the cached file doesn't exist.
 */
export class DataLoader {
	constructor(year) {
		this.year = year;
		this.apiUrl = `https://api-web.nhle.com/v1/playoff-bracket/${year}`;
		// append timestamp to prevent caching
		this.cachedPath = `./data/${year}/api.json` + '?timestamp=' + new Date().getTime();
	}

	async load() {
		try {
			// Try to load from cached JSON file first
			console.log(`Attempting to load cached data from: ${this.cachedPath}`);
			const data = await $.getJSON(this.cachedPath);
			console.log(`✓ Loaded cached data for ${this.year}`);
			return data;
		} catch (err) {
			// If cached file doesn't exist, fetch from live API
			console.log(`Cached file not found, fetching from live API: ${this.apiUrl}`);
			try {
				const data = await $.getJSON(this.apiUrl);
				console.log(`✓ Successfully fetched live data for ${this.year}`);
				return data;
			} catch (apiErr) {
				throw new Error(`Failed to load data from both cache and API afor ${this.year}`, apiErr);
			}
		}
	}
}
