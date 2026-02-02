#!/usr/bin/env python3
"""
Roleplay Terminal Backend v2.7.1
(Fix: FULL PROTECTED HISTORY, STREAMING, SAFE SAVE)
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

# --- CONFIGURATION ---
load_dotenv()

OPENROUTER_API_KEY = os.getenv('OPENROUTER_API_KEY', '')
OPENROUTER_API_URL = "https://openrouter.ai/api/v1"

CHAT_MODEL = os.getenv('OPENROUTER_MODEL', 'nousresearch/hermes-4-70b')
SUMMARY_MODEL = os.getenv('SUMMARIZATION_MODEL', 'meta-llama/llama-3-8b-instruct')

THINKING_BLOCK = "┌───────────────────────────────────────────┐\n│ 🎬 THINKING... │\n└───────────────────────────────────────────┘\n"

DEFAULT_SYSTEM_PROMPT = """
# IDENTITY
You are the **Helluva Director**. You control NPCs and the environment in Helluva Boss. You NEVER write for the User.

# OUTPUT CONFIGURATION
**Verbosity:** Extreme, 400-800 words. Vivid, sensory-rich. Real-time pacing.

# RULES
- Show, don't tell.
- NPC autonomy: they interrupt, ignore, drag User.
- Violence matters. Wounds bleed. Ammo runs out.

