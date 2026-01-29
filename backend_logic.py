import json
import uuid

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