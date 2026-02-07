#!/usr/bin/env python3
"""
Roleplay Terminal Backend v4.0.0
Transcript Fidelity + Dialogue Priority Mode
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
CHAT_MODEL = _env_model if _env_model else 'anthropic/claude-sonnet-4'
SUMMARY_MODEL = _env_model if _env_model else 'anthropic/claude-sonnet-4'

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
#                        DEFAULT PROMPTS (FALLBACKS)
# ═══════════════════════════════════════════════════════════════════════════════

DEFAULT_ANCHOR = """You are the Helluva Director. You novelize episode transcripts — the User's character is inserted into canon events as they play out.

The episode transcript is YOUR SCRIPT. Copy NPC dialogue WORD-FOR-WORD. Follow events in order. The User is inserted INTO the episode. Prioritize dialogue and events over description (50%+ dialogue). Check conversation history to find where you left off.

User dialogue rules: If they provide words, use EXACTLY those words, nothing more. If they don't provide words, write ZERO dialogue for them.

If the transcript is exhausted, output: [Episode Complete]"""

DEFAULT_SYSTEM_PROMPT = """You novelize episode transcripts. Core rules:
1. Copy NPC dialogue WORD-FOR-WORD from the transcript
2. Follow scenes in order — never skip, never rearrange
3. User dialogue: use their EXACT words only (or zero if none provided)
4. 50%+ dialogue and action, minimal description
5. End with an NPC directly addressing the User's character
6. Never summarize — write out conversations fully"""

DEFAULT_REINFORCEMENT = """VERIFY BEFORE OUTPUT:
1. Every NPC line matches the transcript VERBATIM
2. User dialogue uses their EXACT words only — no additions, no repeats
3. At least 50% dialogue/action, minimal description
4. At least 3-5 NPC dialogue lines
5. 2-3 NPC acknowledgments of the User's presence
6. Response ENDS with an NPC addressing the User directly
7. Continued from correct position — no restarts, no repeats
8. No brackets, no asterisks, proper punctuation
Output ONLY polished narrative prose. No checklists."""

DEFAULT_SUMMARY_PROMPT = """Compress the session into concise, objective bullet points.
Style: Clinical, police-report tone.
Content: Locations, NPCs, items, injuries, decisions, key dialogue, plot developments, unresolved threads, User character actions and NPC reactions.
Format: Bullet-point list grouped by scene/event."""


# ═══════════════════════════════════════════════════════════════════════════════
#                              HELPERS
# ═══════════════════════════════════════════════════════════════════════════════

def load_prompt(filename, default_text):
    """Loads a prompt from a .txt file, creating it with default if it doesn't exist."""
    path = PROMPTS_DIR / filename
    if not path.exists():
        with open(path, 'w', encoding='utf-8') as f:
            f.write(default_text)
        print(f"[INIT] Created {filename} with default content")
        return default_text
    with open(path, 'r', encoding='utf-8') as f:
        content = f.read().strip()
    return content if content else default_text


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

    print(f"[API] Model: {model} | Messages: {len(messages)}")

    try:
        payload = {
            "model": model,
            "messages": messages,
            "stream": True,
            "max_tokens": 4096,
            "temperature": 1.0,
            "top_p": 0.95,
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
                print(f"[API ERROR] Status: {resp.status_code}")
                print(f"[API ERROR] Body: {error_text[:500]}")
                yield f"[Error: API returned {resp.status_code}]"
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
                            print(f"[STREAM ERROR] {data['error']}")
                            yield f"[Error: {data['error'].get('message', 'Unknown')}]"
                            return
                        token = data.get('choices', [{}])[0].get('delta', {}).get('content', '')
                        if token:
                            yield token
                    except json.JSONDecodeError:
                        continue
    except requests.exceptions.Timeout:
        print("[API] Request timed out")
        yield "[Error: Request timed out]"
    except Exception as e:
        print(f"[API EXCEPTION] {e}")
        yield f"[Error: {str(e)}]"


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
                    {"role": "user", "content": f"Summarize this session:\n\n{transcript_text}"}
                ],
                "temperature": 0.3,
                "max_tokens": 2048,
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
#                         PROMPT CHAIN BUILDER
# ═══════════════════════════════════════════════════════════════════════════════

