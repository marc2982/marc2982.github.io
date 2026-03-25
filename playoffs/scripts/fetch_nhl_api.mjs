import fs from 'fs';
import path from 'path';

const API_BASE_URL = 'https://api-web.nhle.com/v1';

async function fetchJsonSafely(url) {
    const res = await fetch(url);
    if (!res.ok) {
        if (res.status === 404) return null;
        throw new Error(`HTTP ${res.status} on ${url}`);
    }
    return res.json();
}

async function run() {
    // Determine the root data directory based on whether we are in the root repo or the playoffs directory
    const cwd = process.cwd();
    const playoffsDir = cwd.endsWith('playoffs') ? cwd : path.join(cwd, 'playoffs');

    const yearsPath = path.join(playoffsDir, 'data', 'years.json');
    if (!fs.existsSync(yearsPath)) {
        throw new Error(`years.json not found at ${yearsPath}`);
    }

    const years = JSON.parse(fs.readFileSync(yearsPath, 'utf8'));
    const currentYear = years[0];

    console.log(`Fetching NHL API data for playoffs year ${currentYear}...`);

    const archiveDir = path.join(playoffsDir, 'data', 'archive', currentYear);
    if (!fs.existsSync(archiveDir)) {
        fs.mkdirSync(archiveDir, { recursive: true });
    }

    // 1. Bracket
    const bracketUrl = `${API_BASE_URL}/playoff-bracket/${currentYear}`;
    const bracketData = await fetchJsonSafely(bracketUrl);
    if (bracketData) {
        fs.writeFileSync(path.join(archiveDir, 'api.json'), JSON.stringify(bracketData, null, 2));
        console.log(`Saved bracket to api.json`);
    } else {
        console.log(`Bracket for ${currentYear} returned 404.`);
    }

    // 2. Series Schedules
    const season = `${parseInt(currentYear) - 1}${currentYear}`;
    const letters = ['A','B','C','D','E','F','G','H','I','J','K','L','M','N','O'];
    
    for (const letter of letters) {
        const scheduleUrl = `${API_BASE_URL}/schedule/playoff-series/${season}/${letter}`;
        const scheduleData = await fetchJsonSafely(scheduleUrl);
        if (scheduleData) {
            fs.writeFileSync(path.join(archiveDir, `schedule_${letter}.json`), JSON.stringify(scheduleData, null, 2));
            console.log(`Saved schedule for Series ${letter}`);
        } else {
            console.log(`No schedule yet for Series ${letter}`);
        }
    }
}

run().then(() => {
    console.log('Fetch complete.');
}).catch(err => {
    console.error('Fetch failed:', err);
    process.exit(1);
});
