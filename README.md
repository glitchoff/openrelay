# 🔥 OpenDeck

Code editor for Android. Your dev machine, in your pocket.

```
Phone / PWA
    ↕  WebSocket
OpenDeck Bridge (Termux)
    ↕  SSH
Your Machine
```

## How it works

1. Install the bridge in **Termux** (Android terminal emulator)
2. Bridge opens a WebSocket server on your phone's localhost
3. Bridge connects to your remote machine via SSH
4. Open the **PWA** in your phone browser
5. PWA connects to the bridge — you have a full code editor

## Quick start

```bash
# In Termux, run:
curl -sL https://raw.githubusercontent.com/abhay/opendeck/main/scripts/setup.sh | bash
```

Follow the prompts — enter your SSH target (user@host) and password. The bridge starts automatically.

Then open **https://opendeck.dev** in your phone browser and connect to `ws://127.0.0.1:8080`.

## Architecture

```
┌──────────────────────┐
│   PWA (Phone Browser)│  CodeMirror editor + xterm.js terminal
│   ws://localhost:8080 │
└─────────┬────────────┘
          │  WebSocket (JSON)
┌─────────▼────────────┐
│  Bridge (Termux)     │  Python asyncio + websockets
│  SSH proxy           │  SSH subprocess + PTY
└─────────┬────────────┘
          │  SSH
┌─────────▼────────────┐
│  Dev Machine          │  Your code, your tools
│  Linux / macOS / WSL  │
└──────────────────────┘
```

## Development

```bash
pnpm install
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

## License

MIT