# CONTEXT INGESTION
Includes <Scene>, <Lore>, <Profile>, <History>.
""".strip()

DEFAULT_SUMMARIZATION_PROMPT = """
Summarize the following, focus on plot, character evolution, and emotions, not dialogue. 1-4 paragraphs.
""".strip()

# --- PATH SETUP ---
app = Flask(__name__)
CORS(app)
app.config['MAX_CONTENT_LENGTH'] = 1024 * 1024 * 1024

BASE_DIR = Path(__file__).parent
DATA_DIR = BASE_DIR / 'data'
SHOWS_DIR = DATA_DIR / 'shows'
INSTANCES_DIR = DATA_DIR / 'instances'

for d in [DATA_DIR, SHOWS_DIR, INSTANCES_DIR]:
    d.mkdir(parents=True, exist_ok=True)

# Create default show
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

# --- HELPERS ---
def get_headers():
    return {
        "Authorization": f"Bearer {OPENROUTER_API_KEY}",
        "Content-Type": "application/json",
        "HTTP-Referer": "http://localhost:5000",
        "X-Title": "Roleplay Terminal"
    }

def stream_openrouter(messages, model):
    if not OPENROUTER_API_KEY:
        yield "[Error: OPENROUTER_API_KEY not set]\n"
        return
    try:
        url = f"{OPENROUTER_API_URL}/chat/completions"
        payload = {"model": model, "messages": messages, "stream": True, "max_tokens": 4096}
        with requests.post(url, headers=get_headers(), json=payload, stream=True, timeout=60) as resp:
            if resp.status_code >= 400:
                yield f"[Error: OpenRouter {resp.status_code}]\n"
                return
            for line in resp.iter_lines():
                if not line: continue
                l = line.decode('utf-8')
                if l.startswith('data: '):
                    data_str = l[6:]
                    if data_str.strip() == '[DONE]': break
                    try:
                        data = json.loads(data_str)
                        token = data.get('choices', [{}])[0].get('delta', {}).get('content', '')
                        if token: yield token
                    except: continue
    except Exception as e:
        yield f"[Error: {str(e)}]\n"

def call_summary_api(text):
    if not OPENROUTER_API_KEY: return "Summary unavailable (No Key)"
    if not text.strip(): return "Nothing happened."
    sys_prompt = os.getenv("SUMMARIZATION_PROMPT", DEFAULT_SUMMARIZATION_PROMPT)
    messages = [
        {"role": "system", "content": sys_prompt},
        {"role": "user", "content": f"Transcript:\n{text}"}
    ]
    try:
        resp = requests.post(f"{OPENROUTER_API_URL}/chat/completions", headers=get_headers(),
                             json={"model": SUMMARY_MODEL, "messages": messages, "temperature": 1, "stream": False, "top_p": 0.95, },
                             timeout=60)
        if resp.status_code == 200:
            return resp.json()['choices'][0]['message']['content']
        else:
            return f"Summary failed (API {resp.status_code})"
    except Exception as e:
        return f"Summary failed (Connection Error: {e})"

# --- ROUTES ---
@app.route('/health', methods=['GET'])
def health():
    return jsonify({"status": "ok", "chat_model": CHAT_MODEL, "summary_model": SUMMARY_MODEL})

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
        try: shows.append(json.load(open(f, 'r')))
        except: continue
    return jsonify(shows)

@app.route('/shows/<id>', methods=['PUT','DELETE'])
def handle_show_id(id):
    path = SHOWS_DIR / f"{id}.json"
    if request.method == 'DELETE':
        if path.exists(): path.unlink()
        return jsonify({"success": True})
    if not path.exists(): return jsonify({"error": "Not found"}), 404
    with open(path, 'r') as f: existing = json.load(f)
    existing.update(request.json)
    with open(path, 'w') as f: json.dump(existing, f, indent=2)
    return jsonify(existing)

@app.route('/instances', methods=['GET','POST'])
def handle_instances():
    if request.method == 'POST':
        data = request.json
        show_path = SHOWS_DIR / f"{data.get('showId')}.json"
        if not show_path.exists(): return jsonify({"error": "Show not found"}), 404
        show = json.load(open(show_path, 'r'))
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
        with open(INSTANCES_DIR / f"{instance_id}.json", 'w') as f: json.dump(instance, f, indent=2)
        return jsonify(instance)
    instances = []
    for f in INSTANCES_DIR.glob('*.json'):
        try: instances.append(json.load(open(f, 'r')))
        except: continue
    instances.sort(key=lambda x: x.get('lastPlayed',''), reverse=True)
    return jsonify(instances)

@app.route('/instances/<id>', methods=['GET','PUT','DELETE'])
def handle_instance_id(id):
    path = INSTANCES_DIR / f"{id}.json"
    if request.method == 'DELETE':
        if path.exists(): path.unlink()
        return jsonify({"success": True})
    if not path.exists(): return jsonify({"error": "Not found"}), 404
    with open(path, 'r') as f: current = json.load(f)
    data = request.json if request.method=='PUT' else {}

    # Protect messages
    if 'messages' in data:
        server_count = len(current.get('messages', []))
        client_count = len(data['messages'])
        if client_count >= server_count: current['messages'] = data['messages']
    for fkey in ['lore','profile','currentEpisodeIndex']:
        if fkey in data: current[fkey] = data[fkey]
    if 'summaryHistory' in data:
        if len(data['summaryHistory']) >= len(current.get('summaryHistory', [])):
            current['summaryHistory'] = data['summaryHistory']
    current['lastPlayed'] = datetime.now().isoformat()
    with open(path, 'w') as f: json.dump(current, f, indent=2)
    return jsonify(current)

@app.route('/instances/<id>/reset-messages', methods=['POST'])
def reset_messages(id):
    path = INSTANCES_DIR / f"{id}.json"
    if not path.exists(): return jsonify({"error": "Not found"}), 404
    inst = json.load(open(path,'r'))
    cleared = len(inst.get('messages',[]))
    inst['messages'] = []
    inst['lastPlayed'] = datetime.now().isoformat()
    json.dump(inst, open(path,'w'), indent=2)
    return jsonify({"success": True, "cleared": cleared})

@app.route('/instances/<id>/message-count', methods=['GET'])
def get_message_count(id):
    path = INSTANCES_DIR / f"{id}.json"
    if not path.exists(): return jsonify({"error": "Not found"}), 404
    inst = json.load(open(path,'r'))
    messages = inst.get('messages',[])
    return jsonify({"count": len(messages),
                    "breakdown": {"user": len([m for m in messages if m.get('role')=='user']),
                                  "assistant": len([m for m in messages if m.get('role')=='assistant'])}})

@app.route('/instances/<id>/advance', methods=['POST'])
def advance_instance(id):
    path = INSTANCES_DIR / f"{id}.json"
    if not path.exists(): return jsonify({"error": "Not found"}), 404
    inst = json.load(open(path,'r'))
    transcript = "\n".join([f"{m['role'].upper()}: {m['content']}" for m in inst.get('messages',[])])
    summary = call_summary_api(transcript)
    ep_idx = inst.get('currentEpisodeIndex',0)
    ep_name = inst['episodes'][ep_idx]['name'] if ep_idx < len(inst['episodes']) else "Unknown"
    inst['summaryHistory'].append({"episodeName": ep_name, "summary": summary, "timestamp": datetime.now().isoformat()})
    inst['currentEpisodeIndex'] += 1
    inst['messages'] = []
    inst['lastPlayed'] = datetime.now().isoformat()
    json.dump(inst, open(path,'w'), indent=2)
    finished = inst['currentEpisodeIndex'] >= len(inst['episodes'])
    return jsonify({"success": True, "summary": summary, "finished": finished})


@app.route('/chat', methods=['POST'])
def chat():
    data = request.json
    instance_id = data.get('instanceId')
    user_input = data.get('message', '')
    model = data.get('model', CHAT_MODEL)

    if not instance_id: return jsonify({"error": "Missing instanceId"}), 400
    path = INSTANCES_DIR / f"{instance_id}.json"
    if not path.exists(): return jsonify({"error": "Instance not found"}), 404

    # --- Load instance ---
    inst = json.load(open(path, 'r'))
    messages = inst.get('messages', [])

    # --- Append user input ---
    if user_input:
        messages.append({"role": "user", "content": user_input})
        inst['messages'] = messages
        inst['lastPlayed'] = datetime.now().isoformat()
        json.dump(inst, open(path, 'w'), indent=2)

    # --- Build system prompt ---
    sys_block = os.getenv("PROMPT", DEFAULT_SYSTEM_PROMPT)
    ep_idx = inst.get('currentEpisodeIndex', 0)
    if ep_idx < len(inst.get('episodes', [])):
        sys_block += f"\n\n<!-- SCENE -->\n{inst['episodes'][ep_idx].get('context', '')}"
    if inst.get('lore'): sys_block += f"\n\n<!-- LORE -->\n{inst['lore']}"
    if inst.get('profile'): sys_block += f"\n\n<!-- PROFILE -->\n{inst['profile']}"
    if inst.get('summaryHistory'):
        hist = "\n".join([f"• [{h['episodeName']}]: {h['summary']}" for h in inst['summaryHistory']])
        sys_block += f"\n\n<!-- PREVIOUSLY ON -->\n{hist}"

    prompt_msgs = [{"role": "system", "content": sys_block}] + messages

    # --- Streaming generator ---
    def generate():
        full_resp = ""
        for token in stream_openrouter(prompt_msgs, model):
            full_resp += token
            yield f"data: {json.dumps({'token': token})}\n\n"

        # Append AI reply to messages immediately
        if full_resp.strip():
            inst['messages'].append({"role": "assistant", "content": full_resp})
            inst['lastPlayed'] = datetime.now().isoformat()
            json.dump(inst, open(path, 'w'), indent=2)

        yield "data: [DONE]\n\n"

    return Response(generate(), mimetype='text/event-stream')

# --- MAIN ---
if __name__ == '__main__':
    print("="*60)
    print(f"🚀 BACKEND v2.7.1 - PROTECTED HISTORY")
    print("="*60)
    if not OPENROUTER_API_KEY: print("⚠️ WARNING: OPENROUTER_API_KEY missing")
    else: print("🔑 API Key found.")
    print(f"💬 Chat Model: {CHAT_MODEL}")
    print(f"📝 Summary Model: {SUMMARY_MODEL}")
    print("="*60)
    app.run(host='0.0.0.0', port=5000, debug=True, threaded=True)
