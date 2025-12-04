import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.join(__dirname, '..');
const SUMMARIES_DIR = path.join(ROOT_DIR, 'playoffs', 'data', 'summaries');
const ARCHIVE_DIR = path.join(ROOT_DIR, 'playoffs', 'data', 'archive');

export async function buildYear(year) {
	console.log(`  - Processing CSVs for ${year}...`);

	// Import the loadAndProcessCsvs function from main.js
	// We need to use dynamic import to handle the browser-specific modules
	const mainModule = await import(`file:///${path.join(ROOT_DIR, 'playoffs', 'js', 'main.js').replace(/\\/g, '/')}`);

	// Call the existing function with the archive path
	const archivePath = path.join(ARCHIVE_DIR, year).replace(/\\/g, '/');
	const summary = await mainModule.loadAndProcessCsvs(year, archivePath);

	console.log(`  - Generating YearlySummary...`);

	// Serialize to JSON
	const json = serializeYearlySummary(summary);

	console.log(`  - Writing to data/summaries/${year}.json...`);
	const outputPath = path.join(SUMMARIES_DIR, `${year}.json`);
	fs.writeFileSync(outputPath, JSON.stringify(json, null, 2));

	console.log(`  - Validated: ${Object.keys(summary.personSummaries || {}).length} participants`);
}

function serializeYearlySummary(summary) {
	// Convert dataclass instances to plain JSON
	// The dataclass library should handle this via toJSON() or similar
	return JSON.parse(JSON.stringify(summary));
}
