# Copilot with Vault Tools

**Bring an AI assistant into Obsidian.** Chat with any OpenAI-compatible LLM from a side panel, get writing help in your notes, and let the AI safely read and modify your vault using **vault tools**—with your approval for sensitive actions.

---

## What This Plugin Does

- **Chat in a side panel** — Persistent conversation with streaming responses, history, and connection status. Works with OpenAI, local models, or any API that speaks the OpenAI chat format.
- **Editor-aware helpers** — Improve selected text, continue writing, summarize the active note, and generate tag suggestions. Commands operate on the current note and selection.
- **Vault automation (MCP-style)** — The AI can call **vault tools** to read files, search content, create or edit notes, and more. Read-only tools run automatically; write operations show an approval dialog so you stay in control.

---

## Quick Start

### 1. Install the plugin

- **From Obsidian:** Settings → Community plugins → Browse → search for **Copilot with Vault tools** (if listed).
- **Manual:** Download the [latest release](https://github.com/HimadriMandal/obsidian-copilot/releases) and copy `manifest.json`, `main.js`, and `styles.css` into:
  ```
  Vault/.obsidian/plugins/obsidian-copilot/
  ```
  Then enable **Copilot with Vault tools** under Community plugins.

### 2. Configure your LLM

Open **Settings → Community plugins → Obsidian Copilot** and set:

- **API endpoint** — e.g. `https://api.openai.com/v1` or your local/custom LLM URL.
- **API key** — Your provider’s API key (leave empty for some local setups).
- **Model** — e.g. `gpt-3.5-turbo`, `gpt-4`, or your model name.

Use **Test connection** to verify the setup.

### 3. Open the Copilot

- Click the **brain-circuit** icon in the left ribbon, or  
- Run the command **Open AI copilot panel** from the command palette (`Ctrl/Cmd + P`).

You can now chat, use document commands, and (if vault tools are enabled) let the AI use your vault to answer questions and perform actions.

---

## Main Features

### Chat panel

- **Streaming responses** — See the reply appear in real time (can be turned off in settings).
- **Conversation history** — Messages are kept between sessions; you can clear the chat with the **Clear** button.
- **Active note context** — When **Include active note context** is on, the current note (or selection) is sent with your message so the AI can refer to it and suggest edits via vault tools.
- **Vault tools in chat** — If **Enable vault tools** is on, the AI can call tools (read files, search, create/update notes). Sensitive tools open an approval modal before running.

### Document commands (editor helpers)

These work on the **currently active note** and, where relevant, the **current selection**:

| Command | What it does |
|--------|----------------|
| **Improve selected text** | Sends the selection (or nearby context) to the LLM and replaces it with improved text. |
| **Continue writing** | Asks the AI to continue the paragraph at the cursor and inserts the result. |
| **Summarize document** | Generates a summary of the active note (notification for now). |
| **Generate tags** | Suggests hashtag-style tags based on the note; shows them in a notice. |
| **Analyze current document** | Shows basic stats (word count, paragraphs, etc.) in a notice. |

All of these are available from the **command palette** and can be bound to hotkeys in **Settings → Hotkeys**.

### Vault tools (what the AI can do)

The plugin exposes a set of **vault tools** the LLM can call when you have **Enable vault tools** turned on. They are split into:

- **Safe tools** — Run automatically (read-only or low-risk).
- **Sensitive tools** — Require your approval in a modal before the action runs.

| Tool | Description | Safe? |
|------|-------------|--------|
| `read_file` | Read contents of a file by path | Yes |
| `search_files` | Search files by name pattern (supports wildcards) | Yes |
| `list_files` | List files in a directory | Yes |
| `get_file_metadata` | Get metadata for a file | Yes |
| `search_content` | Search text inside files | Yes |
| `get_active_document` | Get current note content (selection-first) | Yes |
| `get_vault_stats` | Get vault statistics | Yes |
| `create_file` | Create a new file with content | No |
| `replace_selection` | Replace selection in the active note | No |
| `replace_active_document` | Replace entire active note content | No |
| `update_file` | Overwrite a file by path | No |
| `append_to_file` | Append content to a file | No |
| `rename_file` | Rename a file | No |
| `delete_file` | Delete a file | No |
| `create_folder` | Create a folder | No |

When the AI calls a **sensitive** tool, a dialog shows the tool name, description, and parameters (with a content preview when relevant). You choose **Approve** or **Reject**.

---

## Commands Reference

All commands are in the command palette and can have hotkeys:

| Command | Description |
|--------|-------------|
| **Open AI copilot panel** | Opens the Copilot side panel (same as the ribbon icon). |
| **Improve selected text** | Improve the current selection with the AI. |
| **Continue writing** | Continue the paragraph at the cursor. |
| **Summarize document** | Summarize the active note. |
| **Generate tags** | Suggest tags for the active note. |
| **Analyze current document** | Show document stats in a notice. |
| **Test connection** | Check LLM endpoint and API key. |
| **Test vault tools** | Verify vault tools are working. |
| **Show available vault tools** | Create a help note in your vault listing all tools and safety levels. |
| **Show tool usage statistics** | Show execution counts (success/fail/denied). |
| **Test function calling** | Run a test of the full LLM → vault-tool pipeline. |

---

## Settings

**Settings → Community plugins → Obsidian Copilot**

### API configuration

- **API endpoint** — Base URL of your LLM API (OpenAI-compatible).
- **API key** — Authentication key.
- **Model** — Model name (e.g. `gpt-3.5-turbo`).
- **Temperature** — 0–2; higher = more creative.
- **Max tokens** — Maximum length of each response.

### UI preferences

- **Sidebar position** — Left or right.
- **Theme** — Auto (follow Obsidian), Light, or Dark.
- **Auto save** — Automatically save conversations and settings.

### Features

- **Enable streaming** — Stream responses in real time.
- **Enable knowledge base** — Reserved for future knowledge-base features.
- **Enable advanced tools** — Enable advanced editing/analysis tools.
- **Enable vault tools** — Allow the AI to call vault tools (read/write with approval for sensitive ones).
- **Include active note context** — Send the active note (or selection) with chat messages when possible.

### Conversation

- **Conversation history** — Keep history between sessions.
- **Max history length** — How many messages to keep (e.g. 10–500).

### Connection test

- **Test connection** — Button to check your API endpoint and key without leaving settings.

---

## Tips for Best Results

1. **Use active note context** — With “Include active note context” on, you can say things like “summarize this” or “add bullet points” and the AI sees the current note and can use tools like `replace_selection` or `replace_active_document` with your approval.
2. **Check the help note** — Run **Show available vault tools** once to get a note in your vault describing every tool and whether it’s safe or requires approval.
3. **Trust the approval dialog** — For create/update/delete/rename, always review the parameters and content preview before approving.
4. **Hotkeys** — Assign hotkeys to **Open AI copilot panel**, **Improve selected text**, and **Continue writing** for a faster workflow.

---

## Development

```bash
git clone https://github.com/HimadriMandal/obsidian-copilot.git
cd obsidian-copilot
npm install
npm run dev   # watch build: main.ts → main.js
```

Symlink or copy the repo into your vault’s `.obsidian/plugins/` folder. Reload Obsidian (or toggle the plugin) after builds to load the new `main.js`.

### Scripts

- `npm run dev` — Watch build with esbuild.
- `npm run build` — Production build (minified).
- `npm run lint` — ESLint.
- `npm run version:<type>` — Bump version (`patch` / `minor` / `major`) in `manifest.json`, `package.json`, and `versions.json`.

### Packaging a release

1. Bump version in `manifest.json` and `versions.json`.
2. Run `npm run build`.
3. Create a GitHub release and attach `manifest.json`, `main.js`, and `styles.css`.

---

## Roadmap

- Knowledge tab: vault-wide analysis and organization.
- Richer tool approval UX (per-tool trust levels, consent options).
- More MCP-style tools (e.g. calendar, external APIs).
- Conversation export and shareable snippets.

---

## Support & Contributing

- **Issues & ideas:** [GitHub repository](https://github.com/HimadriMandal/obsidian-copilot).
- **Author:** [HimadriMandal](https://github.com/HimadriMandal).

Contributions are welcome.
