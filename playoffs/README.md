# NHL Playoffs Pool

Welcome to the NHL Playoffs Pool! This is a completely free, automated, serverless web application hosted on GitHub Pages that allows friends and family to compete by predicting the outcomes of the NHL Playoffs.

## 🌟 Features

- **Live Scoring & Tiebreakers:** Real-time point calculations against live NHL API data during the playoffs.
- **Round-by-Round Breakdown:** View picks and points for every person, for every series, in every round.
- **Projections:** "What-if" scenarios showing exactly who will win the pool (or get eliminated) based on every possible remaining series outcome.
- **Deep Metrics & Analysis:** Go back to any historical year instantly to see advanced statistics:
  - **Performance:** History of points, exact placements, and achievements across years.
  - **Pick Analysis:** Average points per round, loyalty vs bias, the "Mush" (most zero-point picks), etc.
  - **Team Analysis:** Most frequently picked teams, longest streaks, sleeper hits, and more.
  - **Head-to-Head:** Direct competition margins and tiebreaker records against specific competitors.
  - **Round Analysis:** Difficulty rankings by round, sweep prediction accuracy, Game 7 predictions, and bonus point efficiency.

## 🚀 How It Works (The "Magic")

This app requires **zero servers** and **zero manual database entry**. 

1. **Submit Picks:** Participants fill out a form on the "Picks" page (`picks.html`).
2. **Auto-Commit:** The submission is sent securely to a Google Apps Script "middleware" which uses the GitHub API to directly commit their picks as a `.csv` file into this repository.
3. **Auto-Deploy:** GitHub Pages detects the new `.csv` file and instantly rebuilds the site.
4. **Live Calculation:** When anyone views the year's page (`year.html`), the app downloads the `.csv` files, grabs the latest live game results from the NHL API, and calculates the standings directly in the browser. 

*(For historical, completed years, the app uses a pre-generated lightweight `.json` file for instant loading instead of calculating thousands of data points on the fly!)*

## 🛠️ Setup & Usage Guide

If you are a developer or the owner running this pool, here is how you manage it:

### 1. Initial Setup (One Time Only)
Follow the guide in `setup_backend.md` to deploy the Google Apps Script. This connects your public `github.io` page securely to your repository so it can save user picks automatically.

### 2. Starting a New Playoff Year
Before the playoffs start:
1. Ensure the `picks.html` UI represents the correct current year.
2. Ensure participants know the passcode (configured in `js/config.js` and `backend/Code.gs`).
3. Add the new year to `playoffs/data/years.json`.
4. As people submit their picks, the site's standings will instantly update without you touching anything.

*(Note: Participants' picks will be saved to `data/archive/<year>/roundX.csv` automatically via the backend script).*

### 3. After the Playoffs End (Archiving)
To ensure the site remains fast in the future, we "lock in" the year:
1. Open `http://localhost:8000/playoffs/builder.html` and select the completed year.
2. Click **Build Year** to process all the API data into a single, flat JSON file.
3. Save that `{year}.json` file to `playoffs/data/summaries/`.
4. Click **Generate yearly_index.json** and save it to the same `summaries/` folder.
5. Commit both files to the repository. The year will now load instantly forever without needing to hit the NHL API or calculate from CSVs.

## 🧪 Testing

The codebase includes various ways to test:
- **Browser Tests:** Open `playoffs/tests.html` in your browser. It uses a custom straightforward test suite to test utility functions, calculators, and parsers.
- **Node/Jest Tests:** If you want to test the JavaScript modules directly via terminal, write your tests in the `js/tests/` directory and run them.

## 🤖 For AI Agents & Contributors
If you're an LLM or a human developer looking to contribute to the codebase or fix a bug, **STOP** and read `AGENT_README.md` first. It serves as a highly detailed architecture map that will save you time and prevent you from adding unnecessary backend infrastructure to a purely static site.

---

> [!TIP]
> **Check out the historical data!** You can use the buttons on the main index to jump into any historical playoff year and explore the advanced statistical tabs. The app provides decades' worth of granular insights.
