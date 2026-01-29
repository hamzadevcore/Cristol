from ollama import chat
from os import getenv
from dotenv import load_dotenv

load_dotenv()


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