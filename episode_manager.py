import os
import shutil
from datetime import datetime
from backend_logic import ChatSession
from llm import summarize_text


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