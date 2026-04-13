# prawl

> Lightweight browser automation for AI agents using Bun.WebView

**prawl** is a fast, lightweight CLI for browser automation designed specifically for AI agents. It's a drop-in replacement for agent-browser with a smaller footprint (~63MB vs ~165MB compiled, ~86KB source bundle).

[![Version](https://img.shields.io/npm/v/@thegreataxios/prawl)](https://www.npmjs.com/package/@thegreataxios/prawl)
[![License](https://img.shields.io/badge/license-MIT-blue)](LICENSE)
[![Bun](https://img.shields.io/badge/bun-1.3.12+-black)](https://bun.sh)

## Features

- **Lightning Fast** - ~86KB source, ~63MB self-contained binary with embedded Bun runtime
- **Zero Dependencies** - Uses system WebKit (macOS) or auto-detected Chrome
- **AI-Optimized** - Accessibility tree snapshots with stable `@eN` refs
- **Chain & Parallel** - Execute multiple commands in sequence or parallel
- **HTTP API** - Built-in REST API on port 3000
- **Mobile Ready** - Device emulation for responsive testing
- **MCP Support** - Model Context Protocol for agent integration
- **Secure by Design** - Path validation, CDP allowlisting, action confirmation

## Installation

### Via npm (recommended for Node.js users)

~86KB source bundle, requires Bun >= 1.3.12:

```bash
npm install -g @thegreataxios/prawl
```

Or with Bun:
```bash
bun install -g @thegreataxios/prawl
```

### Via Homebrew (macOS/Linux)

**Default (source bundle):**
```bash
brew tap thegreataxios/tap
brew install prawl
```

**Self-contained binary (~63MB, no dependencies):**
```bash
brew tap thegreataxios/tap
brew install prawl
```

### Via GitHub Releases

Download pre-compiled binaries from [Releases](https://github.com/thegreataxios/prawl/releases):

```bash
# macOS ARM64
curl -L https://github.com/thegreataxios/prawl/releases/latest/download/prawl-macos-arm64 -o prawl
chmod +x prawl
sudo mv prawl /usr/local/bin/

# macOS x64
curl -L https://github.com/thegreataxios/prawl/releases/latest/download/prawl-macos-x64 -o prawl
chmod +x prawl
sudo mv prawl /usr/local/bin/
```

### From Source

Requires Bun 1.3.12+:

```bash
git clone https://github.com/thegreataxios/prawl.git
cd prawl
bun install
bun run build

# Use directly with Bun
bun run dev open google.com

# Or compile to native binary
bun run compile
sudo mv prawl /usr/local/bin/
```

### Linux

On Linux, Chrome or Chromium must be installed (WebKit not available on Linux):

```bash
# Ubuntu/Debian
sudo apt-get install chromium-browser

# Then use Chrome backend
prawl --backend chrome open google.com
```

## Quick Start

```bash
# Open a page
prawl open google.com

# Get accessibility snapshot
prawl snapshot -i  # Interactive elements only

# Click by ref from snapshot
prawl click @e3

# Fill input
prawl fill @e4 "test@example.com"

# Take screenshot
prawl screenshot page.png

# Close
prawl close
```

### One-Liner Workflow

```bash
prawl chain "open google.com && snapshot -i && click @e2 && screenshot /tmp/page.png"
```

## Commands

### Core Commands

```bash
prawl open <url>                    # Navigate to URL (aliases: goto)
prawl click <selector>                # Click element (@eN ref or CSS)
prawl fill <selector> <text>          # Clear and fill input
prawl type <selector> <text>         # Type text
prawl press <key>                     # Press key (Enter, Tab, Escape)
prawl hover <selector>               # Hover element
prawl scroll <dir> [px]               # Scroll (up/down/left/right)
prawl scrollTo <selector>            # Scroll element into view
prawl close                          # Close browser
```

### Get Info

```bash
prawl get text <selector>            # Get text content
prawl get html <selector>            # Get innerHTML
prawl get value <selector>           # Get input value
prawl get attr <selector> <attr>     # Get attribute
prawl get title                      # Get page title
prawl get url                        # Get current URL
prawl get count <selector>           # Count matching elements
prawl get box <selector>             # Get bounding box
```

### Check State

```bash
prawl is visible <selector>          # Check if visible
prawl is enabled <selector>          # Check if enabled
prawl is checked <selector>          # Check if checked
prawl is disabled <selector>         # Check if disabled
prawl is hidden <selector>           # Check if hidden
```

### Wait

```bash
prawl wait <selector>                # Wait for element visible
prawl wait <ms>                      # Wait milliseconds
prawl wait --text "Welcome"          # Wait for text to appear
prawl wait --url "**/dashboard"       # Wait for URL pattern
```

### Capture & Evaluate

```bash
prawl screenshot [path]              # Take screenshot
prawl screenshot --full              # Full page screenshot
prawl eval <js>                      # Run JavaScript
prawl pdf <path>                     # Save as PDF (Chrome only)
```

### Snapshot (Accessibility Tree)

```bash
prawl snapshot                       # Full accessibility tree
prawl snapshot -i                    # Interactive elements only
prawl snapshot -c                    # Compact (remove empty nodes)
prawl snapshot -d 3                  # Limit depth to 3 levels
prawl snapshot -s "#main"            # Scope to CSS selector
prawl snapshot -u                    # Include URLs for links
```

### Device Emulation

```bash
prawl device <name>                  # Emulate device (iPhone 14, iPad Pro, Pixel 7, Galaxy S22)
prawl viewport <w> <h>               # Set viewport size
prawl viewport <w> <h> --scale 2     # With device scale factor
prawl devices                        # List available devices
```

### Navigation

```bash
prawl back                           # Go back
prawl forward                        # Go forward
prawl reload                         # Reload page
```

### Dialogs

```bash
prawl dialog status                  # Check if dialog is pending
prawl dialog accept [text]           # Accept alert/confirm/prompt
prawl dialog dismiss                 # Dismiss dialog
```

### Forms & Uploads

```bash
prawl submit <form>                  # Submit form by selector
prawl setForm <form> <json>          # Set form values (e.g., '{"name":"John"}')
prawl upload <input> <files...>      # Upload file(s) to file input
```

### Workflow Commands

```bash
prawl chain "cmd1 && cmd2"           # Execute sequentially, stop on error
prawl chain "cmd1; cmd2"             # Execute sequentially, continue on error
prawl parallel "cmd1 | cmd2"         # Execute in parallel
prawl run "commands"                 # Alias for chain
prawl p "commands"                   # Alias for parallel
```

### Keyboard Events

```bash
prawl keydown <key>                  # Hold key down (Control, Shift, Alt, Meta)
prawl keyup <key>                    # Release key
prawl press <key>                    # Press and release key
```

### Find by Text (Semantic Selectors)

```bash
prawl find "Submit" click             # Find button by text and click
prawl find "Email" fill "test@test.com"  # Find input by text and fill
prawl find "Accept" --exact click     # Exact text match
```

### Console Capture

```bash
prawl console.enable                  # Start capturing browser console
prawl console                         # View captured logs
prawl console --clear                 # View and clear logs
prawl console.clear                   # Clear logs only
```

### State Save/Load (with Encryption)

```bash
prawl state.save /path/state.json              # Save cookies + storage
prawl state.save /path/state.json --password  # Encrypt with AES-256-GCM
prawl state.load /path/state.json              # Restore state
prawl state.load /path/state.json --password  # Decrypt and restore
```

### Connect to Existing Chrome

```bash
prawl connect                         # Auto-connect to Chrome on port 9222
prawl connect ws://host:9222/...      # Connect to specific CDP endpoint
```

### AI Chat (Natural Language)

```bash
prawl chat "search for cats"                      # Use default model
prawl chat "go to github" --model gpt-4o         # Specific model
prawl chat "analyze page" --baseUrl http://localhost:11434/v1  # Local/Ollama
```

### Sessions

```bash
prawl sessions                       # List active sessions
prawl --session <name> open <url>    # Use named session
prawl --session private open <url>   # Use ephemeral session
```

### Advanced (Chrome backend only)

```bash
prawl --backend chrome open <url>    # Use Chrome backend
prawl cdp <method> [params]          # Raw DevTools Protocol
prawl network enable                 # Enable network interception
```

## Sessions

prawl maintains browser sessions that persist between commands:

```bash
# Default session (persistent)
prawl open google.com

# Later, in another terminal:
prawl --session myproject open github.com
prawl --session myproject snapshot

# Private session (ephemeral, auto-deleted)
prawl --session private open sensitive-site.com

# List all sessions
prawl sessions
```

Each session has its own:
- Browser instance
- Cookies and storage
- Navigation history
- Authentication state

**Session Storage Location:**
- Default: `~/.prawl/sessions/default/`
- Named: `~/.prawl/sessions/<name>/`
- Private: Temp directory (auto-deleted on close)

## Command Chaining

Execute multiple commands efficiently:

```bash
# Sequential with error stopping (&&)
prawl chain "open example.com && snapshot -i && click @e2"

# Continue on error (semicolon separator)
prawl chain "open site.com; wait 2000; screenshot"

# Parallel execution
prawl parallel "open google.com | open github.com | open twitter.com"

# Options
prawl chain "open example.com && snapshot" --continue    # Continue on error
prawl chain "open example.com && snapshot" --keep-open     # Keep browser open
```

**Chain/Parallel Benefits:**
- Single execution overhead
- Automatic cleanup
- Structured results
- Error handling

## Selectors

### @eN Refs (Recommended for AI)

Refs provide deterministic element selection from snapshots:

```bash
# 1. Get snapshot with refs
prawl snapshot
# Output:
# - heading "Example Domain" [ref=e1] [level=1]
# - button "Submit" [ref=e2]
# - textbox "Email" [ref=e3]

# 2. Use refs to interact
prawl click @e2                   # Click the button
prawl fill @e3 "test@example.com" # Fill the textbox
prawl get text @e1                # Get heading text
```

**Why use refs?**
- **Deterministic**: Ref points to exact element from snapshot
- **Fast**: No DOM re-query needed
- **AI-friendly**: Snapshot + ref workflow is optimal for LLMs

### CSS Selectors

Traditional selectors also work:

```bash
prawl click "#submit"
prawl click ".btn-primary"
prawl fill "input[name='email']" "test@example.com"
```

## Examples

### Form Automation

```bash
prawl chain "open example.com/contact && \
  snapshot -i && \
  fill @e1 'John Doe' && \
  fill @e2 'john@example.com' && \
  fill @e3 'Hello World' && \
  click @e4 && \
  wait 3000 && \
  get title"
```

### Mobile Testing

```bash
prawl chain "device 'iPhone 14' && \
  open mobile.twitter.com && \
  screenshot mobile.png && \
  device 'iPad Pro' && \
  screenshot tablet.png && \
  viewport 1920 1080 && \
  screenshot desktop.png"
```

### Data Extraction

```bash
prawl chain "open news.ycombinator.com && \
  wait 2000 && \
  snapshot -i && \
  eval "Array.from(document.querySelectorAll('.titleline>a')).slice(0,5).map(a=>a.innerText)""
```

### Batch Screenshots

```bash
prawl parallel "open google.com | open github.com | open twitter.com"
prawl parallel "screenshot /tmp/google.png | screenshot /tmp/github.png | screenshot /tmp/twitter.png"
```

### E2E Testing Pattern

```bash
prawl chain "open myapp.com && \
  snapshot -i && \
  fill @e1 'user@example.com' && \
  fill @e2 'password' && \
  click @e3 && \
  wait --url '**/dashboard' && \
  snapshot -i && \
  screenshot /tmp/dashboard.png"
```

## Global Options

| Option | Description |
|--------|-------------|
| `--session <name>` | Session name (default: 'default', use 'private' for ephemeral) |
| `--headed` | Show browser window (not headless) |
| `--backend <webkit\|chrome>` | Browser backend |
| `--json` | Output as JSON |
| `--continue` | Continue on error (for chain/parallel) |
| `--keep-open` | Keep browser open after commands complete |

## HTTP API

prawl starts an HTTP server on an available port:

```bash
# Start the server (happens automatically)
prawl sessions

# Query via HTTP
curl "http://localhost:3000/open?url=google.com"
curl "http://localhost:3000/snapshot?interactive=true"
curl "http://localhost:3000/screenshot"
```

## MCP Server

For AI agent integration:

```bash
# Register with your agent
prawl mcp add

# Start MCP server
prawl --mcp
```

## Security

prawl includes security features for safe automation:

- **Path Validation** - Screenshots/PDFs restricted to safe directories (cwd, /tmp, or PRAWL_OUTPUT_DIR)
- **CDP Allowlist** - Only safe DevTools Protocol methods allowed
- **Eval Confirmation** - `--force` flag required for arbitrary JavaScript execution
- **No External Chrome Download** - Uses system browsers only

```bash
# Override security restrictions (use with caution)
PRAWL_UNRESTRICTED=1 prawl screenshot /any/path.png
```

## Configuration

Create a config file for persistent defaults:

```json
{
  "session": "default",
  "headed": false,
  "backend": "webkit",
  "apiKey": "your-openai-key",
  "baseUrl": "https://api.openai.com/v1"
}
```

**Locations (lowest to highest priority):**
1. `~/.config/prawl.json` - User-level config
2. `./prawl.json` - Project-level config
3. `PRAWL_*` / `OPENAI_*` environment variables
4. CLI flags

**Config Options:**

| Config Key | Env Variable | Description |
|------------|--------------|-------------|
| `session` | `PRAWL_SESSION` | Default session name |
| `headed` | `PRAWL_HEADED` | Show browser window |
| `backend` | `PRAWL_BACKEND` | webkit or chrome |
| `apiKey` | `OPENAI_API_KEY` | OpenAI API key for chat |
| `baseUrl` | `OPENAI_BASE_URL` | OpenAI-compatible API URL |
| `model` | `PRAWL_MODEL` | Default AI model |
| `password` | `PRAWL_STATE_PASSWORD` | State file encryption password |

## Architecture

- **CLI Framework**: [incur](https://github.com/incur/incur) - Type-safe with MCP/HTTP support
- **Browser Engine**: Bun.WebView - Native WebKit (macOS) or Chrome via DevTools Protocol
- **Size**: ~63MB binary (vs ~165MB agent-browser), ~86KB source bundle

## Comparison

| Feature | agent-browser | prawl |
|---------|--------------|------|
| Binary size | ~165MB | ~63MB |
| Source bundle | ~165MB | ~86KB |
| Chrome download | Required | Auto-detects existing |
| WebKit support | ❌ | ✅ (macOS native) |
| MCP support | ❌ | ✅ (via incur) |
| HTTP API | ❌ | ✅ (via incur) |
| Chain/Parallel | ❌ | ✅ |
| Path validation | ✅ | ✅ |
| Annotated screenshots | ✅ | ❌ (not implemented) |
| Dashboard | ✅ | ❌ (not implemented) |

## Documentation

- 📚 **Full Docs**: https://prawl.dirtroad.dev
- 🤖 **Agent Skills**: See `/skills/SKILL.md` in this repo
- 🐛 **Issues**: https://github.com/dirtroad-development/prawl/issues

## Code Signing (macOS)

For distribution, sign the binary:

```bash
# Quick: Ad-hoc signing (local use only, no Apple Developer needed)
./scripts/codesign.sh adhoc

# Distribution: Full signing + notarization (requires Apple Developer)
cp .env.example .env
# Edit .env with your credentials
./scripts/codesign.sh notarize
```

## Development

```bash
# Install dependencies
bun install

# Build
bun run build

# Dev mode
bun run dev <command>

# Test
bun run dev open google.com

# Compile to native binary
bun run compile
```

## Publishing

### Quick Start

1. **Create GitHub repo** `thegreataxios/prawl` and push code
2. **Add NPM_TOKEN** to GitHub Secrets (Settings → Secrets → Actions)
3. **Publish**: `git tag v0.1.0 && git push origin v0.1.0`
4. GitHub Actions will build binaries and publish to npm automatically

### NPM Setup

```bash
# Login to npm (one-time)
npm login

# Publish manually (or use GitHub Actions)
npm publish --access public
```

### macOS Code Signing (Optional)

For distributing signed macOS binaries:

```bash
# Setup credentials
cp .env.example .env
# Edit .env with your Apple Developer credentials

# Sign and notarize
./scripts/codesign.sh notarize
```

See `AGENTS.md` for detailed development notes and `scripts/codesign.sh --help` for signing options.

## License

MIT © Sawyer Cutler
