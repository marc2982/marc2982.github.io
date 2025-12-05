# NHL Playoffs Pool

## Overview

The application uses a hybrid approach for data loading:

-   **Current year**: Live data from CSVs + NHL API (updates automatically during playoffs)
-   **Past years**: Instant load from pre-generated JSON files
-   **Index page**: Fast load from lightweight `yearly_index.json`

This provides the best of both worlds: automatic updates during playoffs and blazing-fast loads for historical data.

## Data Flow

### During Playoffs (Current Year)

1. No JSON exists for current year
2. Year page loads from CSVs + live NHL API
3. Updates automatically after each game
4. No manual rebuilding needed!

### After Playoffs End

1. Use builder to generate `{year}.json` once
2. Commit to repo
3. Year now loads instantly from JSON forever

### Index Page

1. Loads `yearly_index.json` (lightweight)
2. Displays results and stats tables
3. No hardcoded data needed

## How to Use

### Adding a New Year

1. Download CSVs from Google Forms
2. Place in `playoffs/data/archive/{year}/`
3. Add year to `playoffs/data/years.json`
4. Page works immediately (loads from CSVs + API)

### After Playoffs End

1. Open `http://localhost:8000/playoffs/builder.html`
2. Select the year
3. Click "Build Year"
4. Save `{year}.json` to `playoffs/data/summaries/`
5. Click "Generate yearly_index.json"
6. Save to `playoffs/data/summaries/`
7. Commit both files to git

### Building All Years

1. Open builder
2. Click "Build All Years as ZIP"
3. Extract `yearly-summaries.zip`
4. Move all JSONs to `playoffs/data/summaries/`
5. Generate index
6. Commit

## Advanced Stats Ideas

### Performance Stats Tab

-   **Comeback King** - Most improved from Round 1 to Round 4
-   **Biggest Collapse** - Biggest drop from Round 1 to Round 4
-   **Round-by-Round Performance** - Average points per round breakdown
-   **Clutch Performance** - Performance in elimination games/series
-   **Year-over-Year Trends** - Improvement/decline patterns over time

### Pick Analysis Tab

-   **Favorite vs Underdog Ratio** - Breakdown of picks by seed differential
-   **Conference Bias** - Do people favor Eastern or Western Conference teams?
-   **Home Ice Advantage Belief** - How often do people pick the home team?
-   **Recency Bias** - Do people pick teams that won recently?
-   **Round-Specific Accuracy** - Which rounds are people best/worst at predicting?
-   **Team-Specific Success** - Accuracy when picking specific franchises

### Head-to-Head Tab

-   **Rivalry Matrix** - Win/loss record against each other person (full grid)
-   **Dominance Score** - Who has the best overall head-to-head record?
-   **Nemesis Tracker** - Who is each person's worst matchup?
-   **Point Differential Trends** - How margins between people change over time

### New Tab Ideas

#### Trends & Patterns Tab

-   **Hot Streaks** - Current form (last 3-5 years performance)
-   **Playoff Format Impact** - Performance before/after format changes
-   **Participation Consistency** - Years active vs inactive

## Future Enhancements

### Tiebreaker UI Improvement

-   Add prominent winner banner at top of year pages
-   Show tiebreaker details clearly
-   Make it obvious who won and why

### Node.js Automation (Phase 2)

-   Install `dataclass` via npm
-   Rewrite core logic for Node.js compatibility
-   Enable `npm run build` workflow
-   Auto-detect modified years
-   Integrate with GitHub Actions

### Other Ideas

-   GitHub Actions automation
-   Google Forms → CSV automation
-   Real-time updates during playoffs
-   Advanced stats page using full JSON data
