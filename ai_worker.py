from PySide6.QtCore import QThread, Signal
from llm import message_llm
from context_manager import build_system_context


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