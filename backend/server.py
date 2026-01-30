#!/usr/bin/env python3
"""
Roleplay Terminal Backend v2.3
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

# Load .env file explicitly if needed, or rely on auto-load
load_dotenv()

app = Flask(__name__)
CORS(app)

# --- Configuration ---
GROQ_API_KEY = os.getenv('GROQ_API_KEY', '')
GROQ_API_URL = os.getenv('GROQ_API_URL', 'https://api.groq.com/openai/v1')
DEFAULT_MODEL = os.getenv('GROQ_MODEL', 'llama-3.3-70b-versatile')
SUMMARIZATION_MODEL = os.getenv('SUMMARIZATION_MODEL', DEFAULT_MODEL)

# ... (Keep existing Data Directories logic) ...
BASE_DIR = Path(__file__).parent
DATA_DIR = BASE_DIR / 'data'
SHOWS_DIR = DATA_DIR / 'shows'
INSTANCES_DIR = DATA_DIR / 'instances'
for d in [DATA_DIR, SHOWS_DIR, INSTANCES_DIR]:
    d.mkdir(parents=True, exist_ok=True)

# ... (Keep Default Show Logic) ...
if not list(SHOWS_DIR.glob('*.json')):
    default_show = {
        "id": "hell_descent",
        "name": "Dante's Descent",
        "description": "A journey through the circles of Hell.",
        "lore": "The world is a manifestation of sin.",
        "profile": "You are a lost soul.",
        "episodes": [{"id": "e1", "name": "The Dark Wood", "context": "You wake up in a dark forest."}]
    }
    with open(SHOWS_DIR / "hell_descent.json", "w") as f:
        json.dump(default_show, f, indent=2)


# --- Helper Functions (Keep existing stream_groq and call_groq_summary) ---

def stream_groq(messages, model):
    target_model = model if model else DEFAULT_MODEL
    if not GROQ_API_KEY:
        yield "[Error: GROQ_API_KEY not set]"
        return
    try:
        url = f"{GROQ_API_URL}/chat/completions"
        headers = {"Authorization": f"Bearer {GROQ_API_KEY}", "Content-Type": "application/json"}
        payload = {
            "model": target_model,
            "messages": messages,
            "stream": True,
            "temperature": 0.8,
            "max_tokens": 1024
        }
        with requests.post(url, headers=headers, json=payload, stream=True, timeout=120) as resp:
            resp.raise_for_status()
            for line in resp.iter_lines():
                if line:
                    line_str = line.decode('utf-8')
                    if line_str.startswith('data: '):
                        data_str = line_str[6:]
                        if data_str.strip() == '[DONE]': break
                        try:
                            data = json.loads(data_str)
                            content = data.get('choices', [{}])[0].get('delta', {}).get('content', '')
                            if content: yield content
                        except:
                            continue
    except Exception as e:
        yield f"[Error: {str(e)}]"


def call_groq_summary(text, model):
    target_model = model if model else DEFAULT_MODEL
    if not GROQ_API_KEY: return "Summary unavailable"
    try:
        url = f"{GROQ_API_URL}/chat/completions"
        headers = {"Authorization": f"Bearer {GROQ_API_KEY}", "Content-Type": "application/json"}
        messages = [
            {"role": "system", "content": "Summarize key events in 3 sentences."},
            {"role": "user", "content": text}
        ]
        payload = {"model": target_model, "messages": messages, "temperature": 0.6, "max_tokens": 256}
        resp = requests.post(url, headers=headers, json=payload, timeout=60)
        return resp.json()['choices'][0]['message']['content']
    except:
        return "Summary failed."


# --- Routes ---

@app.route('/health', methods=['GET'])
def health():
    """Returns the backend configuration so frontend can sync"""
    return jsonify({
        "status": "ok",
        "provider": "groq",
        "default_model": DEFAULT_MODEL,
        "summ_model": SUMMARIZATION_MODEL
    })


# ... (Keep existing /shows, /instances, /chat routes exactly as they were in v2.2) ...
@app.route('/shows', methods=['GET', 'POST'])
def handle_shows():
    if request.method == 'POST':
        data = request.json
        new_id = str(int(time.time()))
        new_show = {
            "id": new_id,
            "name": data.get("name", "New Show"),
            "description": data.get("description", ""),
            "lore": data.get("lore", ""),
            "profile": data.get("profile", ""),
            "episodes": data.get("episodes", [])
        }
        with open(SHOWS_DIR / f"{new_id}.json", "w") as f:
            json.dump(new_show, f, indent=2)
        return jsonify(new_show)

    shows = []
    for f in SHOWS_DIR.glob('*.json'):
        try:
            with open(f, 'r') as file:
                shows.append(json.load(file))
        except:
            continue
    return jsonify(shows)


@app.route('/shows/<id>', methods=['PUT', 'DELETE'])
def handle_show_id(id):
    path = SHOWS_DIR / f"{id}.json"
    if request.method == 'DELETE':
        if path.exists(): path.unlink()
        return jsonify({"success": True})

    if not path.exists(): return jsonify({"error": "Not found"}), 404
    with open(path, 'r') as f:
        existing = json.load(f)
    existing.update(request.json)
    with open(path, 'w') as f:
        json.dump(existing, f, indent=2)
    return jsonify(existing)


@app.route('/instances', methods=['GET', 'POST'])
def handle_instances():
    if request.method == 'POST':
        data = request.json
        show_path = SHOWS_DIR / f"{data.get('showId')}.json"
        if not show_path.exists(): return jsonify({"error": "Show not found"}), 404
        with open(show_path, 'r') as f:
            show = json.load(f)

        instance_id = f"inst_{int(time.time())}"
        instance = {
            "id": instance_id,
            "showId": show['id'],
            "showName": show['name'],
            "currentEpisodeIndex": 0,
            "messages": [],
            "summaryHistory": [],
            "lastPlayed": datetime.now().isoformat(),
            "lore": show.get('lore', ''),
            "profile": show.get('profile', ''),
            "episodes": show.get('episodes', [])
        }
        with open(INSTANCES_DIR / f"{instance_id}.json", "w") as f:
            json.dump(instance, f, indent=2)
        return jsonify(instance)

    instances = []
    for f in INSTANCES_DIR.glob('*.json'):
        try:
            with open(f, 'r') as file:
                instances.append(json.load(file))
        except:
            continue
    instances.sort(key=lambda x: x.get('lastPlayed', ''), reverse=True)
    return jsonify(instances)


@app.route('/instances/<id>', methods=['PUT', 'DELETE'])
def handle_instance_id(id):
    path = INSTANCES_DIR / f"{id}.json"
    if request.method == 'DELETE':
        if path.exists(): path.unlink()
        return jsonify({"success": True})

    if not path.exists(): return jsonify({"error": "Not found"}), 404

    data = request.json
    with open(path, 'r') as f:
        current = json.load(f)

    if 'messages' in data: current['messages'] = data['messages']
    if 'lore' in data: current['lore'] = data['lore']
    if 'profile' in data: current['profile'] = data['profile']
    current['lastPlayed'] = datetime.now().isoformat()

    with open(path, 'w') as f:
        json.dump(current, f, indent=2)
    return jsonify(current)


@app.route('/instances/<id>/advance', methods=['POST'])
def advance_instance(id):
    path = INSTANCES_DIR / f"{id}.json"
    if not path.exists(): return jsonify({"error": "Not found"}), 404

    with open(path, 'r') as f:
        instance = json.load(f)
    data = request.json

    transcript = "\n".join([f"{m['role']}: {m['content']}" for m in data.get('messages', [])])
    summary = call_groq_summary(transcript, data.get('model'))

    current_ep_name = "Unknown"
    if instance['currentEpisodeIndex'] < len(instance['episodes']):
        current_ep_name = instance['episodes'][instance['currentEpisodeIndex']]['name']

    instance['summaryHistory'].append({
        "episodeName": current_ep_name,
        "summary": summary,
        "timestamp": datetime.now().isoformat()
    })

    instance['currentEpisodeIndex'] += 1
    instance['messages'] = []
    instance['lastPlayed'] = datetime.now().isoformat()

    with open(path, 'w') as f:
        json.dump(instance, f, indent=2)

    finished = instance['currentEpisodeIndex'] >= len(instance['episodes'])
    return jsonify({"success": True, "summary": summary, "finished": finished})


@app.route('/chat', methods=['POST'])
def chat():
    data = request.json
    instance_id = data.get('instanceId')
    model = data.get('model', DEFAULT_MODEL)

    system_prompt_parts = [os.getenv("PROMPT", "You are a roleplay backend.")]

    if instance_id:
        path = INSTANCES_DIR / f"{instance_id}.json"
        if path.exists():
            with open(path, 'r') as f:
                instance = json.load(f)
            if instance.get('lore'): system_prompt_parts.append(f"\n=== LORE ===\n{instance['lore']}")
            if instance.get('profile'): system_prompt_parts.append(f"\n=== PROFILE ===\n{instance['profile']}")
            if instance.get('summaryHistory'):
                hist = "\n".join([f"- {h['episodeName']}: {h['summary']}" for h in instance['summaryHistory']])
                system_prompt_parts.append(f"\n=== PREVIOUSLY ===\n{hist}")
            ep_idx = instance.get('currentEpisodeIndex', 0)
            if ep_idx < len(instance['episodes']):
                system_prompt_parts.append(f"\n=== SCENE ===\n{instance['episodes'][ep_idx].get('context', '')}")

    messages = [{"role": "system", "content": "\n".join(system_prompt_parts)}]
    messages.extend(data.get('history', [])[-10:])
    messages.append({"role": "user", "content": data.get('message', '')})

    def generate():
        for token in stream_groq(messages, model):
            yield f"data: {json.dumps({'token': token})}\n\n"
        yield "data: [DONE]\n\n"

    return Response(generate(), mimetype='text/event-stream')


if __name__ == '__main__':
    print(f"🚀 Backend running on port 5000")
    print(f"📦 Default Model: {DEFAULT_MODEL}")
    app.run(host='0.0.0.0', port=5000, debug=True, threaded=True)