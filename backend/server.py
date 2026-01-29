#!/usr/bin/env python3
"""
Roleplay Terminal Backend
Matches the React Frontend API expectations.
"""

import json
import os
import time
import requests
from datetime import datetime
from pathlib import Path
from flask import Flask, request, jsonify, Response
from flask_cors import CORS
from dotenv import load_dotenv

load_dotenv()

app = Flask(__name__)
CORS(app)

# --- Configuration ---
OLLAMA_URL = os.getenv('OLLAMA_URL', 'http://localhost:11434')
DEFAULT_MODEL = os.getenv('OLLAMA_MODEL', 'llama3.2')
SUMMARIZATION_MODEL = os.getenv('SUMMARIZATION_MODEL', 'llama3.2')

# --- Data Directories ---
BASE_DIR = Path(__file__).parent
DATA_DIR = BASE_DIR / 'data'
EPISODES_DIR = DATA_DIR / 'episodes'
ARCHIVE_DIR = DATA_DIR / 'archive'
LORE_FILE = DATA_DIR / 'lore.md'
PROFILE_FILE = DATA_DIR / 'profile.md'
HISTORY_FILE = DATA_DIR / 'history.md'

# Ensure directories exist
for d in [DATA_DIR, EPISODES_DIR, ARCHIVE_DIR]:
    d.mkdir(parents=True, exist_ok=True)

# Create default files if missing
if not LORE_FILE.exists():
    LORE_FILE.write_text("# World Lore\n\nWrite your world details here...")
if not PROFILE_FILE.exists():
    PROFILE_FILE.write_text("# Character Profile\n\nWrite your character details here...")
if not HISTORY_FILE.exists():
    HISTORY_FILE.write_text("# Campaign History\n\nPrevious events will appear here...")

# Ensure at least one episode exists
if not list(EPISODES_DIR.glob('*.json')):
    default_episode = {
        "id": "1",
        "name": "The Awakening",
        "description": "You wake up in a mysterious facility...",
        "context": "You wake up in a cold, sterile room. Red emergency lights pulse slowly."
    }
    with open(EPISODES_DIR / "1.json", "w") as f:
        json.dump(default_episode, f, indent=2)


# --- Helper Functions ---

def stream_ollama(prompt, system, model=DEFAULT_MODEL):
    """Stream response from Ollama API"""
    try:
        url = f"{OLLAMA_URL}/api/generate"
        payload = {
            "model": model,
            "prompt": prompt,
            "system": system,
            "stream": True
        }

        with requests.post(url, json=payload, stream=True, timeout=120) as resp:
            resp.raise_for_status()
            for line in resp.iter_lines():
                if line:
                    try:
                        data = json.loads(line)
                        if 'response' in data:
                            yield data['response']
                        if data.get('done'):
                            break
                    except json.JSONDecodeError:
                        continue
    except Exception as e:
        yield f"[Error connecting to Ollama: {str(e)}]"


def build_system_prompt(episode, lore, profile):
    """Construct the system prompt from components"""
    parts = [
        "You are an immersive roleplay narrator.",
        "Describe the scene vividly in second person ('You see...').",
        "Keep responses concise but atmospheric.",
        "Do not break character.",
    ]

    if lore:
        parts.append(f"\n=== WORLD LORE ===\n{lore}")

    # Load and inject campaign history
    if HISTORY_FILE.exists():
        history_content = HISTORY_FILE.read_text().strip()
        if len(history_content) > 20:
            parts.append(f"\n=== PREVIOUS CAMPAIGN EVENTS ===\n{history_content}")

    if profile:
        parts.append(f"\n=== CHARACTER ===\n{profile}")

    if episode:
        context = episode.get('context', '')
        parts.append(f"\n=== CURRENT SCENE ===\n{context}")

    return "\n".join(parts)


# --- API Routes ---

@app.route('/health', methods=['GET'])
def health():
    return jsonify({"status": "ok", "ollama": OLLAMA_URL})


@app.route('/episodes', methods=['GET'])
def get_episodes():
    episodes = []
    for f in EPISODES_DIR.glob('*.json'):
        try:
            with open(f, 'r') as file:
                episodes.append(json.load(file))
        except:
            continue
    episodes.sort(key=lambda x: x.get('id', ''))
    return jsonify(episodes)


