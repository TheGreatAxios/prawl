# prawl - Agent Notes

## Quick Commands

```bash
# Install dependencies
bun install

# Build (outputs to dist/cli.mjs)
bun run build

# Dev mode (runs src/cli.ts directly)
bun run dev <command> [args]

# Compile to native binary
bun run compile  # Creates ./prawl executable
```

## CLI Behavior

**"Started development server" is NORMAL.** The `incur` framework starts an HTTP server (port 3000) alongside CLI execution. This enables MCP and HTTP API access. The CLI command still executes.

Example:
```bash
$ bun run dev open google.com
Started development server: http://localhost:3000  ← Normal
Session: default (persistent)
url: "https://www.google.com/"
```

## Architecture

```
src/
├── cli.ts              # Entry: incur CLI setup, all commands registered here
├── core/
│   ├── webview.ts      # Bun.WebView wrapper + session + advanced features
│   └── snapshot.ts     # Accessibility tree engine
├── commands/           # Command implementations (unused - logic in cli.ts via incur)
├── utils/
│   ├── selectors.ts    # @eN ref parsing
│   └── snapshot-eval.ts # JS injected for DOM analysis
```

**Key:** All CLI commands are registered in `src/cli.ts` using `cli.command()`. The `commands/` folder has helper implementations but command registration happens in cli.ts.

## Backend Support

- **WebKit** (macOS default): Zero deps, uses system WebView
- **Chrome** (cross-platform): Auto-detects existing Chrome, enables CDP/PDF features

Force Chrome: `prawl --backend chrome open example.com`

## Chrome-Only Features

These require `--backend chrome`:
- `prawl cdp <method>` - Raw DevTools Protocol
- `prawl pdf <path>` - PDF generation
- `prawl network enable` - Request interception

## Session Storage

```bash
# Persistent (default): ~/.prawl/sessions/<name>/
prawl --session myproject open github.com

# Ephemeral (tmp dir, auto-deleted):
prawl --session private open sensitive.com
```

## Testing

### Unit Tests (Bun Test Runner)

```bash
# Run full test suite
bun test

# Or explicitly
bun run test:unit
```

Tests are in `test/prawl.test.ts` and cover:
- Core commands (open, snapshot, get, close)
- Chain/parallel execution
- Keyboard events (keydown, keyup, press)
- State encryption (save/load with password)

### Manual Testing

```bash
bun run dev --help              # List commands
bun run dev open google.com     # Basic navigation
bun run dev snapshot -i         # Interactive snapshot
bun run dev click @e2           # Click by ref (requires prior snapshot)
bun run dev keydown Control     # Test keyboard
bun run dev find "Submit" click # Test text-based selectors
```

## Benchmarks

Simple local time-to-run benchmarks:

```bash
# Quick test (verifies commands work, ~5s)
bun run benchmark

# Or manually
cd benchmarks && ./run.sh

# Clean up port 3000 if needed between runs
pkill -f prawl && sleep 1 && ./run.sh
```

**Focus**: Measures local CLI execution time (not distributed performance).

**Attribution**: Benchmark structure derived from vercel-labs/agent-browser (Apache-2.0).

## Dependencies

- `incur` - CLI framework (provides --help, --json, MCP, HTTP API)
- `zod` - Schema validation
- `Bun.WebView` - Native browser automation (Bun 1.3.12+)

## Build Output

- `dist/cli.mjs` - Bundled output (~32KB)
- `prawl` - Native executable after `bun run compile`

## macOS Code Signing

Two ways to provide Apple credentials (never commit secrets to git):

### Option 1: .env file (Good for CI/CD)
```bash
# Copy template and edit with your credentials
cp .env.example .env
# Edit .env (it's gitignored)

# Run codesign (auto-loads from .env)
./scripts/codesign.sh notarize
```

### Option 2: macOS Keychain (Good for local dev)
```bash
# One-time setup to store in keychain
APPLE_TEAM_ID=XXX APPLE_ID=you@example.com APPLE_APP_PASSWORD=xxx ./scripts/codesign.sh setup

# Subsequent runs use keychain automatically
./scripts/codesign.sh notarize
```

### Quick commands
```bash
./scripts/codesign.sh adhoc      # Local-only signing (no Apple Dev needed)
./scripts/codesign.sh notarize   # Full sign + notarize for distribution
./scripts/codesign.sh verify     # Check signing status
```

See `./scripts/codesign.sh --help` for full documentation.

**Note:** The `scripts/entitlements.plist` includes JIT entitlements required for Bun runtime execution under macOS Hardened Runtime.
