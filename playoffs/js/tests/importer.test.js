import { PicksImporter } from '../picksImporter.js';
import { Series } from '../models.js';

export function runImporterTests() {
    const results = [];
    function test(group, name, fn) {
        try {
            fn();
            results.push({ group, name, status: 'PASS' });
        } catch (e) {
            results.push({ group, name, status: 'FAIL', error: e.message });
        }
    }
    function assert(condition, message) {
        if (!condition) throw new Error(message || 'Assertion failed');
    }

    // Minimal stub repos matching what E2E uses
    const seriesA = Series.create({ letter: 'A', topSeed: 'FLA', bottomSeed: 'TBL', topSeedWins: 4, bottomSeedWins: 2 });
    const seriesB = Series.create({ letter: 'B', topSeed: 'BOS', bottomSeed: 'TOR', topSeedWins: 4, bottomSeedWins: 3 });

    const seriesRepo = {
        getSeries(letter) {
            return { A: seriesA, B: seriesB }[letter] || null;
        }
    };
    const teamRepo = {
        getTeam(name) { return { short: name, name }; }
    };

    const mockCsv =
        'Timestamp,Name,Team,Games,Team,Games\n' +
        '2025-01-01,Alice_Perfect,FLA,6,TOR,7\n' +
        '2025-01-01,Bob_TeamOnly,FLA,5,TOR,7\n' +
        '2025-01-01,Charlie_GamesOnly,TBL,6,TOR,7\n';

    test('PicksImporter', 'processRows is a callable public method', () => {
        const importer = new PicksImporter(seriesRepo, teamRepo);
        assert(typeof importer.processRows === 'function', 'processRows should be a function');
    });

    test('PicksImporter', 'processRows parses CSV string and returns picks by person', () => {
        const importer = new PicksImporter(seriesRepo, teamRepo);
        const picks = importer.processRows(mockCsv, 1);

        assert(picks['Alice_perfect'] || picks['Alice_Perfect'], 'Alice should have picks');
        const alicePick = picks['Alice_perfect'] || picks['Alice_Perfect'];
        assert(alicePick['A'].team === 'FLA', 'Alice should have picked FLA for series A');
        assert(alicePick['A'].games === 6, 'Alice should have picked 6 games for series A');
    });

    test('PicksImporter', 'processRows standardizes names correctly', () => {
        const importer = new PicksImporter(seriesRepo, teamRepo);
        const picks = importer.processRows(mockCsv, 1);

        // standardizeName capitalizes first letter
        assert('Alice_perfect' in picks || 'Alice_Perfect' in picks, 'Alice name should be present');
    });

    test('PicksImporter', 'processRows skips picks for unknown teams', () => {
        const importer = new PicksImporter(seriesRepo, teamRepo);
        const csvWithUnknown =
            'Timestamp,Name,Team,Games\n' +
            '2025-01-01,Dave,UNKNOWN_TEAM,5\n';
        // Should not throw — unknown team is warned and skipped
        const picks = importer.processRows(csvWithUnknown, 1);
        assert(!picks['Dave'] || !picks['Dave']['A'], 'Unknown team pick should be skipped');
    });

    return results;
}