def build_prompt_chain(instance):
    """
    Constructs the full message chain for the API call.

    Structure:
      1. SYSTEM: Anchor + System Prompt
      2. Context block: lore + profile + summaries + episode transcript (EVERY turn)
      3. Synthetic acknowledgment
      4. Conversation history (trimmed, all but last message)
      5. Final user message + reinforcement
    """
    messages = []

    # ─── 1. SYSTEM MESSAGE ────────────────────────────────────────────────
    anchor = load_prompt("ANCHOR_PROMPT.txt", DEFAULT_ANCHOR)
    system_prompt = load_prompt("SYSTEM_PROMPT.txt", DEFAULT_SYSTEM_PROMPT)
    messages.append({
        "role": "system",
        "content": f"{anchor}\n\n{system_prompt}"
    })

    # ─── 2. PERSISTENT CONTEXT BLOCK (sent EVERY turn) ───────────────────
    context_parts = []

    # World lore
    lore = instance.get('lore', '').strip()
    if lore:
        context_parts.append(f"<world_lore>\n{lore}\n</world_lore>")

    # Character profile
    profile = instance.get('profile', '').strip()
    if profile:
        context_parts.append(f"<user_character>\n{profile}\n</user_character>")

    # Previous episode summaries
    summaries = instance.get('summaryHistory', [])
    if summaries:
        summary_lines = []
        for s in summaries:
            ep_name = s.get('episodeName', 'Unknown Episode')
            ep_summary = s.get('summary', '(No summary available)')
            summary_lines.append(f"### {ep_name}\n{ep_summary}")
        context_parts.append(
            "<previous_episodes>\n" + "\n\n".join(summary_lines) + "\n</previous_episodes>"
        )

    # Episode transcript — ALWAYS included
    ep_idx = instance.get('currentEpisodeIndex', 0)
    episodes = instance.get('episodes', [])
    ep_context = ""
    ep_name = ""

    if ep_idx < len(episodes):
        current_ep = episodes[ep_idx]
        ep_name = current_ep.get('name', f'Episode {ep_idx + 1}')
        ep_context = current_ep.get('context', '').strip()

    if ep_context:
        context_parts.append(
            f'<episode_transcript title="{ep_name}">\n'
            f'{ep_context}\n'
            f'</episode_transcript>'
        )

    # ─── 3. INJECT CONTEXT WITH SYNTHETIC ACK ────────────────────────────
    if context_parts:
        context_block = "\n\n".join(context_parts)
        messages.append({"role": "user", "content": context_block})
        messages.append({
            "role": "assistant",
            "content": (
                "Context loaded. I will:\n"
                "• Follow the episode transcript beat by beat\n"
                "• Copy NPC dialogue WORD-FOR-WORD\n"
                "• Use the User's EXACT dialogue (no additions) or zero if none provided\n"
                "• Prioritize dialogue over description\n"
                "• Check conversation history to continue from the correct position\n"
                "• End with an NPC addressing the User's character"
            )
        })

    # ─── 4. CONVERSATION HISTORY (all but last message) ──────────────────
    conv_messages = instance.get('messages', [])
    MAX_HISTORY = 30  # Increased to help with position tracking
    if len(conv_messages) > MAX_HISTORY:
        conv_messages = conv_messages[-MAX_HISTORY:]

    for msg in conv_messages[:-1]:
        content = msg.get('content', '').strip()
        if not content:
            continue
        role = 'assistant' if msg.get('role') == 'assistant' else 'user'
        messages.append({"role": role, "content": content})

    # ─── 5. FINAL USER MESSAGE + REINFORCEMENT ──────────────────────────
    last_user_msg = ""
    if conv_messages:
        last_msg = conv_messages[-1]
        if last_msg.get('role') == 'user':
            last_user_msg = last_msg.get('content', '').strip()

    reinforcement = load_prompt("REINFORCEMENT_PROMPT.txt", DEFAULT_REINFORCEMENT)

    is_episode_start = len(
        [m for m in instance.get('messages', []) if m.get('role') == 'assistant']
    ) == 0

    final_parts = []

    if last_user_msg:
        final_parts.append(f"USER ACTION/DIALOGUE:\n{last_user_msg}")
    elif is_episode_start:
        final_parts.append(
            "[BEGIN EPISODE]\n"
            "Start from the top of the transcript. "
            "Brief scene-setting (1-2 sentences), then get into dialogue immediately. "
            "End with an NPC addressing the User's character."
        )
    else:
        final_parts.append(
            "[CONTINUE]\n"
            "Continue from where we left off in the transcript. "
            "Check the conversation history to find your position. "
            "The User is present. Advance to the next beats. "
            "End with an NPC addressing the User's character."
        )

    final_parts.append(f"\n{reinforcement}")
    messages.append({"role": "user", "content": "\n\n".join(final_parts)})

    # Debug logging
    transcript_len = len(ep_context) if ep_context else 0
    history_count = len(conv_messages)
    print(
        f"[CHAIN] Messages: {len(messages)} | "
        f"Episode: {ep_name} | "
        f"Transcript: {transcript_len} chars | "
        f"History: {history_count} | "
        f"Start: {is_episode_start}"
    )
    return messages


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
    print("[INIT] Created default show")


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
        except Exception as e:
            print(f"[WARN] Failed to load show {f}: {e}")
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
        except Exception as e:
            print(f"[WARN] Failed to load instance {f}: {e}")
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
    for key in ['messages', 'lore', 'profile', 'currentEpisodeIndex', 'summaryHistory', 'episodes']:
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

    # Build transcript of the session
    transcript = ""
    for m in inst.get('messages', []):
        role = "USER" if m['role'] == 'user' else "STORY"
        transcript += f"{role}:\n{m['content']}\n\n"
    if not transcript.strip():
        transcript = "[No events recorded this session]"

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

    print(f"[ADVANCE] {inst_id} → Episode {inst['currentEpisodeIndex']}")
    return jsonify({
        "success": True,
        "summary": summary_text,
        "nextEpisodeIndex": inst['currentEpisodeIndex']
    })


