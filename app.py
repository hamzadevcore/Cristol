import json
import uuid
import os
import shutil
from datetime import datetime
from dotenv import load_dotenv
from ollama import chat
from PySide6.QtCore import QThread, Signal
load_dotenv()


class ChatSession:
    def __init__(self, filename):
        self.filename = filename
        self.history = self.load()
        self.token_usage = {"prompt": 0, "response": 0, "total": 0}

    def load(self):
        try:
            with open(self.filename, 'r') as f:
                return json.load(f)
        except:
            return []

    def save(self):
        with open(self.filename, 'w') as f:
            json.dump(self.history, f, indent=2)

    def add_message(self, role, content):
        message = {
            "id": str(uuid.uuid4()),
            "role": role,
            "content": content
        }
        self.history.append(message)
        self.save()
        return message

    def edit_message(self, msg_id, delete=False, new_content=None):
        for i, message in enumerate(self.history):
            if message["id"] == msg_id:
                if delete:
                    self.history.pop(i)
                elif new_content is not None:
                    message["content"] = new_content
                break
        self.save()

    def get_clean_history(self):
        clean_history = []
        for message in self.history:
            clean_history.append({
                "role": message["role"],
                "content": message["content"]
            })
        return clean_history

    def pop_last_message(self):
        if self.history:
            self.history.pop(-1)
            self.save()

    def rewind_to_id(self, msg_id):
        for i, message in enumerate(self.history):
            if message["id"] == msg_id:
                self.history = self.history[:i + 1]
                self.save()
                return True
        return False

    def get_full_text_as_string(self):
        full_text = ""
        for msg in self.history:
            role = msg["role"].capitalize()
            content = msg["content"]
            full_text += f"{role}: {content}\n\n"
        return full_text.strip()

    def reset_history(self):
        self.history = []
        self.save()

    def update_token_stats(self, prompt_eval, eval_count):
        self.token_usage["prompt"] += prompt_eval
        self.token_usage["response"] += eval_count
        self.token_usage["total"] += (prompt_eval + eval_count)


class Scenario:
    def __init__(self, config_path):
        self.config_path = config_path
        self.data = self._load_config()

    def _load_config(self):
        if not os.path.exists(self.config_path):
            raise FileNotFoundError(f"Config not found: {self.config_path}")
        with open(self.config_path, 'r', encoding='utf-8') as f:
            return json.load(f)

    def get_path(self, key):
        """Returns the absolute path for a file defined in config."""
        rel_path = self.data['paths'].get(key)
        if not rel_path:
            return ""
        # Assuming paths in JSON are relative to the App Root
        return os.path.abspath(rel_path)

    def get_episodes(self):
        """Returns list of dicts: [{'id': 'ep1.txt', 'title': '...'}]"""
        return self.data.get('episodes', [])

    def get_oc_profile(self):
        return self.data.get('oc_profile', "")

    def get_system_prompt(self):
        return self.data.get('system_prompt', "You are an AI assistant.")


def message_llm(chat_history):
    response = chat(
        model=os.getenv("OLLAMA_MODEL"),
        messages=chat_history,
        stream=True,
    )
    for chunk in response:
        content = chunk['message']['content']
        if content:
            yield ("text", content)

        if chunk.get('done'):
            stats = {
                'prompt': chunk.get('prompt_eval_count', 0),
                'response': chunk.get('eval_count', 0)
            }
            yield ("stats", stats)


def summarize_text(text):
    return chat(
        model=os.getenv("SUMMARIZATION_MODEL"),
        messages=[{"role": "user", "content": f"{os.getenv('SUMMARIZATION_PROMPT')} \n \n{text}"}],
        stream=False,
    )


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


class AIWorker(QThread):
    new_token = Signal(str)
    stats_received = Signal(int, int)
    finished = Signal()

    def __init__(self, chat_session, scenario, script_filename=None):
        super().__init__()
        self.session = chat_session
        self.scenario = scenario  # NEW: Store scenario
        self.script_filename = script_filename
        self.is_running = True

    def run(self):
        try:
            # 1. Build Context using Scenario
            system_msg = build_system_context(self.scenario, self.script_filename)

            # 2. Get User History
            user_history = self.session.get_clean_history()

            # 3. Combine
            full_context = system_msg + user_history

            # 4. Stream
            stream = message_llm(full_context)
            for type, data in stream:
                if not self.is_running:
                    break

                if type == "text":
                    self.new_token.emit(data)
                elif type == "stats":
                    self.session.update_token_stats(data['prompt'], data['response'])
                    self.stats_received.emit(data['prompt'], data['response'])
        except Exception as e:
            print(f"Error in AI Worker: {e}")
        finally:
            self.finished.emit()

    def stop(self):
        self.is_running = False



def finish_episode(session: ChatSession):
    full_transcript = session.get_full_text_as_string()
    if not full_transcript:
        print("Error: Transcript is empty.")
        return

    try:
        response = summarize_text(full_transcript)
        summary_content = response.message.content
    except Exception as e:
        print(f"LLM Error: {e}")
        return

    history_file = "history.md"
    timestamp_readable = datetime.now().strftime("%Y-%m-%d %H:%M")

    with open(history_file, "a", encoding="utf-8") as f:
        f.write(f"\n## Episode Log: {timestamp_readable}\n\n")
        f.write(summary_content)
        f.write("\n\n" + ("-" * 40) + "\n")

    os.makedirs("archive", exist_ok=True)
    timestamp_safe = datetime.now().strftime("%Y%m%d_%H%M%S")
    archive_filename = f"archive/episode_{timestamp_safe}.json"

    shutil.copy(session.filename, archive_filename)

    session.reset_history()