#!/usr/bin/env python3
"""
Roleplay Terminal Backend v3.4.0
Fixed: Strict Transcript Following Mode
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

# ═══════════════════════════════════════════════════════════════════════════════
#                              CONFIGURATION
# ═══════════════════════════════════════════════════════════════════════════════

load_dotenv()

app = Flask(__name__)
CORS(app)
app.config['MAX_CONTENT_LENGTH'] = 1024 * 1024 * 1024  # 1GB limit

# API Configuration
OPENROUTER_API_KEY = os.getenv('OPENROUTER_API_KEY', '')
OPENROUTER_API_URL = "https://openrouter.ai/api/v1"

# Model Defaults
_env_model = os.getenv('OPENROUTER_MODEL')
CHAT_MODEL = _env_model if _env_model else 'google/gemini-3-pro-preview'
SUMMARY_MODEL = _env_model if _env_model else 'google/gemini-3-pro-preview'

# Directory Setup
BASE_DIR = Path(__file__).parent
DATA_DIR = BASE_DIR / 'data'
SHOWS_DIR = DATA_DIR / 'shows'
INSTANCES_DIR = DATA_DIR / 'instances'
PROMPTS_DIR = BASE_DIR / 'prompts'

# Ensure directories exist
for d in [DATA_DIR, SHOWS_DIR, INSTANCES_DIR, PROMPTS_DIR]:
    d.mkdir(parents=True, exist_ok=True)

# ═══════════════════════════════════════════════════════════════════════════════
#                        OPTIMIZED PROMPTS (TRANSCRIPT MODE)
# ═══════════════════════════════════════════════════════════════════════════════

DEFAULT_SYSTEM_PROMPT = """<system_instruction>
  <role_definition>
    You are a transcript narrator. Your job is to present the episode transcript section by section.
  </role_definition>

  <output_rules>
    1. Output ONLY text that appears in the provided transcript
    2. Copy dialogue and narration exactly as written
    3. Stop after 2-4 paragraphs or at a natural scene break
    4. DO NOT add new content, embellishments, or creative additions
    5. DO NOT modify the transcript's wording or style
  </output_rules>
</system_instruction>"""

DEFAULT_REINFORCEMENT = """<final_check>
  Before sending your response:
  1. Verify every sentence comes directly from the transcript
  2. Confirm you haven't added any new dialogue or scenes
  3. Check that you've stopped at an appropriate pause point

  If the transcript is complete, output: [Episode Complete]
</final_check>"""

DEFAULT_SUMMARY_PROMPT = """<task>
  You are the "Campaign Archivist." Your sole function is to compress the narrative into dry, clinical, objective bullet points.
</task>
<guidelines>
  - Style: Robotic, police-report style. No emotions.
  - Content: Record locations, items, injuries, and decisions.
</guidelines>
<output_format>
  Provide the summary as a list of bullet points.
</output_format>"""

DEFAULT_ANCHOR = """You are presenting an episode transcript section by section.

Follow the transcript exactly. Do not add new content."""


# ═══════════════════════════════════════════════════════════════════════════════
#                              HELPERS
# ═══════════════════════════════════════════════════════════════════════════════

def load_prompt(filename, default_text):
    """Loads a prompt from a .txt file, creating it if it doesn't exist."""
    path = PROMPTS_DIR / filename
    if not path.exists():
        with open(path, 'w', encoding='utf-8') as f:
            f.write(default_text)
        return default_text
    with open(path, 'r', encoding='utf-8') as f:
        return f.read().strip()


def get_headers():
    return {
        "Authorization": f"Bearer {OPENROUTER_API_KEY}",
        "Content-Type": "application/json",
        "HTTP-Referer": "http://localhost:5000",
        "X-Title": "Roleplay Terminal"
    }


