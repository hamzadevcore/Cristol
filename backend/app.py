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
from dotenv import load_dotenv, set_key

# ═══════════════════════════════════════════════════════════════════════════════
#                              CONFIGURATION
# ═══════════════════════════════════════════════════════════════════════════════

BASE_DIR = Path(__file__).parent
dotenv_path = BASE_DIR / '.env'

# Ensure .env exists before loading
if not dotenv_path.exists():
    dotenv_path.touch()

load_dotenv(dotenv_path)

app = Flask(__name__)
CORS(app)
app.config['MAX_CONTENT_LENGTH'] = 1024 * 1024 * 1024  # 1GB limit

# API Configuration
OPENROUTER_API_KEY = os.getenv('OPENROUTER_API_KEY', '')
OPENROUTER_API_URL = "https://openrouter.ai/api/v1"

# Model Defaults
CHAT_MODEL = os.getenv('OPENROUTER_MODEL', 'anthropic/claude-sonnet-4')
SUMMARY_MODEL = os.getenv('SUMMARY_MODEL', CHAT_MODEL)
COST_SAVING_MODE = os.getenv('COST_SAVING_MODE', 'true').lower() in {'1', 'true', 'yes', 'on'}

# Directory Setup
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
            "max_tokens": 16384,
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


def split_transcript_into_chunks(transcript_text, max_chars=3600):
    if not transcript_text:
        return []
    paragraphs = [p.strip() for p in transcript_text.split("\n\n") if p.strip()]
    if not paragraphs:
        return [transcript_text[i:i + max_chars] for i in range(0, len(transcript_text), max_chars)]

    chunks = []
    current = []
    current_len = 0
    scene_markers = ("SCENE", "CUT TO", "INT.", "EXT.")

    def flush_current():
        nonlocal current, current_len
        if not current:
            return
        block = "\n\n".join(current)
        if len(block) <= max_chars:
            chunks.append(block)
        else:
            for i in range(0, len(block), max_chars):
                chunks.append(block[i:i + max_chars])
        current = []
        current_len = 0

    for paragraph in paragraphs:
        if current and paragraph.startswith(scene_markers):
            flush_current()
        paragraph_len = len(paragraph) + 2
        if current and current_len + paragraph_len > max_chars:
            flush_current()
        current.append(paragraph)
        current_len += paragraph_len

    flush_current()
    return chunks


def get_episode_context(instance):
    ep_idx = instance.get('currentEpisodeIndex', 0)
    episodes = instance.get('episodes', [])
    ep_context = ""
    ep_name = f"Episode {ep_idx + 1}"
    if ep_idx < len(episodes):
        current_ep = episodes[ep_idx]
        ep_name = current_ep.get('name', ep_name)
        ep_context = current_ep.get('context', '').strip()
    return ep_idx, ep_name, ep_context


def get_episode_chunks(instance):
    ep_idx, ep_name, ep_context = get_episode_context(instance)
    chunks = split_transcript_into_chunks(ep_context)
    return ep_idx, ep_name, ep_context, chunks


def ensure_transcript_state(instance, chunk_count):
    ep_idx = instance.get('currentEpisodeIndex', 0)
    progress = instance.setdefault('transcript_progress', {})
    if progress.get('episodeIndex') != ep_idx:
        progress['episodeIndex'] = ep_idx
        progress['chunkIndex'] = 0
    if 'chunkIndex' not in progress:
        progress['chunkIndex'] = 0
    current_chunk_id = instance.get('current_chunk_id', progress['chunkIndex'])
    if current_chunk_id >= chunk_count and chunk_count > 0:
        current_chunk_id = chunk_count - 1
    current_chunk_id = max(0, current_chunk_id)
    instance['current_chunk_id'] = current_chunk_id
    progress['chunkIndex'] = current_chunk_id
    instance.setdefault('played_segments', [])
    instance.setdefault('chunkSummaries', {})
    return current_chunk_id


def get_chunk_summaries(instance, episode_index, up_to_index):
    if up_to_index <= 0:
        return []
    chunk_summaries = instance.get('chunkSummaries', {})
    ep_key = str(episode_index)
    summaries = chunk_summaries.get(ep_key, [])
    return [s for s in summaries[:up_to_index] if s]


