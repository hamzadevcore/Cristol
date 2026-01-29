import os

def read_file_content(path):
    if path and os.path.exists(path):
        try:
            with open(path, 'r', encoding='utf-8') as f:
                return f.read().strip()
        except:
            return ""
    return ""

def build_system_context(scenario, script_filename=None):
    """
    Constructs the prompt using the Scenario object.
    """
    # 1. Load Static Text
    sys_prompt = scenario.get_system_prompt()
    bible = read_file_content(scenario.get_path("world_bible"))
    history = read_file_content(scenario.get_path("history_file"))
    oc_profile = scenario.get_oc_profile()

    # 2. Load Dynamic Script
    script_content = ""
    if script_filename:
        folder = scenario.get_path("transcripts_folder")
        full_path = os.path.join(folder, script_filename)
        script_content = read_file_content(full_path)

    # 3. Assemble
    content = f"""
{sys_prompt}

### WORLD BIBLE (Lore)
{bible}

### ORIGINAL CHARACTER PROFILE
{oc_profile}

### PREVIOUS CAMPAIGN HISTORY
{history}

### CURRENT SCENE TRANSCRIPT
{script_content}
"""
    return [{"role": "system", "content": content.strip()}]