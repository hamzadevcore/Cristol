
# Software Design Document: Project Cristol (v2.0)

## 1. Executive Summary
**Project Cristol** is a local desktop application for interactive storytelling. It merges TV show transcripts with Local Generative AI to allow users to roleplay Original Characters (OCs).

**Version 2.0 Focus:** Full narrative control. The user is not just a player but a **Director**. The system allows non-linear chat manipulation: **Editing** past context, **Deleting** erroneous turns, **Regenerating** specific responses, and **Canceling** generation mid-stream.

## 2. System Architecture

### 2.1 The "Mutable Stream" Logic
Unlike standard chat apps where history is static, Cristol treats the chat log as a **mutable list**.

1.  **State Management:** The "Chat History" is loaded into memory as a list of objects.
2.  **Mutation Events:**
    *   **Edit:** Updates the text of an index `i`.
    *   **Delete:** Removes index `i`.
    *   **Regenerate:** Removes the last AI message (index `-1`) and triggers a new API call using the current state.
    *   **Rewind (Optional):** Deletes all messages after index `i`.
3.  **Synchronization:** Every mutation triggers an immediate overwrite of the `current_chat.json` file to ensure disk consistency.

### 2.2 Threading Architecture (Crucial for "Cancel")
To support the **Cancel** feature, the UI and the AI cannot run on the same thread.

*   **Main Thread (UI):** Handles clicks, scrolling, and rendering text.
*   **Worker Thread (AI):** Handles the API call to Ollama/LiteLLM.
*   **The "Kill Switch":** A shared boolean flag. When the user clicks "Stop," the flag flips to `True`. The Worker Thread checks this flag after every token received. If `True`, it aborts and saves partial progress.

## 3. Tech Stack Refinements

| Component | Technology | Role in v2.0 |
| :--- | :--- | :--- |
| **GUI** | **PySide6** | Uses `QThread` and `Signals/Slots` for the Cancel logic. |
| **State** | **Python List** | The source of truth. We do not rely on the UI widgets to hold state; we rely on a Python list of dictionaries. |
| **AI** | **LiteLLM** | Used in `stream=True` mode to allow character-by-character interruption. |

## 4. Data Schema Updates

### 4.1 Active Save State (`current_chat.json`)
We add a `uuid` to track messages reliably even if list order changes during UI updates, and an `is_aborted` flag.

```json
[
  {
    "id": "550e8400-e29b...",
    "role": "user",
    "content": "I offer Walter a blue candy.",
    "timestamp": 170000000
  },
  {
    "id": "770e8400-a12c...",
    "role": "assistant",
    "content": "Walter hesitates. 'Is this... pure?'",
    "is_aborted": false
  }
]
```

## 5. Feature Logic & Implementation Details

### 5.1 The "Cancel" Button (Streaming Interruption)
This requires an asynchronous loop pattern.

**Logic Flow:**
1. User clicks "Send".
2. App disables "Send" button, enables "Stop" button.
3. App spawns a `WorkerThread`.
4. `WorkerThread` calls LLM.
5. **Inside the loop:**
   ```python
   # Pseudo-code for the Worker Thread
   for chunk in litellm.completion(..., stream=True):
       if self.is_interrupted:
           break  # STOP GENERATION IMMEDIATELY
       
       new_token = chunk.choices[0].delta.content
       self.signals.new_text.emit(new_token) # Send to UI
   ```
6. If interrupted, the partial message is saved to history so the user can edit it or delete it.

### 5.2 "Regenerate" (Rerun Turn)
**Logic Flow:**
1. User clicks the "Refresh" icon on the last AI message.
2. **Controller Action:**
   *   Identify the last message in `chat_history`.
   *   Verify it is role `assistant`.
   *   **Pop** it from the list (remove it).
   *   Update GUI to remove that bubble.
3. **Trigger:** Immediately call the `generate_response()` function using the remaining history.

### 5.3 "Delete" (Pruning)
**Logic Flow:**
1. User right-clicks a message -> "Delete".
2. **Controller Action:**
   *   Remove item at index `i` from `chat_history`.
   *   **Save** to JSON.
   *   **Re-render** the chat list (clear UI list and reload, or remove widget `i`).
   *   *Note:* If you delete a message in the middle, the context for future messages changes. This is acceptable; the user is "retconning" history.

## 6. Detailed Class Design (Python/PySide6)

This section details the code structure required to make the "Full Thing" work.

### 6.1 The Backend Controller (`backend_logic.py`)

```python
import uuid
import json
from pathlib import Path

class ChatSession:
    def __init__(self, file_path: str):
        self.file_path = Path(file_path)
        self.history = self.load_history()

    def load_history(self):
        if self.file_path.exists():
            with open(self.file_path, 'r') as f:
                return json.load(f)
        return []

    def save_history(self):
        with open(self.file_path, 'w') as f:
            json.dump(self.history, f, indent=2)

    def add_message(self, role, content):
        msg = {
            "id": str(uuid.uuid4()),
            "role": role,
            "content": content
        }
        self.history.append(msg)
        self.save_history()
        return msg

    def update_message(self, index, new_content):
        """Edit in place"""
        if 0 <= index < len(self.history):
            self.history[index]['content'] = new_content
            self.save_history()

    def delete_message(self, index):
        """Remove a turn"""
        if 0 <= index < len(self.history):
            self.history.pop(index)
            self.save_history()

    def pop_last_message(self):
        """Used for regenerate"""
        if self.history:
            self.history.pop()
            self.save_history()
```

