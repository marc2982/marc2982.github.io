import { PickStatus, YearlySummary, RoundSummary, PersonPointsSummary, TiebreakInfo } from './models.js';
import { excelRank } from './common.js';
export class Summarizer {
    constructor(year, api) {
        this.year = year;
        this.teams = api.getTeams();
    }
    summarizeYear(rounds, projections) {
        const points = {};
        const possiblePoints = {};
        const numTeamsCorrect = {};
        const numGamesCorrect = {};
        const numBonusCorrect = {};
        // Initialize all records
        for (const round of rounds) {
            for (const person in round.summary.summaries) {
                points[person] = 0;
                possiblePoints[person] = 0;
                numTeamsCorrect[person] = 0;
                numGamesCorrect[person] = 0;
                numBonusCorrect[person] = 0;
            }
        }
        // Accumulate values
        for (const round of rounds) {
            for (const [person, summary] of Object.entries(round.summary.summaries)) {
                points[person] += summary.points;
                possiblePoints[person] += summary.possiblePoints;
                numTeamsCorrect[person] += summary.teamsCorrect;
                numGamesCorrect[person] += summary.gamesCorrect;
                numBonusCorrect[person] += summary.bonusEarned;
            }
        }
        const rankMap = calculateRankMapFromDict(points);
        const personSummaries = {};
        for (const person in numTeamsCorrect) {
            personSummaries[person] = PersonPointsSummary.create({
                person: person,
                points: points[person],
                possiblePoints: possiblePoints[person],
                rank: rankMap[person],
                teamsCorrect: numTeamsCorrect[person],
                gamesCorrect: numGamesCorrect[person],
                bonusEarned: numBonusCorrect[person]
            });
        }
        const winners = calculateAllWinners(rankMap);
        return YearlySummary.create({
            year: this.year,
            rounds: rounds,
            personSummaries: personSummaries,
            winners: winners,
            losers: calculateLosers(rankMap),
            tiebreakInfo: TiebreakInfo.create({
                leaders: winners,
                winner: calculateWinner(personSummaries, winners)
            }),
            projections: projections,
            teams: this.teams
        });
    }
    summarizeRound(pickResults) {
        const summaries = {};
        for (const [person, pickResultsBySeries] of Object.entries(pickResults)) {
            let real = 0;
            let possible = 0;
            let teamsCorrect = 0;
            let gamesCorrect = 0;
            let bonusEarned = 0;
            for (const pickResult of Object.values(pickResultsBySeries)) {
                real += pickResult.points;
                possible += pickResult.possiblePoints;
                teamsCorrect += pickResult.teamStatus === PickStatus.CORRECT ? 1 : 0;
                gamesCorrect += pickResult.gamesStatus === PickStatus.CORRECT ? 1 : 0;
                bonusEarned += pickResult.earnedBonusPoints ? 1 : 0;
            }
            summaries[person] = PersonPointsSummary.create({
                person: person,
                points: real,
                possiblePoints: possible,
                rank: 0, // Temporary rank, will be updated
                teamsCorrect: teamsCorrect,
                gamesCorrect: gamesCorrect,
                bonusEarned: bonusEarned
            });
        }
        const pointsDict = Object.fromEntries(Object.entries(summaries).map(([person, summary]) => [person, summary.points]));
        const rankMap = calculateRankMapFromDict(pointsDict);
        // Update ranks
        for (const person in summaries) {
            const summary = summaries[person];
            summaries[person] = PersonPointsSummary.create({
                person: summary.person,
                points: summary.points,
                possiblePoints: summary.possiblePoints,
                rank: rankMap[person],
                teamsCorrect: summary.teamsCorrect,
                gamesCorrect: summary.gamesCorrect,
                bonusEarned: summary.bonusEarned
            });
        }
        return RoundSummary.create({
            summaries: summaries,
            winners: calculateAllWinners(rankMap),
            losers: calculateLosers(rankMap)
        });
    }
}
function calculateAllWinners(rankMap) {
    return Object.entries(rankMap)
        .filter(([_, rank]) => rank === 1)
        .map(([person]) => person);
}
function calculateWinner(allSummaries, winners) {
    const winnersSummaries = winners.map(person => allSummaries[person]);
    if (winnersSummaries.length === 1) {
        return winnersSummaries[0].person;
    }
    // First tiebreaker: games correct
    const numGamesMap = Object.fromEntries(winnersSummaries.map(s => [s.person, s.gamesCorrect]));
    const maxGames = Math.max(...Object.values(numGamesMap));
    const newLeaders = Object.entries(numGamesMap)
        .filter(([_, games]) => games === maxGames)
        .map(([person]) => person);
    if (newLeaders.length === 1) {
        return newLeaders[0];
    }
    // Second tiebreaker: teams correct
    const numTeamsMap = Object.fromEntries(winnersSummaries.map(s => [s.person, s.teamsCorrect]));
    const maxTeams = Math.max(...Object.values(numTeamsMap));
    const finalLeaders = Object.entries(numTeamsMap)
        .filter(([_, teams]) => teams === maxTeams)
        .map(([person]) => person);
    if (finalLeaders.length === 1) {
        return finalLeaders[0];
    }
    return undefined;
}
function calculateLosers(rankMap) {
    if (Object.keys(rankMap).length === 0) {
        return [];
    }
    const lowestRank = Math.max(...Object.values(rankMap));
    return Object.entries(rankMap)
        .filter(([_, rank]) => rank === lowestRank)
        .map(([person]) => person);
}
function calculateRankMapFromDict(d) {
    const allPoints = Object.values(d);
    return Object.fromEntries(Object.entries(d).map(([person, points]) => [
        person,
        excelRank(allPoints, points)
    ]));
}
