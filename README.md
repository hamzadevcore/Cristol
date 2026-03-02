# ◈

# ◈ CRISTOL TERMINAL ◈
### *High-Fidelity Narrative Interface & Roleplay Backend*

**Cristol Terminal** is a professional-grade LLM interface and backend specialized for **Transcript-Fidelity Roleplay**. Unlike standard chat interfaces that encourage AI hallucination and "creative drift," Cristol is designed to force an LLM to act as a **Director**—novelizing existing scripts and transcripts while seamlessly inserting a user-defined character into the canon events.

Built with a skeuomorphic "Retro-Industrial" terminal aesthetic, it provides an immersive environment where the source material is law, and the narrative is absolute.

---

## ✦ The Philosophy: Transcript Fidelity
Most AI roleplay suffers from "Canon Decay," where the AI slowly forgets NPC personalities or skips key plot points. Cristol solves this through three logic pillars:

1.  **Verbatim NPC Dialogue:** The backend extracts text from your provided transcripts and mandates that the AI use that dialogue **word-for-word**.
2.  **Chronological Locking:** Using a smart-chunking algorithm, the system feeds the AI only the current scene, preventing it from skipping to the end of the story or repeating past events.
3.  **The "Director" Logic:** The system prompt frames the AI not as a "friend," but as a Director novelizing a script. It prioritizes action and dialogue (50%+) over purple prose.

---

## 🕹️ Interface Features

### The Visual Stack (VFX)
The frontend is a React-based masterpiece of terminal immersion:
*   **CRT Simulation:** Real-time scanlines, screen flicker, and adjustable "fishbowl" lens distortion.
*   **Tactile Feedback:** A procedural sound engine that generates mechanical key-clicks, UI glitches, and background static.
*   **Multi-Spectrum Themes:** Choose your operational frequency:
    *   🔴 **HELL:** High-alert crimson (optimized for dark fantasy).
    *   🟢 **GREEN:** Classic phosphor monochrome.
    *   🟣 **PURPLE / 🔵 CYAN:** Modern high-contrast neon.
    *   🟡 **AMBER:** Warm retro-computing glow.

### The Blueprint Editor
A comprehensive suite for world-builders:
*   **Bulk Chapter Import:** Paste entire seasons of transcripts; the system automatically parses headers and scenes.
*   **Lore & Profile Anchors:** Define "World Lore" and "User Character" blocks that are persistently injected into the AI's "consciousness."
*   **Context Chunking:** Automatically breaks down massive 50,000-character scripts into manageable "beats" for the AI.

---

## ⚙️ Technical Architecture

### The Backend (Python/Flask)
The engine that drives the logic. It manages:
*   **Prompt Chaining:** A three-stage prompt build (**Anchor** → **Context** → **Reinforcement**) ensures the AI never breaks character.
*   **Clinical Summarization:** When an episode ends, a secondary "Clinical" model summarizes the events into a police-report style brief, which is used as the "memory" for the next episode.
*   **OpenRouter Streaming:** Native support for the latest models (Claude 3.5 Sonnet, GPT-4o) via SSE (Server-Sent Events).

### The Frontend (React/TypeScript)
*   **State Management:** A custom Redux-lite reducer handles complex UI states and message threading.
*   **Markdown Support:** Full GFM (GitHub Flavored Markdown) support for bolded actions and italicized dialogue.

---


## 📜 Versioning Note
**Current Version:** 1.0.0  
**Release Name:** *"Initial Breach"*

---

## ⚖️ License & Credits
Developed for gamers, show enjoyers and role players. Built with the belief that AI should be a tool for enhancement, not a replacement for good source material.

*◈ Stay in Character. Follow the Script. ◈*