### 6.2 The AI Worker Thread (`ai_worker.py`)

```python
from PySide6.QtCore import QThread, Signal
from litellm import completion

class AIWorker(QThread):
    # Signals to update the Main UI safely
    chunk_received = Signal(str)
    finished = Signal()
    error_occurred = Signal(str)

    def __init__(self, context_messages, model_name):
        super().__init__()
        self.context = context_messages
        self.model_name = model_name
        self.is_running = True # The Kill Switch

    def run(self):
        try:
            response = completion(
                model=self.model_name,
                messages=self.context,
                stream=True
            )
            
            for chunk in response:
                if not self.is_running: 
                    break # CANCEL LOGIC
                
                content = chunk.choices[0].delta.content
                if content:
                    self.chunk_received.emit(content)
                    
        except Exception as e:
            self.error_occurred.emit(str(e))
        finally:
            self.finished.emit()

    def stop(self):
        """Called by the Cancel button"""
        self.is_running = False
```

## 7. UI Implementation Guide (The "Full Thing")

### 7.1 Visual Layout for Chat Bubbles
Each chat bubble needs to be a custom widget (`QWidget`) composed of:

1.  **Header:** `role` (User/AI) + `timestamp`.
2.  **Body:** `QTextEdit` (The message content).
    *   *Default:* ReadOnly.
    *   *Double Click:* Sets ReadOnly=False (Edit Mode).
    *   *Focus Out:* Save changes to Backend.
3.  **Action Bar (Hidden by default, visible on Hover):**
    *   `[Trash Icon]` -> Triggers Delete.
    *   `[Refresh Icon]` -> (Only for AI) Triggers Regenerate.
    *   `[Copy Icon]` -> Copies text to clipboard.

### 7.2 The Main Window Connection Logic

```python
# main_window.py snippet

    def on_send_click(self):
        user_text = self.input_box.toPlainText()
        
        # 1. Add User Msg to Backend & UI
        self.session.add_message("user", user_text)
        self.append_bubble_to_ui(user_text, is_user=True)
        
        # 2. Prepare UI for AI
        self.ai_bubble = self.append_bubble_to_ui("", is_user=False)
        self.toggle_ui_state(generating=True) # Switch Send btn to Stop btn

        # 3. Start AI Thread
        self.worker = AIWorker(self.session.history, "ollama/llama3")
        self.worker.chunk_received.connect(self.update_ai_bubble)
        self.worker.finished.connect(self.on_generation_finished)
        self.worker.start()

    def on_stop_click(self):
        # The CANCEL Feature
        if self.worker:
            self.worker.stop()
            # We don't save the partial message here, 
            # we wait for the 'finished' signal to handle cleanup.

    def on_regenerate_click(self):
        # 1. Remove last AI message from data
        self.session.pop_last_message()
        
        # 2. Remove last bubble from UI
        self.remove_last_bubble_widget()
        
        # 3. Trigger generation again
        self.start_ai_generation()
```

## 8. Implementation Roadmap (Revised)

### Phase 1: The Mutable Core
1.  Implement `ChatSession` class (Add, Edit, Delete, Save).
2.  Build the `ActiveChat.json` structure.
3.  **Test:** verify that deleting item #2 in the JSON list persists after a restart.

### Phase 2: The UI Stream
1.  Create `ChatBubbleWidget` with "Edit" mode (double click).
2.  Add "Delete" button to the bubble widget.
3.  Connect UI Delete button -> `ChatSession.delete_message` -> `Refresh_UI`.

### Phase 3: The Async Brain
1.  Implement `AIWorker` (QThread).
2.  Implement `stream=True` handling.
3.  Implement the `self.is_running` check for the Cancel button.
4.  Wire up the "Stop" button in the bottom bar to `worker.stop()`.

### Phase 4: Integration
1.  Test "Regenerate": Ensure it deletes the old text *before* starting the new stream.
2.  Test "Edit Context": Edit a user message from 5 turns ago. Send a new message. Verify the LLM references the *new* edited version, not the old one.

## 9. Handling "Script" vs "Chat"
*Note on Editing:* The Transcript (Script) parts are usually static.
*   **Design Decision:** Do not allow the user to delete *Script* blocks via the Chat UI. Script blocks should be injected into the context prompt seamlessly but might not appear as delete-able bubbles in the `current_chat.json`.
*   **Alternative:** The Script chunks are just `system` messages in the list. If you allow the user to delete them, the AI loses the plot.
*   **Recommendation:** Mark script messages as `locked: true` in the JSON. The UI will not render a Delete button for bubbles marked `locked`.

## 10. Summary of User Controls

| User Action | UI trigger | Logic Triggered |
| :--- | :--- | :--- |
| **Stop AI** | "Stop" Button (replaces Send) | `worker.stop()` -> Stream breaks -> Partial save. |
| **Edit Text** | Double-click text | Toggle `ReadOnly` -> On Blur, update JSON list. |
| **Delete Msg** | Right-click/Hover Icon | `history.pop(index)` -> Remove Widget. |
| **Rerun Last** | "Refresh" Icon on AI Bubble | `history.pop(-1)` -> Start Generation. |
| **Rerun Past** | Right-click Old AI Msg | **Complex:** Usually implies deleting all subsequent msgs (Rewind). Recommendation: Just offer "Copy Prompt" so user can paste it again. |