def update_chunk_summary(instance, episode_index, chunk_index, chunk_text):
    if not chunk_text:
        return
    chunk_summaries = instance.setdefault('chunkSummaries', {})
    ep_key = str(episode_index)
    ep_list = chunk_summaries.get(ep_key, [])
    while len(ep_list) <= chunk_index:
        ep_list.append("")
    if not ep_list[chunk_index]:
        ep_list[chunk_index] = call_summary_api(chunk_text)
    chunk_summaries[ep_key] = ep_list


def update_rolling_summary(instance, max_history):
    messages = instance.get('messages', [])
    if len(messages) <= max_history:
        return
    target_count = len(messages) - max_history
    if target_count <= 0:
        return
    if instance.get('rollingSummaryCount') == target_count and instance.get('rollingSummary'):
        return
    transcript_lines = []
    for msg in messages[:target_count]:
        role = msg.get('role', 'user')
        role_label = 'USER' if role in {'user'} else 'STORY'
        transcript_lines.append(f"{role_label}:\n{msg.get('content', '')}")
    transcript_text = "\n\n".join(transcript_lines).strip()
    if not transcript_text:
        return
    instance['rollingSummary'] = call_summary_api(transcript_text)
    instance['rollingSummaryCount'] = target_count


def advance_transcript_progress(instance, episode_index, chunk_index):
    ep_idx, _, ep_context, chunks = get_episode_chunks(instance)
    if ep_idx != episode_index:
        return
    if not chunks:
        instance['current_chunk_id'] = 0
        instance.setdefault('transcript_progress', {})['chunkIndex'] = 0
        return
    current_chunk_index = max(0, min(chunk_index, len(chunks) - 1))
    played_segments = instance.setdefault('played_segments', [])
    if current_chunk_index not in played_segments:
        played_segments.append(current_chunk_index)
    update_chunk_summary(instance, ep_idx, current_chunk_index, chunks[current_chunk_index])
    next_chunk = current_chunk_index + 1
    if next_chunk >= len(chunks):
        next_chunk = len(chunks) - 1
    instance['current_chunk_id'] = next_chunk
    progress = instance.setdefault('transcript_progress', {})
    progress['episodeIndex'] = ep_idx
    progress['chunkIndex'] = next_chunk


# ═══════════════════════════════════════════════════════════════════════════════
#                         PROMPT CHAIN BUILDER
# ═══════════════════════════════════════════════════════════════════════════════

