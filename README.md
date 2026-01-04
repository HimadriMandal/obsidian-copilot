# Copilot with MCP

AI Copilot is an opinionated rewrite of the stock Obsidian sample plugin. It focuses on three ideas:

- A persistent side-panel chat experience that speaks to any LLM endpoint you configure
- Editor-aware writing helpers (improve selection, continue writing, summarize, tag suggestions)
- Vault automation through tool execution and MCP-style function calling

The plugin is written in TypeScript, compiled with esbuild, and runs directly inside `.obsidian/plugins/obsidian-copilot` so you can iterate without leaving your vault.

## Features

- **Copilot side panel** – Ribbon icon + command open a custom `AI Copilot` view with Chat / Tools / Knowledge tabs. Chat supports streaming responses, maintains conversation history, and shows connection status.
- **Quick document tools** – The Tools tab surfaces one-click actions: analyze the active note, summarize it, improve selected text, continue writing at the cursor, and generate tag recommendations.
- **Editor-first AI helpers** – Document commands operate on the current editor selection/context and write results back into the note via `DocumentService` helpers.
- **Vault-aware automation** – `ToolExecutor` exposes curated “vault tools” you can test, inspect, and let the model call through the function-calling pipeline handled by `FunctionCallHandler`.
- **LLM flexibility** – Configure endpoint, key, model, temperature, token limits, streaming, and various feature flags from the Settings tab. Conversation history length and autosave are adjustable.
- **Future knowledge base tab** – The Knowledge tab currently advertises upcoming vault-wide analysis and organization workflows (placeholder content shipped for roadmap transparency).

## Commands

All commands are available from the command palette and can be bound to hotkeys:

| Command | What it does |
| --- | --- |
| `Open AI Copilot Panel` | Reveals the side panel (same as clicking the ribbon icon).
| `Analyze Current Document` | Runs `DocumentService.analyzeActiveDocument()` and shows stats in a notice / panel.
| `Improve Selected Text` | Sends the current selection (or cursor context) to the LLM and replaces it with the improved copy.
| `Continue Writing` | Asks the LLM to continue the paragraph around the cursor and inserts the result.
| `Summarize Document` | Generates a medium-length summary of the active note.
| `Generate Tags` | Suggests hash-tag-friendly keywords based on the note content.
| `Test LLM Connection` | Verifies the endpoint + API key credentials via `LLMService.testConnection()`.
| `Test Vault Tools` | Dry-runs `ToolExecutor` to ensure Obsidian-side capabilities are reachable.
| `Show Available Vault Tools` | Writes a help note listing the registered tools and safety levels.
| `Show Tool Usage Statistics` | Displays success/failure counts for tool execution (handy when debugging function calls).
| `Test Function Calling` | Exercises the full function-calling pipeline between the LLM and vault tools.

## Configuration

Open *Settings → Community Plugins → Obsidian Copilot* to tune:

- **API configuration** – Endpoint URL, API key, default model name, temperature, max tokens.
- **UI preferences** – Sidebar position (left/right), per-panel theme (auto/light/dark), autosave toggle.
- **Features** – Enable/disable streaming, knowledge base previews, advanced editing tools, and vault-access tools.
- **Conversation** – Toggle history persistence and its maximum length.
- **Connection test** – A built-in “Test Connection” button mirrors the palette command for quick checks.

Changes are saved immediately (`saveSettings()` also refreshes live services so the new config applies without reloads).

## Development

```bash
git clone https://github.com/HimadriMandal/obsidian-copilot.git
cd obsidian-copilot
npm install
npm run dev   # builds main.ts → main.js in watch mode
```

During development, symlink or copy the repo into your vault’s `.obsidian/plugins/` folder. Reload Obsidian (or toggle the plugin) after each build to pick up the latest `main.js`.

### Available scripts

- `npm run dev` – Incremental build with esbuild watch
- `npm run build` – Production build (minified)
- `npm run lint` – Runs the configured ESLint setup
- `npm run version:<type>` – Use standard npm versioning commands (`patch`, `minor`, `major`) to bump `manifest.json`, `package.json`, and `versions.json`

## Packaging & Release Checklist

1. Update `manifest.json` and `versions.json` with the new version / min Obsidian version.
2. Run `npm run build` to produce the distributable `main.js`.
3. Create a GitHub release (tag = version, no `v` prefix) and attach `manifest.json`, `main.js`, and `styles.css`.
4. (Optional) Submit a PR to [`obsidianmd/obsidian-releases`](https://github.com/obsidianmd/obsidian-releases) if you want the plugin listed publicly.

## Manual Installation

Copy the following into `Vault/.obsidian/plugins/obsidian-copilot/`:

- `manifest.json`
- `main.js`
- `styles.css`

Refresh Community Plugins in Obsidian and enable **Obsidian Copilot**.

## Roadmap

- Knowledge tab data visualizations and vault graph insights
- Safer tool approval UX (per-tool consent dialogs, trust levels)
- Expanded MCP toolset (querying calendars, external APIs, etc.)
- Conversation export + shareable snippets from the MessageRenderer

---

Have questions or ideas? Open an issue or discussion on the repository – contributions are welcome!
