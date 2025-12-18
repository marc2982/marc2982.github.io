# Playoffs Backend Setup (GitHub Integrated)

To enable fully automatic pick collection, we use a Google Apps Script that receives data and commits it directly to your GitHub repository.

## Step 1: Create a GitHub Token

Since the script will write to your repository, it needs a **Personal Access Token (PAT)**.

1.  Go to your GitHub [Fine-grained personal access tokens](https://github.com/settings/tokens?type=beta) settings.
2.  Click **Generate new token**.
3.  Name it `Playoff Picks Middleware`.
4.  **Repository access**: Select `Only select repositories` and choose `marc2982.github.io`.
5.  **Permissions**: Under **Repository permissions**, find **Contents** and select **Read and write**.
6.  Click **Generate token**. **COPY IT IMMEDIATELY** (you won't see it again).

## Step 2: Create the Apps Script

1.  Go to [script.google.com](https://script.google.com).
2.  Click **New Project**. Name it `Playoffs Backend`.
3.  Copy the code from [playoffs/backend/Code.gs](file:///c:/Users/marc2/Documents/Workspace/marc2982.github.io/playoffs/backend/Code.gs) and paste it into the editor (replacing `myFunction`).
4.  **Important**: Change the `PASSCODE` and `GITHUB_REPO_OWNER` variables if necessary (see top of script).
5.  Click the **Save** icon.

## Step 3: Set the Token

1.  In the Apps Script editor, click the **Settings** gear icon (left sidebar).
2.  Scroll down to **Script Properties**.
3.  Click **Add script property**.
    -   Property: `GITHUB_TOKEN`
    -   Value: (Paste your GitHub Token from Step 1)
4.  Click **Save script properties**.

## Step 4: Deploy

1.  Click **Deploy** (top right) > **New deployment**.
2.  Click **Select type** (gear) > **Web app**.
3.  **Execute as**: `Me`.
4.  **Who has access**: `Anyone`.
5.  Click **Deploy**.
6.  Authorize the script (Advanced > Go to ... > Allow).
7.  **COPY** the "Web App URL".

## Step 5: Connect to Site

1.  Open `playoffs/js/config.js` in your local project.
2.  Paste the URL into the `GOOGLE_SCRIPT_URL` variable.

---

> [!NOTE]
> Once deployed, all submissions will automatically update the CSV files in `playoffs/data/archive/2025/`. This will trigger a GitHub Pages rebuild, making the new picks visible on the site within a few minutes.