def build_prompt_chain(instance):
    messages = []

    # 1. SYSTEM MESSAGE
    anchor = load_prompt("ANCHOR_PROMPT.txt", DEFAULT_ANCHOR)
    system_prompt = load_prompt("SYSTEM_PROMPT.txt", DEFAULT_SYSTEM_PROMPT)
    messages.append({
        "role": "system",
        "content": f"{anchor}\n\n{system_prompt}"
    })

    # Episode context + chunks
    ep_idx, ep_name, ep_context, chunks = get_episode_chunks(instance)
    current_chunk_id = ensure_transcript_state(instance, len(chunks))
    current_chunk = chunks[current_chunk_id] if chunks else ""

    # 2. PERSISTENT CONTEXT
    context_parts = []

    lore = instance.get('lore', '').strip()
    if lore:
        context_parts.append(f"<world_lore>\n{lore}\n</world_lore>")

    profile = instance.get('profile', '').strip()
    if profile:
        context_parts.append(f"<user_character>\n{profile}\n</user_character>")

    summaries = instance.get('summaryHistory', [])
    is_episode_start = len(
        [m for m in instance.get('messages', []) if m.get('role') in {'assistant', 'ai'}]
    ) == 0
    if summaries and is_episode_start:
        last_summary = summaries[-1]
        ep_summary = last_summary.get('summary', '(No summary available)')
        ep_title = last_summary.get('episodeName', 'Previous Episode')
        context_parts.append(
            f"<previous_episode_summary>\n### {ep_title}\n{ep_summary}\n</previous_episode_summary>"
        )

    rolling_summary = instance.get('rollingSummary', '').strip()
    if rolling_summary:
        context_parts.append(f"<session_summary>\n{rolling_summary}\n</session_summary>")

    previous_chunk_summaries = get_chunk_summaries(instance, ep_idx, current_chunk_id)
    if previous_chunk_summaries:
        recent_summaries = previous_chunk_summaries[-3:]
        context_parts.append(
            "<previous_chunks>\n" + "\n\n".join(recent_summaries) + "\n</previous_chunks>"
        )

    if context_parts:
        messages.append({"role": "user", "content": "\n\n".join(context_parts)})

    # 3. CURRENT TRANSCRIPT CHUNK
    if current_chunk:
        messages.append({
            "role": "user",
            "content": (
                f"<episode_chunk title=\"{ep_name}\" index=\"{current_chunk_id + 1}/{max(len(chunks), 1)}\">\n"
                f"{current_chunk}\n"
                "</episode_chunk>"
            )
        })

    # 4. HISTORY
    conv_messages = instance.get('messages', [])
    max_history = 12 if not COST_SAVING_MODE else 8
    recent_messages = conv_messages[-max_history:] if conv_messages else []

    last_user_msg = ""
    last_user_index = None
    if conv_messages and conv_messages[-1].get('role') == 'user':
        last_user_msg = conv_messages[-1].get('content', '').strip()
        last_user_index = len(conv_messages) - 1

    last_assistant_msg = ""
    last_assistant_index = None
    for i in range(len(conv_messages) - 1, -1, -1):
        if conv_messages[i].get('role') in {'assistant', 'ai'}:
            last_assistant_msg = conv_messages[i].get('content', '').strip()
            last_assistant_index = i
            break

    if not COST_SAVING_MODE:
        recent_start = max(0, len(conv_messages) - max_history)
        for i in range(recent_start, len(conv_messages)):
            if i == last_user_index or i == last_assistant_index:
                continue
            content = conv_messages[i].get('content', '').strip()
            if not content:
                continue
            role = 'assistant' if conv_messages[i].get('role') in {'assistant', 'ai'} else 'user'
            messages.append({"role": role, "content": content})

    if last_assistant_msg:
        messages.append({"role": "assistant", "content": last_assistant_msg})

    # 5. FINAL USER MESSAGE + REINFORCEMENT
    reinforcement = load_prompt("REINFORCEMENT_PROMPT.txt", DEFAULT_REINFORCEMENT)

    final_parts = []

    if last_user_msg:
        final_parts.append(f"USER ACTION/DIALOGUE:\n{last_user_msg}")
    elif is_episode_start:
        final_parts.append(
            "[BEGIN EPISODE]\n"
            "Start from the top of the transcript chunk. "
            "Brief scene-setting (1-2 sentences), then get into dialogue immediately. "
            "End with an NPC addressing the User's character."
        )
    else:
        final_parts.append(
            "[CONTINUE]\n"
            "Continue from where we left off in the transcript chunk. "
            "Advance to the next beats in order. "
            "End with an NPC addressing the User's character."
        )

    final_parts.append(f"\n{reinforcement}")
    messages.append({"role": "user", "content": "\n\n".join(final_parts)})

    return messages, {
        "episodeIndex": ep_idx,
        "chunkIndex": current_chunk_id,
        "chunkCount": len(chunks)
    }


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

