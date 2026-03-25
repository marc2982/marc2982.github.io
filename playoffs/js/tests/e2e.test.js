import { GOOGLE_SCRIPT_URL } from '../config.js';
import { Series } from '../models.js';
import { SCENARIOS } from './mockData.js';
import { MockDataLoader } from './mockDataLoader.js';
import { NhlApiHandler } from '../nhlApiHandler.js';
import { PicksImporter } from '../picksImporter.js';
import { PickResultCalculator } from '../pickResultCalculator.js';
import { Summarizer } from '../summarizer.js';
import { ProjectionCalculator } from '../projectionCalculator.js';
import { SeriesRepository, TeamRepository } from '../repositories.js';
import { SCORING, ALL_SERIES, Round } from '../models.js';

export async function runSimulation(passcode, log) {
    const year = 3000;
    
    log('--- STARTING PRE-FLIGHT CHECKS ---', 'info');
    
    // Scenario A: Clear GAS and error handling
    log('Scenario: Wiping Year 3000 from Backend...', 'info');
    const clearRes = await fetch(GOOGLE_SCRIPT_URL, {
        method: 'POST',
        body: JSON.stringify({ passcode, year, action: 'clearTestYear' })
    }).then(r => r.json());
    
    if (clearRes.result !== 'success') {
        throw new Error(`Failed to clear test year: ${clearRes.error}`);
    }
    log('Backend wiped successfully.', 'success');

    // Test Invalid Passcode
    log('Scenario: Invalid Passcode Submission', 'info');
    const badPassRes = await fetch(GOOGLE_SCRIPT_URL, {
        method: 'POST',
        body: JSON.stringify({ passcode: 'wrong_pass', year, round: 1, name: 'Hacker', picks: [] })
    }).then(r => r.json());
    if (badPassRes.result !== 'error' || badPassRes.error !== 'Invalid Passcode') {
        throw new Error('Backend accepted an invalid passcode!');
    }
    log('Security validation passed.', 'success');

    // Scenario B: State Progression & Locking
    log('--- COMMENCING TIME TRAVEL ---', 'info');
    
    const dataLoader = new MockDataLoader(year);
    const api = new NhlApiHandler(year, dataLoader);
    
    dataLoader.setScenario(SCENARIOS.R1_LOCKED);
    await api.load();
    await api.fetchSchedules(ALL_SERIES[0]); // Round 1
    
    let seriesA = api.getSeriesList().find(s => s.letter === 'A');
    // At T-5: round is NOT open yet (unlock window is T-3). Series is also not started.
    if (!Series.isRoundOpen(seriesA.startTimeUTC) && !seriesA.isLocked()) {
        log('Scenario: Round correctly closed to picks at T-5 days', 'success');
    } else {
        throw new Error('Round should not be open 5 days out!');
    }

    // Fast Forward to Open
    dataLoader.setScenario(SCENARIOS.R1_OPEN);
    await api.fetchSchedules(ALL_SERIES[0]);
    seriesA = api.getSeriesList().find(s => s.letter === 'A');
    // At T-2: round IS open (within 3 days), but game hasn't started so not locked.
    if (Series.isRoundOpen(seriesA.startTimeUTC) && !seriesA.isLocked()) {
        log('Scenario: Round open to picks at T-2 days, game not yet started', 'success');
    } else {
        throw new Error('Round should be open but series not yet started at T-2 days!');
    }

    // Scenario C: Send Multiple Permutations to GAS
    log('Scenario: Transmitting Round 1 Picks to Backend...', 'info');
    
    const picksPayloads = [
        { 
            name: 'Alice_Perfect', // Team (FLA), Games (6), Bonus (+3)
            picks: [{ winner: 'FLA', games: 6 }, { winner: 'TOR', games: 7 }] 
        },
        { 
            name: 'Bob_TeamOnly', // Team (FLA), Games wrong (5)
            picks: [{ winner: 'FLA', games: 5 }, { winner: 'TOR', games: 7 }] 
        },
        { 
            name: 'Charlie_GamesOnly', // Team wrong (TBL), Games correct (6)
            picks: [{ winner: 'TBL', games: 6 }, { winner: 'TOR', games: 7 }] 
        }
    ];

    for (const p of picksPayloads) {
        log(`Submitting picks for ${p.name}...`, 'info');
        const res = await fetch(GOOGLE_SCRIPT_URL, {
            method: 'POST',
            body: JSON.stringify({ passcode, year, round: 1, name: p.name, picks: p.picks })
        }).then(r => r.json());
        
        if (res.result !== 'success') {
            throw new Error(`Submission failed for ${p.name}: ${res.error}`);
        }
    }
    log('All picks accepted by backend.', 'success');

    // Double Entry check
    log('Scenario: Double Entry Prevention', 'info');
    const doubleEntryRes = await fetch(GOOGLE_SCRIPT_URL, {
        method: 'POST',
        body: JSON.stringify({ passcode, year, round: 1, name: 'Alice_Perfect', picks: [] })
    }).then(r => r.json());
    if (doubleEntryRes.result !== 'error' || !doubleEntryRes.error.includes('Duplicate')) {
        throw new Error('Backend failed to catch double entry!');
    }
    log('Double entry correctly blocked.', 'success');

    // Scenario D: Fast Forward to R1 Complete and Evaluate Points
    log('Scenario: Fast Forward to Round 1 Complete (Evaluating Points)', 'info');
    dataLoader.setScenario(SCENARIOS.R1_FINISHED);
    await api.load(); // Reload api since we advanced time
    
    // Inject Mock CSV data corresponding to what we just submitted to GAS
    let mockCsv = "Timestamp,Name,Team,Games,Team,Games\n";
    mockCsv += "2025-01-01,Alice_Perfect,FLA,6,TOR,7\n";
    mockCsv += "2025-01-01,Bob_TeamOnly,FLA,5,TOR,7\n";
    mockCsv += "2025-01-01,Charlie_GamesOnly,TBL,6,TOR,7\n";
    dataLoader.mockPicks[1] = mockCsv;

    const seriesRepo = new class extends SeriesRepository {
        getSeries(letter) { return api.getSeriesList().find(s => s.letter === letter); }
        getSeriesOrNone(letter) { return this.getSeries(letter); }
        getScfSeries() { return null; }
    }();

    const teamRepo = new class extends TeamRepository {
        getTeam(name) { return { short: name, name: name }; }
        getAllTeams() { return api.getTeams(); }
    }();

    const importer = new PicksImporter(seriesRepo, teamRepo);
    // Overload readCsv to read from mock since github API takes minutes to publish
    importer.readCsv = async (path, round) => { 
        return importer.processRows(dataLoader.mockPicks[round], round);
    };

    const calc = new PickResultCalculator();
    const sum = new Summarizer(year, teamRepo);
    
    const parsedPicks = await importer.readCsv('', 1);
    const pickResults = calc.buildPickResults(SCORING[0], seriesRepo, parsedPicks);
    const roundSummary = sum.summarizeRound(pickResults);

    // Verify Points Correctness
    // FLA won in 6. (Team: 1pt, Game: 2pts, Bonus: 3pts) = 6pts
    const aliceScore = roundSummary.summaries['Alice_perfect'].points; // should be 6
    const bobScore = roundSummary.summaries['Bob_teamonly'].points; // should be 1
    const charlieScore = roundSummary.summaries['Charlie_gamesonly'].points; // should be 2

    if (aliceScore !== 6) throw new Error(`Alice perfect score failed! Expected 6 got ${aliceScore}`);
    if (bobScore !== 1) throw new Error(`Bob team only score failed! Expected 1 got ${bobScore}`);
    if (charlieScore !== 2) throw new Error(`Charlie games only score failed! Expected 2 got ${charlieScore}`);
    
    log(`Points Calculation verified perfectly! Alice: ${aliceScore}, Bob: ${bobScore}, Charlie: ${charlieScore}`, 'success');

    // Verify Contingency / Bracket Progression
    log('Scenario: Bracket Contingency Logic (Round 2 TBD)', 'info');
    // Series A Winner = FLA, Series B Winner = BOS. Series I should show both as possible winners.
    const possibleI = api.getPossibleWinners('I');
    if (!possibleI.includes('FLA') || !possibleI.includes('BOS') || possibleI.length !== 2) {
        throw new Error(`Contingency logic failed for Series I. Expected [FLA, BOS], got [${possibleI.join(',')}]`);
    }
    log(`Contingency successfully bubbled up [${possibleI.join(',')}] for next round.`, 'success');

    // Scenario E: Round Overlap / Contingency Picks (Round 2 starts before Round 1 finished)
    log('Scenario: Round Overlap / Contingency Picks (Round 2 TBD-TBD)', 'info');
    dataLoader.setScenario(SCENARIOS.R1_OVERLAP_R2);
    await api.load();
    await api.fetchSchedules(['I']); // Round 2 lead series

    const possibleI_overlap = api.getPossibleWinners('I');
    // Series A (FLA/TBL) vs Series B (BOS/TOR)
    const expectedTeams = ['FLA', 'TBL', 'BOS', 'TOR'];
    const allPresent = expectedTeams.every(t => possibleI_overlap.includes(t));
    if (!allPresent || possibleI_overlap.length !== 4) {
        throw new Error(`Contingency failed for Overlap! Expected 4 teams [FLA,TBL,BOS,TOR], got [${possibleI_overlap.join(',')}]`);
    }
    log(`Overlap success! Correctly bubbled up 4 possible participants: [${possibleI_overlap.join(',')}]`, 'success');

    // Scenario F: Projection Matrix Logic
    log('Scenario: Projection Matrix Verification', 'info');
    const projector = new ProjectionCalculator(seriesRepo, teamRepo);
    const roundOneObj = Round.create({
        number: 1,
        serieses: api.getSeriesList(),
        pickResults: pickResults,
        scoring: SCORING[0],
        summary: roundSummary
    });
    
    const projections = projector.calculate([roundOneObj]);
    if (!projections || typeof projections !== 'object') {
        throw new Error('Projection matrix failed to generate');
    }
    log('Projection matrix calculated successfully against active dataset.', 'success');

    log('--- ALL FLIGHT SYSTEMS CHECKED ---', 'info');
}