def stream_openrouter(messages, model):
    """Generates streaming tokens from OpenRouter."""
    if not OPENROUTER_API_KEY:
        yield "[Error: OPENROUTER_API_KEY not set]"
        return

    print(f"[API CALL] Model: {model}")

    try:
        payload = {
            "model": model,
            "messages": messages,
            "stream": True,
            "max_tokens": 4096,
            "temperature": 1.0,
            "top_p": 0.95,
            "provider": {
                "order": ["Anthropic"],
                "allow_fallbacks": True
            }
        }

        with requests.post(
                f"{OPENROUTER_API_URL}/chat/completions",
                headers=get_headers(),
                json=payload,
                stream=True,
                timeout=120
        ) as resp:
            if resp.status_code >= 400:
                error_text = resp.text
                print(f"\n[API ERROR] Status: {resp.status_code}")
                print(f"[API ERROR] Body: {error_text}\n")
                yield f"[Error: API returned {resp.status_code} - Check Server Logs]"
                return

            for line in resp.iter_lines():
                if not line:
                    continue
                decoded = line.decode('utf-8')
                if decoded.startswith('data: '):
                    data_str = decoded[6:]
                    if data_str.strip() == '[DONE]':
                        break
                    try:
                        data = json.loads(data_str)
                        if 'error' in data:
                            print(f"[STREAM CHUNK ERROR] {data['error']}")
                            yield f"[Error: {data['error']['message']}]"

                        token = data.get('choices', [{}])[0].get('delta', {}).get('content', '')
                        if token:
                            yield token
                    except:
                        continue
    except Exception as e:
        print(f"[CONNECTION EXCEPTION] {e}")
        yield f"[Error: Connection failed - {str(e)}]"


def call_summary_api(transcript_text):
    """Non-streaming call to summarize episode text."""
    if not OPENROUTER_API_KEY:
        return "• [Summary unavailable: No API Key]"

    summary_prompt = load_prompt("SUMMARY_PROMPT.txt", DEFAULT_SUMMARY_PROMPT)

    try:
        resp = requests.post(
            f"{OPENROUTER_API_URL}/chat/completions",
            headers=get_headers(),
            json={
                "model": SUMMARY_MODEL,
                "messages": [
                    {"role": "system", "content": summary_prompt},
                    {"role": "user", "content": transcript_text}
                ],
                "temperature": 0.3,
                "stream": False
            },
            timeout=60
        )
        if resp.status_code == 200:
            return resp.json()['choices'][0]['message']['content']
        return f"• Summary generation failed (API {resp.status_code})"
    except Exception as e:
        return f"• Summary generation error: {str(e)}"


# ═══════════════════════════════════════════════════════════════════════════════
#                              INITIALIZATION
# ═══════════════════════════════════════════════════════════════════════════════

if not list(SHOWS_DIR.glob('*.json')):
    default_show = {
        "id": "default",
        "name": "New Story",
        "description": "A new adventure template.",
        "lore": "The world is vast and unknown...",
        "profile": "You are a traveler...",
        "episodes": [
            {"id": "e1", "name": "Chapter 1", "context": "The journey begins."}
        ]
    }
    with open(SHOWS_DIR / "default.json", "w") as f:
        json.dump(default_show, f, indent=2)


# ═══════════════════════════════════════════════════════════════════════════════
#                              ROUTES
# ═══════════════════════════════════════════════════════════════════════════════

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
            shows.append(json.load(open(f, 'r')))
        except:
            continue
    return jsonify(shows)


@app.route('/shows/<show_id>', methods=['PUT', 'DELETE'])
def handle_show_id(show_id):
    path = SHOWS_DIR / f"{show_id}.json"
    if request.method == 'DELETE':
        if path.exists():
            path.unlink()
        return jsonify({"success": True})
    if not path.exists():
        return jsonify({"error": "Not found"}), 404
    with open(path, 'r') as f:
        existing = json.load(f)
    data = request.json
    for field in ['name', 'description', 'lore', 'profile', 'episodes']:
        if field in data:
            existing[field] = data[field]
    with open(path, 'w') as f:
        json.dump(existing, f, indent=2)
    return jsonify(existing)


