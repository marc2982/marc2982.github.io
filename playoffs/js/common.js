import { fetchJson } from './httpUtils.js';

export function excelRank(values, target) {
	const sortedValues = [...values].sort((a, b) => b - a);
	for (let i = 0; i < sortedValues.length; i++) {
		if (sortedValues[i] === target) {
			return i + 1;
		}
	}
	throw new Error('cant calculate excel ranking');
}

export async function loadYearlyIndex() {
	return await fetchJson('./data/summaries/yearly_index.json');
}

export async function loadAllYearsDetailed() {
	const yearlyIndex = await loadYearlyIndex();
	const yearList = Object.keys(yearlyIndex).filter((y) => parseInt(y) > 0);
	const results = [];

	for (const year of yearList) {
		try {
			const summary = await fetchJson(`./data/summaries/${year}.json`);
			results.push({ year, summary, indexData: yearlyIndex[year] });
		} catch (error) {
			console.warn(`Failed to load ${year}.json:`, error);
		}
	}
	return { yearlyIndex, yearList, results };
}
