---
name: prawl
description: Browser automation CLI for navigating websites, filling forms, taking screenshots, and extracting data using accessibility tree snapshots with stable element references.
license: MIT
metadata:
  author: thegreataxios
  version: "0.1.0"
  homepage: https://github.com/thegreataxios/prawl
---

# prawl - Browser Automation

Use prawl when you need to:
- Navigate to websites and extract information
- Fill forms and interact with web applications  
- Take screenshots for visual analysis
- Extract data from web pages
- Test web applications across different device viewports
- Automate browser workflows

## Installation

```bash
# Via npm
npm install -g @thegreataxios/prawl

# Via Homebrew
brew tap thegreataxios/tap
brew install prawl
```

## Core Concepts

### Sessions

prawl maintains browser sessions that persist between commands:

- **Default session**: `~/.prawl/sessions/default/` (persistent across runs)
- **Named sessions**: `prawl --session myproject open google.com`
- **Private sessions**: `prawl --session private open site.com` (ephemeral, auto-deleted)

### Accessibility Tree Snapshots

The `snapshot` command returns a structured representation of interactive elements:

```
- heading "Welcome" [ref=e1, level=1]
- textbox "Email" [ref=e2, placeholder="Enter email"]
- button "Submit" [ref=e3]
  clickable [cursor:pointer]
- link "Gmail" [ref=e4, url=https://mail.google.com/]
```

**Key**: Each interactive element gets a stable `@eN` reference that can be used for subsequent interactions.

### Command Chaining

Execute multiple commands in sequence:

```bash
prawl chain "open example.com && snapshot -i && click @e3"
```

- `&&` - Stop on error
- `;` - Continue on error  
- `--continue` - Never stop on error

## Commands

### Navigation

| Command | Purpose | Example |
|---------|---------|---------|
| `open <url>` | Navigate to URL | `prawl open google.com` |
| `goto <url>` | Alias for open | `prawl goto github.com` |
| `back` | Go back | `prawl back` |
| `forward` | Go forward | `prawl forward` |
| `reload` | Reload page | `prawl reload` |

### Interaction

| Command | Purpose | Example |
|---------|---------|---------|
| `click <ref>` | Click element by @eN ref | `prawl click @e2` |
| `fill <ref> <text>` | Clear and fill input | `prawl fill @e3 "test@example.com"` |
| `type <ref> <text>` | Type into input (append) | `prawl type @e4 "Hello"` |
| `press <key>` | Press key | `prawl press Enter` |
| `keydown <key>` | Hold key down | `prawl keydown Control` |
| `keyup <key>` | Release key | `prawl keyup Control` |
| `hover <ref>` | Hover element | `prawl hover @e5` |

### Finding Elements

| Command | Purpose | Example |
|---------|---------|---------|
| `find text <text> click` | Find by text content | `prawl find text "Submit" click` |
| `find role <role> click` | Find by ARIA role | `prawl find role button click --name "Submit"` |
| `find label <text> fill` | Find input by label | `prawl find label "Email" fill "test@test.com"` |
| `find placeholder <text> fill` | Find by placeholder | `prawl find placeholder "Search..." fill "cats"` |
| `find alt <text> click` | Find by alt text | `prawl find alt "Logo" click` |
| `find testid <id> click` | Find by data-testid | `prawl find testid "submit-btn" click` |

### Information Extraction

| Command | Purpose | Example |
|---------|---------|---------|
| `snapshot` | Get accessibility tree | `prawl snapshot -i` |
| `snapshot -i` | Interactive elements only | `prawl snapshot -i` |
| `snapshot -c` | Compact (remove empty) | `prawl snapshot -c` |
| `get title` | Get page title | `prawl get title` |
| `get url` | Get current URL | `prawl get url` |
| `get text <ref>` | Get element text | `prawl get text @e1` |
| `screenshot [path]` | Take screenshot | `prawl screenshot page.png` |
| `screenshot --full` | Full page screenshot | `prawl screenshot --full page.png` |

### Device Emulation

| Command | Purpose | Example |
|---------|---------|---------|
| `device <name>` | Emulate mobile device | `prawl device "iPhone 14"` |
| `viewport <w> <h>` | Set viewport size | `prawl viewport 1920 1080` |
| `devices` | List available devices | `prawl devices` |

### Workflow Commands

| Command | Purpose | Example |
|---------|---------|---------|
| `chain <commands>` | Sequential execution | `prawl chain "open google.com && snapshot"` |
| `parallel <commands>` | Parallel execution | `prawl parallel "get title | get url"` |
| `wait <ms>` | Wait milliseconds | `prawl wait 2000` |
| `eval <js>` | Execute JavaScript | `prawl eval "document.title" --force` |

### Console & State

| Command | Purpose | Example |
|---------|---------|---------|
| `console.enable` | Capture browser logs | `prawl console.enable` |
| `console` | View captured logs | `prawl console` |
| `state.save <path>` | Save session state | `prawl state.save /tmp/state.json` |
| `state.load <path>` | Load session state | `prawl state.load /tmp/state.json` |

## Examples

### Form Filling

```bash
# Open and snapshot to get element refs
prawl chain "open example.com/contact && snapshot -i"

# Fill the form using refs from snapshot
prawl chain "fill @e1 'John Doe' && fill @e2 'john@example.com' && fill @e3 'Hello World' && click @e4"
```

### Data Extraction

```bash
# Navigate and extract key info
prawl chain "open news.ycombinator.com && wait 2000 && snapshot -i"

# Get specific element text by ref
prawl get text @e5   # Article title
prawl get text @e10  # Another article
```

### Screenshot Comparison

```bash
# Mobile view
prawl device "iPhone 14"
prawl open twitter.com
prawl screenshot mobile-twitter.png

# Desktop view
prawl viewport 1920 1080
prawl screenshot desktop-twitter.png
```

### Login Flow

```bash
prawl chain "open example.com/login && \\
  fill @e1 'username' && \\
  fill @e2 'password' && \\
  click @e3 && \\
  wait 3000 && \\
  get title"
```

## Best Practices

1. **Always snapshot first** on a new page to understand the structure
2. **Use @eN refs** rather than CSS selectors when possible (more stable)
3. **Chain related commands** to reduce session overhead
4. **Use private sessions** for sensitive sites: `--session private`
5. **Use wait commands** after interactions that trigger page loads

## Troubleshooting

### "Session not found"
The session was closed. Re-run your initial command to create a new session.

### Element not found
The page may have changed. Run `snapshot -i` again to get fresh references.

### Command fails
Use `--json` flag for structured error output:
```bash
prawl --json open example.com
```

## Resources

- **Homepage**: https://github.com/thegreataxios/prawl
- **Issues**: https://github.com/thegreataxios/prawl/issues
- **Documentation**: https://prawl.dirtroad.dev
