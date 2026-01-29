import json
import os


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