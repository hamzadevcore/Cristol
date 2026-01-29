import os
import json
from scenario_manager import Scenario
from context_manager import build_system_context

# 1. Create Dummy Config and Files
os.makedirs("data/transcripts", exist_ok=True)

config_data = {
    "meta": {"name": "Test World"},
    "paths": {
        "world_bible": "data/bible.md",
        "transcripts_folder": "data/transcripts",
        "history_file": "history.md"
    },
    "oc_profile": "NAME: HAMZA. ROLE: CODER.",
    "episodes": []
}

with open("test_config.json", "w") as f:
    json.dump(config_data, f)

with open("data/bible.md", "w") as f: f.write("Lore Content")
with open("history.md", "w") as f: f.write("History Content")
with open("data/transcripts/test_ep.txt", "w") as f: f.write("Transcript Content")

# 2. Load Scenario
print("Loading Scenario...")
scen = Scenario("test_config.json")

# 3. Build Context
print("Building Context...")
context = build_system_context(scen, "test_ep.txt")
prompt = context[0]['content']

# 4. Verify
print("\n--- PROMPT CHECK ---")
if "NAME: HAMZA" in prompt:
    print("[PASS] OC Profile found.")
else:
    print("[FAIL] OC Profile missing.")

if "Transcript Content" in prompt:
    print("[PASS] Transcript found.")
else:
    print("[FAIL] Transcript missing.")