@app.route('/chat', methods=['POST'])
def chat():
    data = request.get_json(force=True, silent=True)
    if not data:
        return jsonify({"error": "Invalid JSON"}), 400

    instance_id = data.get('instanceId')
    if not instance_id:
        return jsonify({"error": "Missing instanceId"}), 400

    path = INSTANCES_DIR / f"{instance_id}.json"
    if not path.exists():
        return jsonify({"error": "Instance not found"}), 404

    with open(path, 'r') as f:
        inst = json.load(f)

    user_input = data.get('message', '').strip()
    requested_model = data.get('model')
    model = requested_model if requested_model else CHAT_MODEL

    # Add user message if provided (with dedup check)
    if user_input:
        should_append = True
        if inst['messages']:
            last_msg = inst['messages'][-1]
            if last_msg.get('role') == 'user' and last_msg.get('content') == user_input:
                print(f"[DEDUP] Duplicate user message blocked")
                should_append = False

        if should_append:
            inst['messages'].append({"role": "user", "content": user_input})
            inst['lastPlayed'] = datetime.now().isoformat()
            with open(path, 'w') as f:
                json.dump(inst, f, indent=2)

    prompt_msgs = build_prompt_chain(inst)

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

        # Save assistant response
        if full_response.strip() and not error_occurred:
            try:
                with open(path, 'r') as f:
                    current_inst = json.load(f)
                current_inst['messages'].append({
                    "role": "assistant",
                    "content": full_response
                })
                current_inst['lastPlayed'] = datetime.now().isoformat()
                with open(path, 'w') as f:
                    json.dump(current_inst, f, indent=2)
                print(f"[SAVED] Assistant response: {len(full_response)} chars")
            except Exception as e:
                print(f"[SAVE ERROR] {e}")

        yield "data: [DONE]\n\n"

    return Response(generate(), mimetype='text/event-stream')


@app.route('/health', methods=['GET'])
def health():
    return jsonify({
        "status": "ok",
        "model": CHAT_MODEL,
        "api_key_set": bool(OPENROUTER_API_KEY)
    })


# ═══════════════════════════════════════════════════════════════════════════════
#                              MAIN
# ═══════════════════════════════════════════════════════════════════════════════

if __name__ == '__main__':
    print("═" * 60)
    print("  ROLEPLAY TERMINAL v4.0.0")
    print("  Mode: TRANSCRIPT FIDELITY + DIALOGUE PRIORITY")
    print(f"  Chat Model: {CHAT_MODEL}")
    print(f"  Summary Model: {SUMMARY_MODEL}")
    print(f"  API Key: {'Set' if OPENROUTER_API_KEY else 'NOT SET'}")
    print("═" * 60)

    # Load prompts on startup to create files if missing
    load_prompt("ANCHOR_PROMPT.txt", DEFAULT_ANCHOR)
    load_prompt("SYSTEM_PROMPT.txt", DEFAULT_SYSTEM_PROMPT)
    load_prompt("REINFORCEMENT_PROMPT.txt", DEFAULT_REINFORCEMENT)
    load_prompt("SUMMARY_PROMPT.txt", DEFAULT_SUMMARY_PROMPT)
    print("[INIT] Prompt files verified")

    app.run(host='0.0.0.0', port=5000, debug=True, threaded=True)