@app.route('/instances', methods=['GET', 'POST'])
def handle_instances():
    if request.method == 'POST':
        data = request.json
        show_path = SHOWS_DIR / f"{data.get('showId')}.json"
        if not show_path.exists():
            return jsonify({"error": "Show not found"}), 404
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
        with open(INSTANCES_DIR / f"{instance_id}.json", 'w') as f:
            json.dump(instance, f, indent=2)
        return jsonify(instance)

    instances = []
    for f in INSTANCES_DIR.glob('*.json'):
        try:
            instances.append(json.load(open(f, 'r')))
        except:
            continue
    instances.sort(key=lambda x: x.get('lastPlayed', ''), reverse=True)
    return jsonify(instances)


@app.route('/instances/<inst_id>', methods=['GET', 'PUT', 'DELETE'])
def handle_instance_id(inst_id):
    path = INSTANCES_DIR / f"{inst_id}.json"
    if request.method == 'DELETE':
        if path.exists():
            path.unlink()
        return jsonify({"success": True})
    if not path.exists():
        return jsonify({"error": "Not found"}), 404
    if request.method == 'GET':
        return jsonify(json.load(open(path, 'r')))
    with open(path, 'r') as f:
        current = json.load(f)
    data = request.json
    for key in ['messages', 'lore', 'profile', 'currentEpisodeIndex', 'summaryHistory']:
        if key in data:
            current[key] = data[key]
    current['lastPlayed'] = datetime.now().isoformat()
    with open(path, 'w') as f:
        json.dump(current, f, indent=2)
    return jsonify(current)


@app.route('/instances/<inst_id>/advance', methods=['POST'])
def advance_episode(inst_id):
    path = INSTANCES_DIR / f"{inst_id}.json"
    if not path.exists():
        return jsonify({"error": "Not found"}), 404
    inst = json.load(open(path, 'r'))

    transcript = ""
    for m in inst.get('messages', []):
        role = "PLAYER" if m['role'] == 'user' else "STORY"
        transcript += f"{role}: {m['content']}\n\n"
    if not transcript.strip():
        transcript = "[No events recorded]"

    summary_text = call_summary_api(transcript)

    ep_idx = inst.get('currentEpisodeIndex', 0)
    episodes = inst.get('episodes', [])
    ep_name = episodes[ep_idx]['name'] if ep_idx < len(episodes) else f"Episode {ep_idx + 1}"

    inst.setdefault('summaryHistory', []).append({
        "episodeName": ep_name,
        "summary": summary_text,
        "timestamp": datetime.now().isoformat()
    })
    inst['currentEpisodeIndex'] += 1
    inst['messages'] = []
    inst['lastPlayed'] = datetime.now().isoformat()

    with open(path, 'w') as f:
        json.dump(inst, f, indent=2)
    return jsonify({
        "success": True,
        "summary": summary_text,
        "nextEpisodeIndex": inst['currentEpisodeIndex']
    })


# ═══════════════════════════════════════════════════════════════════════════════
#                              CHAT LOGIC
# ═══════════════════════════════════════════════════════════════════════════════

def build_prompt_chain(instance):
    """Constructs prompt with transcript in LATEST user message for guaranteed visibility."""
    messages = []

    # 1. SIMPLE SYSTEM PROMPT - Just set the role
    anchor = load_prompt("ANCHOR_PROMPT.txt", DEFAULT_ANCHOR)
    system_prompt = load_prompt("SYSTEM_PROMPT.txt", DEFAULT_SYSTEM_PROMPT)
    messages.append({"role": "system", "content": f"{anchor}\n\n{system_prompt}"})

    # 2. Get the episode transcript
    ep_idx = instance.get('currentEpisodeIndex', 0)
    episodes = instance.get('episodes', [])
    ep_transcript = ""
    ep_name = ""

    if ep_idx < len(episodes):
        current_ep = episodes[ep_idx]
        ep_name = current_ep.get('name', '')
        ep_transcript = current_ep.get('context', '')

    # 3. Add conversation history (all but the last user message)
    conv_messages = instance.get('messages', [])
    MAX_HISTORY = 20
    if len(conv_messages) > MAX_HISTORY:
        conv_messages = conv_messages[-MAX_HISTORY:]

    for msg in conv_messages[:-1]:  # All except last message
        content = msg.get('content', '').strip()
        if not content:
            continue
        role = 'assistant' if msg.get('role') == 'assistant' else 'user'
        messages.append({"role": role, "content": content})

    # 4. THE KEY FIX: Add transcript to the FINAL user message
    # This ensures the AI sees it immediately before generating
    last_user_msg = ""
    if conv_messages:
        last_msg = conv_messages[-1]
        if last_msg.get('role') == 'user':
            last_user_msg = last_msg.get('content', '').strip()

    if ep_transcript:
        # Build the combined message with transcript FIRST, then user input
        final_message = f"""<EPISODE_TRANSCRIPT>
Episode: {ep_name}

{ep_transcript}
</EPISODE_TRANSCRIPT>

<INSTRUCTIONS>
Continue the transcript from where we left off. Output the next 2-4 paragraphs EXACTLY as written above.
Do NOT add new dialogue or scenes. Copy the text verbatim.
</INSTRUCTIONS>

User action: {last_user_msg if last_user_msg else "[Waiting]"}"""

        messages.append({"role": "user", "content": final_message})
    else:
        # No transcript mode - just use the user's message
        if last_user_msg:
            messages.append({"role": "user", "content": last_user_msg})

    return messages


