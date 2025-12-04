import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { buildYear } from './build-year.js';
import { buildIndex } from './build-index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.join(__dirname, '..');
const ARCHIVE_DIR = path.join(ROOT_DIR, 'playoffs', 'data', 'archive');
const SUMMARIES_DIR = path.join(ROOT_DIR, 'playoffs', 'data', 'summaries');

async function main() {
	const args = process.argv.slice(2);
	const yearArg = args.find((arg) => !arg.startsWith('--'));
	const buildAll = args.includes('--all');

	console.log('🏒 NHL Playoffs Pool - Build System\n');

	// Ensure summaries directory exists
	if (!fs.existsSync(SUMMARIES_DIR)) {
		fs.mkdirSync(SUMMARIES_DIR, { recursive: true });
	}

	let yearsToProcess = [];

	if (yearArg) {
		// Build specific year
		yearsToProcess = [yearArg];
		console.log(`📅 Building year: ${yearArg}\n`);
	} else if (buildAll) {
		// Build all years
		yearsToProcess = getAvailableYears();
		console.log(`📅 Building all years: ${yearsToProcess.join(', ')}\n`);
	} else {
		// Auto-detect modified years
		yearsToProcess = getModifiedYears();
		if (yearsToProcess.length === 0) {
			console.log('✅ All years are up to date. Nothing to build.\n');
			return;
		}
		console.log(`📅 Detected modified years: ${yearsToProcess.join(', ')}\n`);
	}

	// Build each year
	let successCount = 0;
	let failCount = 0;

	for (const year of yearsToProcess) {
		try {
			console.log(`\n🔨 Building ${year}...`);
			await buildYear(year);
			console.log(`✅ ${year} built successfully`);
			successCount++;
		} catch (error) {
			console.error(`❌ Failed to build ${year}:`, error.message);
			failCount++;
		}
	}

	// Build index
	if (successCount > 0) {
		console.log('\n📊 Generating yearly index...');
		try {
			await buildIndex();
			console.log('✅ Index generated successfully');
		} catch (error) {
			console.error('❌ Failed to generate index:', error.message);
			failCount++;
		}
	}

	// Summary
	console.log('\n' + '='.repeat(50));
	console.log(`✅ Success: ${successCount}`);
	if (failCount > 0) {
		console.log(`❌ Failed: ${failCount}`);
	}
	console.log('='.repeat(50) + '\n');

	process.exit(failCount > 0 ? 1 : 0);
}

function getAvailableYears() {
	if (!fs.existsSync(ARCHIVE_DIR)) {
		return [];
	}
	return fs
		.readdirSync(ARCHIVE_DIR, { withFileTypes: true })
		.filter((dirent) => dirent.isDirectory())
		.map((dirent) => dirent.name)
		.filter((name) => /^\d{4}$/.test(name))
		.sort();
}

function getModifiedYears() {
	const availableYears = getAvailableYears();
	const modifiedYears = [];

	for (const year of availableYears) {
		const archiveDir = path.join(ARCHIVE_DIR, year);
		const summaryFile = path.join(SUMMARIES_DIR, `${year}.json`);

		if (!fs.existsSync(summaryFile)) {
			// JSON doesn't exist, needs building
			modifiedYears.push(year);
			continue;
		}

		// Check if any CSV is newer than the JSON
		const summaryMtime = fs.statSync(summaryFile).mtime;
		const csvFiles = fs.readdirSync(archiveDir).filter((f) => f.endsWith('.csv'));

		for (const csvFile of csvFiles) {
			const csvPath = path.join(archiveDir, csvFile);
			const csvMtime = fs.statSync(csvPath).mtime;
			if (csvMtime > summaryMtime) {
				modifiedYears.push(year);
				break;
			}
		}
	}

	return modifiedYears;
}

main().catch((error) => {
	console.error('Fatal error:', error);
	process.exit(1);
});
