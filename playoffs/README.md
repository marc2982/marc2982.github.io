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

-   **Average Points Per Year** - Who consistently performs well?
-   **Best/Worst Year** - Highest and lowest point totals for each person
-   **Streak Tracking** - Longest winning/losing streaks
-   **Podium Finishes** - Top 3 finishes count (not just wins)
-   **Comeback King** - Most improved from Round 1 to Round 4
-   **Early Leader** - Who leads after Round 1 most often?
-   **Consistency Score** - Standard deviation of yearly finishes

### Pick Analysis Tab

-   **Team Loyalty** - Which teams do people pick most?
-   **Upset Picks** - Who picks the most underdogs?
-   **Bonus Master** - Who earns the most bonus points?
-   **Games Prediction Accuracy** - Who's best at predicting series length?
-   **Cup Winner Picks** - Who picks the Stanley Cup winner most often?

### Head-to-Head Tab

-   **Rivalry Matrix** - Win/loss record against each other person
-   **Closest Finishes** - Years with smallest point differentials
-   **Tiebreaker Record** - Win rate in tiebreaker situations
-   **Direct Comparison** - Select two people to compare stats

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