@app.route('/episodes', methods=['POST'])
def create_episode():
    data = request.json
    new_id = str(int(time.time()))
    new_episode = {
        "id": new_id,
        "name": data.get("name", "New Episode"),
        "description": data.get("description", ""),
        "context": data.get("context", "")
    }
    try:
        with open(EPISODES_DIR / f"{new_id}.json", "w") as f:
            json.dump(new_episode, f, indent=2)
        return jsonify(new_episode), 201
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route('/episodes/<id>', methods=['PUT'])
def update_episode(id):
    path = EPISODES_DIR / f"{id}.json"
    if not path.exists():
        return jsonify({"error": "Not found"}), 404

    data = request.json
    try:
        # Load existing to preserve any other fields if they exist
        with open(path, 'r') as f:
            current_data = json.load(f)

        # Update fields
        current_data['name'] = data.get('name', current_data.get('name'))
        current_data['description'] = data.get('description', current_data.get('description'))
        current_data['context'] = data.get('context', current_data.get('context'))

        with open(path, 'w') as f:
            json.dump(current_data, f, indent=2)

        return jsonify(current_data)
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route('/episodes/<id>', methods=['DELETE'])
def delete_episode(id):
    path = EPISODES_DIR / f"{id}.json"
    if path.exists():
        path.unlink()
        return jsonify({"success": True})
    return jsonify({"error": "Not found"}), 404


@app.route('/chat', methods=['POST'])
def chat():
    """Handle chat requests from the frontend"""
    data = request.json
    user_msg = data.get('message', '')
    history = data.get('history', [])
    requested_model = data.get('model', DEFAULT_MODEL)

    episode = data.get('episode', {})
    lore = data.get('lore', '')
    profile = data.get('profile', '')

    system_prompt = build_system_prompt(episode, lore, profile)

    full_prompt = ""
    for msg in history[-10:]:
        role = "Player" if msg['role'] == 'user' else "Narrator"
        full_prompt += f"{role}: {msg['content']}\n\n"

    full_prompt += f"Player: {user_msg}\nNarrator:"

    def generate():
        for token in stream_ollama(full_prompt, system_prompt, requested_model):
            yield f"data: {json.dumps({'token': token})}\n\n"
        yield "data: [DONE]\n\n"

    return Response(generate(), mimetype='text/event-stream')


@app.route('/archive', methods=['GET'])
def list_archive():
    archives = []
    for f in ARCHIVE_DIR.glob('*.json'):
        try:
            with open(f, 'r') as file:
                archives.append(json.load(file))
        except:
            continue
    archives.sort(key=lambda x: x.get('archivedAt', ''), reverse=True)
    return jsonify(archives)


@app.route('/archive/<id>', methods=['DELETE'])
def delete_archive(id):
    path = ARCHIVE_DIR / f"{id}.json"
    if path.exists():
        path.unlink()
        return jsonify({"success": True})
    return jsonify({"error": "Not found"}), 404


@app.route('/finish-episode', methods=['POST'])
def finish_episode():
    data = request.json
    messages = data.get('messages', [])
    model = data.get('model', DEFAULT_MODEL)

    transcript = "\n".join([f"{m['role']}: {m['content']}" for m in messages])
    prompt = f"Summarize this roleplay session in 3 sentences:\n\n{transcript}"

    summary_parts = []
    for token in stream_ollama(prompt, "You are a concise summarizer.", model):
        summary_parts.append(token)
    summary = "".join(summary_parts)

    archive_id = str(int(time.time()))
    archive_data = {
        "id": archive_id,
        "episodeName": data.get('episodeName', 'Unknown'),
        "summary": summary,
        "messages": messages,
        "archivedAt": datetime.now().isoformat()
    }

    with open(ARCHIVE_DIR / f"{archive_id}.json", "w") as f:
        json.dump(archive_data, f, indent=2)

    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M")
    history_entry = f"\n\n## Episode: {data.get('episodeName', 'Unknown')} ({timestamp})\n{summary}"

    with open(HISTORY_FILE, "a") as f:
        f.write(history_entry)

    return jsonify(archive_data)


@app.route('/lore', methods=['GET', 'PUT'])
def handle_lore():
    if request.method == 'PUT':
        content = request.json.get('content', '')
        LORE_FILE.write_text(content)
        return jsonify({"success": True})
    return jsonify({"content": LORE_FILE.read_text() if LORE_FILE.exists() else ""})


@app.route('/profile', methods=['GET', 'PUT'])
def handle_profile():
    if request.method == 'PUT':
        content = request.json.get('content', '')
        PROFILE_FILE.write_text(content)
        return jsonify({"success": True})
    return jsonify({"content": PROFILE_FILE.read_text() if PROFILE_FILE.exists() else ""})


@app.route('/models', methods=['GET'])
def list_models():
    try:
        resp = requests.get(f"{OLLAMA_URL}/api/tags", timeout=2)
        if resp.ok:
            models = [m['name'] for m in resp.json().get('models', [])]
            return jsonify({"models": models})
    except:
        pass
    return jsonify({"models": [DEFAULT_MODEL]})


if __name__ == '__main__':
    print(f"🚀 Backend running on http://0.0.0.0:5000")
    print(f"🔗 Connecting to Ollama at {OLLAMA_URL}")
    app.run(host='0.0.0.0', port=5000, debug=True, threaded=True)