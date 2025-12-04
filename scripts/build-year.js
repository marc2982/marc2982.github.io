import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.join(__dirname, '..');
const SUMMARIES_DIR = path.join(ROOT_DIR, 'playoffs', 'data', 'summaries');

export async function buildYear(year) {
	// TODO: Implement year building logic
	// This will be implemented in the next step
	console.log(`  - Processing CSVs for ${year}...`);
	console.log(`  - Fetching NHL API data...`);
	console.log(`  - Generating YearlySummary...`);
	console.log(`  - Writing to data/summaries/${year}.json...`);

	// Placeholder: Create empty JSON for now
	const outputPath = path.join(SUMMARIES_DIR, `${year}.json`);
	const placeholder = {
		year: parseInt(year),
		message: 'Placeholder - to be implemented',
	};

	fs.writeFileSync(outputPath, JSON.stringify(placeholder, null, 2));
}
