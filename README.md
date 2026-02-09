# AE Conjure

**Free, open-source AI scripting assistant for Adobe After Effects.**

Generate, run, and manage ExtendScript code using Claude, GPT, or Gemini — directly inside After Effects.

---

## Features

- **Multi-Model AI** — Choose between Anthropic Claude, OpenAI GPT, and Google Gemini
- **Auto-Retry** — Failed scripts are automatically retried with error context (up to 3 attempts)
- **Composition Awareness** — Sends your comp structure to the AI for more accurate scripts
- **Native Undo** — Every generated script is wrapped in an undo group (Cmd/Ctrl+Z to rollback)
- **Script Library** — Save, search, categorize, and favorite your best scripts
- **Adobe Theme Sync** — Matches your After Effects color theme automatically

## Requirements

- Adobe After Effects 2020 or later (CEP-compatible)
- An API key from at least one provider:
  - [Anthropic](https://console.anthropic.com/) (Claude)
  - [OpenAI](https://platform.openai.com/) (GPT)
  - [Google AI Studio](https://aistudio.google.com/) (Gemini)

## Installation

### Method 1: Manual Install (Development)

1. Clone or download this repository
2. Copy the `ae-conjure` folder to your CEP extensions directory:
   - **macOS:** `~/Library/Application Support/Adobe/CEP/extensions/`
   - **Windows:** `C:\Users\<user>\AppData\Roaming\Adobe\CEP\extensions\`
3. Enable unsigned extensions (required for development):
   - **macOS:** Open Terminal and run:
     ```bash
     defaults write com.adobe.CSXS.9 PlayerDebugMode 1
     ```
   - **Windows:** Add registry key:
     ```
     HKEY_CURRENT_USER\Software\Adobe\CSXS.9
     PlayerDebugMode = 1 (String)
     ```
4. Restart After Effects
5. Open the panel: **Window > Extensions > AE Conjure**

### Method 2: ZXP Package

1. Download the latest `.zxp` from [Releases](https://github.com/2b3pro/ae-conjure/releases)
2. Install using [ZXP Installer](https://aescripts.com/learn/zxp-installer/) or [Anastasiy's Extension Manager](https://install.anastasiy.com/)
3. Restart After Effects

## Usage

1. Open the AE Conjure panel (**Window > Extensions > AE Conjure**)
2. Click the gear icon and enter your API key
3. Select your preferred AI provider and model
4. Type what you want to do (e.g., "Rename all selected layers to their source name")
5. Click **Run** or press **Enter**
6. The AI generates ExtendScript, runs it in your comp, and shows the result
7. If the script fails, it automatically retries with the error context
8. Save successful scripts to your library for one-click reuse

### API Key Setup

You need an API key from at least one provider. AE Conjure calls the AI APIs directly from your machine — your keys never touch a third-party server.

| Provider | Get a Key | Models Available |
|----------|-----------|-----------------|
| **Anthropic** | [console.anthropic.com](https://console.anthropic.com/) | Claude Sonnet 4.5, Claude Opus 4.6, Claude Haiku 4.5 |
| **OpenAI** | [platform.openai.com](https://platform.openai.com/) | GPT-5.2 Codex, GPT-5.1 Codex Max, GPT-4.1 |
| **Google** | [aistudio.google.com](https://aistudio.google.com/) | Gemini 2.5 Flash, Gemini 2.5 Pro |

1. Click the **gear icon** in the toolbar
2. Paste your API key into the field for your provider
3. Click **Save**

Keys are stored locally at `~/ae-conjure/settings.json` and are never transmitted anywhere except directly to the provider's API endpoint.

### Tips

- **Enable Comp Context** (checkbox in toolbar) to give the AI full awareness of your composition structure
- Use specific language: "Add a 2-second fade-in to the selected layer" works better than "make it fade"
- The Script Library stores scripts locally in `~/ae-conjure/library.json`

## Architecture

```
ae-conjure/
├── CSXS/manifest.xml          # CEP extension manifest
├── client/                     # Panel UI (Chromium via CEP)
│   ├── index.html             # Main panel
│   ├── css/styles.css         # Adobe Spectrum-inspired theme
│   └── js/
│       ├── main.js            # Panel orchestration
│       ├── ai-client.js       # Multi-model API router
│       ├── retry-engine.js    # Auto-retry with error feedback
│       ├── library.js         # Script library CRUD
│       ├── settings.js        # API key & preference management
│       ├── ui.js              # DOM rendering
│       └── lib/CSInterface.js # Adobe CEP interface library
├── host/                       # ExtendScript (runs in AE)
│   ├── main.jsx               # Entry point
│   ├── introspect.jsx         # Comp structure reader
│   └── execute.jsx            # Safe execution wrapper
└── package.json
```

## How It Works

1. You describe what you want in natural language
2. AE Conjure reads your active composition structure (layers, effects, selection)
3. Your prompt + comp context is sent to the AI model
4. The AI returns ExtendScript code (ES3 syntax)
5. Code is executed inside an undo group via `csInterface.evalScript()`
6. If execution fails, the error + code is sent back for auto-retry (up to 3x)
7. On success, you can save the script to your local library

## Contributing

Contributions are welcome! Please:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes
4. Push to the branch
5. Open a Pull Request

## License

[MIT](LICENSE) - Free to use, modify, and distribute.

## Credits

Built by [Ian Shen](https://github.com/2b3pro)

---

*AE Conjure is not affiliated with or endorsed by Adobe Inc.*
