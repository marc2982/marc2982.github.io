import requests
import json
import os
import subprocess
from datetime import datetime

CURRENT_YEAR = datetime.now().year
NHL_API_URL = f"https://api-web.nhle.com/v1/playoff-bracket/{CURRENT_YEAR}"
OUTPUT_FILE = f"playoffs/data/{CURRENT_YEAR}.json"
REPO_PATH = os.path.dirname(os.path.abspath(__file__))

def fetch_data():
    try:
        response = requests.get(NHL_API_URL)
        response.raise_for_status()
        return response.json()
    except requests.RequestException as e:
        print(f"Error fetching data: {e}")
        return None

def save_data(data):
    with open(OUTPUT_FILE, "w") as file:
        json.dump(data, file, indent=4)

def has_changes():
    result = subprocess.run(
        ["git", "status", "--porcelain"],
        cwd=REPO_PATH,
        stdout=subprocess.PIPE,
        text=True
    )
    return bool(result.stdout.strip())

def commit_and_push():
    subprocess.run(["git", "add", OUTPUT_FILE], cwd=REPO_PATH)
    subprocess.run(["git", "commit", "-m", "Update 2025.json with latest NHL data"], cwd=REPO_PATH)
    subprocess.run(["git", "push"], cwd=REPO_PATH)

def main():
    os.chdir(REPO_PATH)

    data = fetch_data()
    if not data:
        return

    save_data(data)

    if has_changes():
        print("Changes detected. Committing and pushing to GitHub...")
        commit_and_push()
    else:
        print("No changes detected. Skipping commit.")

if __name__ == "__main__":
    main()