@app.route('/settings', methods=['GET', 'PUT'])
def handle_settings():
    global CHAT_MODEL, SUMMARY_MODEL, OPENROUTER_API_KEY

    if request.method == 'GET':
        sys_prompt = load_prompt("SYSTEM_PROMPT.txt", DEFAULT_SYSTEM_PROMPT)
        return jsonify({
            "model": CHAT_MODEL,
            "summarization_model": SUMMARY_MODEL,
            "system_prompt": sys_prompt,
            "api_key": OPENROUTER_API_KEY
        })

    if request.method == 'PUT':
        data = request.json

        if 'system_prompt' in data:
            with open(PROMPTS_DIR / "SYSTEM_PROMPT.txt", "w", encoding="utf-8") as f:
                f.write(data['system_prompt'].strip())

        if 'model' in data:
            val = data['model'].strip()
            set_key(str(dotenv_path), "OPENROUTER_MODEL", val)
            os.environ["OPENROUTER_MODEL"] = val
            CHAT_MODEL = val

        if 'summarization_model' in data:
            val = data['summarization_model'].strip()
            set_key(str(dotenv_path), "SUMMARY_MODEL", val)
            os.environ["SUMMARY_MODEL"] = val
            SUMMARY_MODEL = val

        if 'api_key' in data:
            val = data['api_key'].strip()
            set_key(str(dotenv_path), "OPENROUTER_API_KEY", val)
            os.environ["OPENROUTER_API_KEY"] = val
            OPENROUTER_API_KEY = val

        return jsonify({"success": True})


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
            pass
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
            "transcript_progress": {"episodeIndex": 0, "chunkIndex": 0},
            "current_chunk_id": 0,
            "played_segments": [],
            "chunkSummaries": {},
            "rollingSummary": "",
            "rollingSummaryCount": 0,
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
            pass
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
    for key in [
        'messages', 'lore', 'profile', 'currentEpisodeIndex', 'summaryHistory', 'episodes',
        'transcript_progress', 'current_chunk_id', 'played_segments', 'chunkSummaries',
        'rollingSummary', 'rollingSummaryCount'
    ]:
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
    inst['transcript_progress'] = {
        "episodeIndex": inst['currentEpisodeIndex'],
        "chunkIndex": 0
    }
    inst['current_chunk_id'] = 0
    inst['played_segments'] = []
    inst['chunkSummaries'] = inst.get('chunkSummaries', {})
    inst['rollingSummary'] = ""
    inst['rollingSummaryCount'] = 0
    inst['lastPlayed'] = datetime.now().isoformat()

    with open(path, 'w') as f:
        json.dump(inst, f, indent=2)

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

    if user_input:
        should_append = True
        if inst['messages']:
            last_msg = inst['messages'][-1]
            if last_msg.get('role') == 'user' and last_msg.get('content') == user_input:
                should_append = False

        if should_append:
            inst['messages'].append({"role": "user", "content": user_input})
            inst['lastPlayed'] = datetime.now().isoformat()
            with open(path, 'w') as f:
                json.dump(inst, f, indent=2)

    update_rolling_summary(inst, 12 if not COST_SAVING_MODE else 8)
    prompt_msgs, prompt_meta = build_prompt_chain(inst)

    def generate():
        full_response = ""
        error_occurred = False

        try:
            for token in stream_openrouter(prompt_msgs, model):
                full_response += token
                yield f"data: {json.dumps({'token': token})}\n\n"
        except Exception as e:
            error_occurred = True
            yield f"data: {json.dumps({'error': str(e)})}\n\n"

        if full_response.strip() and not error_occurred:
            try:
                with open(path, 'r') as f:
                    current_inst = json.load(f)
                current_inst['messages'].append({
                    "role": "assistant",
                    "content": full_response
                })
                update_rolling_summary(current_inst, 12 if not COST_SAVING_MODE else 8)
                if prompt_meta:
                    advance_transcript_progress(
                        current_inst,
                        prompt_meta.get('episodeIndex', current_inst.get('currentEpisodeIndex', 0)),
                        prompt_meta.get('chunkIndex', current_inst.get('current_chunk_id', 0))
                    )
                current_inst['lastPlayed'] = datetime.now().isoformat()
                with open(path, 'w') as f:
                    json.dump(current_inst, f, indent=2)
            except Exception as e:
                pass

        yield "data: [DONE]\n\n"

    return Response(generate(), mimetype='text/event-stream')


@app.route('/health', methods=['GET'])
def health():
    return jsonify({
        "status": "ok",
        "model": CHAT_MODEL,
        "api_key_set": bool(OPENROUTER_API_KEY)
    })


if __name__ == '__main__':
    load_prompt("ANCHOR_PROMPT.txt", DEFAULT_ANCHOR)
    load_prompt("SYSTEM_PROMPT.txt", DEFAULT_SYSTEM_PROMPT)
    load_prompt("REINFORCEMENT_PROMPT.txt", DEFAULT_REINFORCEMENT)
    load_prompt("SUMMARY_PROMPT.txt", DEFAULT_SUMMARY_PROMPT)
    app.run(host='0.0.0.0', port=5000, debug=False, threaded=True, use_reloader=False)