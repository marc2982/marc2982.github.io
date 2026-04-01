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

## 🔒 Pick Availability Logic

Pick submission uses a two-stage gating system:

1. **Round Unlock (coarse gate):** A round becomes open to picks **3 days before** the earliest Game 1 start time in that round. Before this window, the picks page shows "not available yet."
2. **Series Lock (precise gate):** Once the round is open, each individual series locks at its **exact Game 1 start time**. A series that starts later in the round stays editable right up until its own puck drop.
3. **Contingency Picks (overlapping rounds):** When a round unlocks (e.g. Round 2 opening 3 days before Game 1), but the previous round hasn't fully finished yet, the app generates **Contingency Picks**. It will display all possible permutations for a series. Participants must provide a pick for all permutations, but only the matchup that actually occurs will be scored.

```
Round open? → No  → "Picks not available yet"
     ↓ Yes
Series locked? → Yes → Show picks read-only
     ↓ No
Show editable pick form
```

This means no manual date configuration is ever needed — the app derives all timing directly from the NHL API schedule data.

## 💡 Future Analytics Ideas

Feel free to expand the `pickAnalysis.js` engine to support new "fun" metrics in future years:

- **The Homer:** Track whose picks correlate highest with their self-professed favorite team.
- **The Bandwagoner:** Identify who predominantly picks President's Trophy winners or #1 seeds.
- **The Contrarian:** Track how often a player picks an underdog that >80% of the rest of the pool voted against.
- **The Nostradamus:** Track "Lone Wolf" perfect picks (you perfectly guessed a game length/team that nobody else in the pool saw coming).

## 🚀 How It Works (The "Magic")

This app requires **zero servers** and **zero manual database entry**.

1. **Submit Picks:** Participants fill out a form on the "Picks" page (`picks.html`).
2. **Auto-Commit:** The submission is sent securely to a Google Apps Script "middleware" which uses the GitHub API to directly commit their picks as a `.csv` file into this repository.
3. **Auto-Deploy:** GitHub Pages detects the new `.csv` file and instantly rebuilds the site.
4. **Live Calculation:** When anyone views the year's page (`year.html`), the app downloads the `.csv` files, grabs the latest live game results from the NHL API, and calculates the standings directly in the browser.

_(For historical, completed years, the app uses a pre-generated lightweight `.json` file for instant loading instead of calculating thousands of data points on the fly!)_

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

_(Note: Participants' picks will be saved to `data/archive/<year>/roundX.csv` automatically via the backend script)._

### 3. After the Playoffs End (Archiving)

To ensure the site remains fast in the future, we "lock in" the year:

1. Open `http://localhost:8000/playoffs/builder.html` and select the completed year.
2. Click **Build Year** to process all the API data into a single, flat JSON file.
3. Save that `{year}.json` file to `playoffs/data/summaries/`.
4. Click **Generate yearly_index.json** and save it to the same `summaries/` folder.
5. Commit both files to the repository. The year will now load instantly forever without needing to hit the NHL API or calculate from CSVs.

### 4. Optional: Automated Round Notifications

If you want to alert your pool participants exactly when a round opens (3 days before Game 1), you can do this for exactly $0.00 using Google Apps Script's native `MailApp` service:

1. Write a function in your backend `Code.gs` that fetches the NHL API schedule. If the earliest Game 1 of the active round is exactly 3 days away, proceed.
2. Loop through your participants' email addresses and call `MailApp.sendEmail(email, "NHL Pool: Next Round Open", "Time to submit your picks!")`.
3. Set a "Time-driven trigger" within the GAS dashboard to execute this function every morning.
   **_SMS Hack:_** You don't need paid Twilio credits to send text messages. Every major carrier provides an "Email-to-SMS" gateway (e.g. \`5551234567@vtext.com\` for Verizon, or \`@txt.att.net\` for AT&T). If you drop those specific carrier gateway addresses into your `MailApp` loop instead of standard emails, Google Apps Script will text their phones for free.

## 🧪 Testing & Local Development

Due to strict browser CORS policies regarding ES6 Modules, you cannot simply double-click `tests.html` or `index.html` from your file explorer. You must run it through a local web server.

1. Ensure you have Node.js installed.
2. Open a terminal in the `playoffs/` directory and run:
    ```bash
    npm install
    npm start
    ```
3. Open `http://localhost:8080/playoffs/tests.html` in your browser.

The codebase includes various ways to test:

- **Browser Tests (`tests.html`):** Uses a custom straightforward test suite to test utility functions, calculators, and parsers.
- **E2E Backend Test (`e2e-tests.html`):** Use this hidden page to execute a full mock timeline of a playoffs using a dummy "Year 3000". It will natively test time-travel locking, Google Apps Script submissions, and Points Permutations logic against real local dependencies.
- **Code Quality:** Run `npm run lint` to execute the ESLint compiler against the Javascript logic to check for code smells.

### 🔮 Possible Future E2E Improvements

NOTE: currently the csv files for year 3000 are appending instead of being cleared then rewritten, so consider adding a step to clear them before running the E2E tests.

If you want to make the E2E test even more robust for a completely hands-off playoff season, consider adding:

1. **The "Tiebreaker / End of Season" Scenario:** Inject a `mockPicks[4]` (Stanley Cup Final) where two players tie in points. Verify that `Summarizer.summarizeYear()` correctly applies the tiebreaker logic (e.g. Most Games Correct $\rightarrow$ Most Teams Correct) to crown the unified Champion.
2. **The "Changing a Pick Before Deadline" Scenario:** Submit a revised payload for a user before the lockout deadline and ensure the Google Apps Script backend overwrites their previous row instead of rejecting it as a duplicate.
3. **The "Missing File / Round 2 Start" Scenario:** Test the state where Round 1 finishes and Round 2 opens, but `round2.csv` returns a 404 from GitHub Pages. Make sure `PicksImporter` handles a missing file gracefully (e.g. treats it as 0 picks) instead of crashing the dashboard.

## 🤖 For AI Agents & Contributors

If you're an LLM or a human developer looking to contribute to the codebase or fix a bug, **STOP** and read `AGENT_README.md` first. It serves as a highly detailed architecture map that will save you time and prevent you from adding unnecessary backend infrastructure to a purely static site.

---

> [!TIP]
> **Check out the historical data!** You can use the buttons on the main index to jump into any historical playoff year and explore the advanced statistical tabs. The app provides decades' worth of granular insights.