@app.route('/chat', methods=['POST'])
def chat():
    print("\n[DEBUG] Incoming /chat Request")

    data = request.get_json(force=True, silent=True)
    if not data:
        print("[ERROR] Failed to parse JSON body")
        return jsonify({"error": "Invalid JSON"}), 400

    instance_id = data.get('instanceId')
    print(f"[DEBUG] Payload instanceId: {instance_id}")

    if not instance_id:
        print("[ERROR] instanceId is missing from payload")
        return jsonify({"error": "Missing instanceId"}), 400

    path = INSTANCES_DIR / f"{instance_id}.json"
    if not path.exists():
        print(f"[ERROR] Instance file not found: {path}")
        return jsonify({"error": "Instance not found"}), 404

    with open(path, 'r') as f:
        inst = json.load(f)

    user_input = data.get('message', '')
    requested_model = data.get('model')
    model = requested_model if requested_model else CHAT_MODEL

    if not model:
        model = 'google/gemini-3-pro-preview'

    if user_input:
        # De-duplication check
        should_append = True
        if inst['messages']:
            last_msg = inst['messages'][-1]
            if last_msg.get('role') == 'user' and last_msg.get('content') == user_input:
                print(f"[DEBUG] Duplicate message blocked")
                should_append = False

        if should_append:
            inst['messages'].append({"role": "user", "content": user_input})
            inst['lastPlayed'] = datetime.now().isoformat()
            with open(path, 'w') as f:
                json.dump(inst, f, indent=2)

    prompt_msgs = build_prompt_chain(inst)

    print(f"[DEBUG] Prompt chain: {len(prompt_msgs)} messages")

    def generate():
        full_response = ""
        error_occurred = False
        try:
            for token in stream_openrouter(prompt_msgs, model):
                full_response += token
                yield f"data: {json.dumps({'token': token})}\n\n"
        except Exception as e:
            error_occurred = True
            print(f"[STREAM ERROR] {e}")
            yield f"data: {json.dumps({'error': str(e)})}\n\n"

        if full_response.strip() and not error_occurred:
            try:
                with open(path, 'r') as f:
                    current_inst = json.load(f)
                current_inst['messages'].append({"role": "assistant", "content": full_response})
                current_inst['lastPlayed'] = datetime.now().isoformat()
                with open(path, 'w') as f:
                    json.dump(current_inst, f, indent=2)
            except Exception as e:
                print(f"[SAVE ERROR] {e}")

        yield "data: [DONE]\n\n"

    return Response(generate(), mimetype='text/event-stream')


if __name__ == '__main__':
    print(f"═" * 50)
    print(f"  ROLEPLAY TERMINAL v3.4.0")
    print(f"  Mode: STRICT TRANSCRIPT PLAYBACK")
    print(f"  Model: {CHAT_MODEL}")
    print(f"═" * 50)
    app.run(host='0.0.0.0', port=5000, debug=True, threaded=True)