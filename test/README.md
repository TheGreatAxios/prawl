# Testing prawl

## Quick Test

Run the full test suite:

```bash
bun test
```

## Run Specific Tests

```bash
# Run only basic navigation tests
bun test --grep "Basic Navigation"

# Run only snapshot tests
bun test --grep "Snapshot"

# Run with verbose output
bun test --verbose
```

## Test Structure

The test suite covers:

1. **Help & Info** - CLI help and command listing
2. **Basic Navigation** - open, get title/url, reload
3. **Navigation History** - back, forward
4. **Snapshot** - basic and compact snapshots
5. **Element Interaction** - find by text, find by role
6. **Keyboard Events** - keydown, keyup, press
7. **Scrolling** - scroll up/down
8. **Device Emulation** - device, viewport, devices list
9. **Screenshot** - PNG capture
10. **Console Logs** - logs retrieval and clearing
11. **Chain Commands** - sequential execution
12. **Parallel Commands** - parallel execution
13. **State Management** - save/load session state
14. **Dialog Handling** - dialog status check
15. **Configuration** - config display and retrieval
16. **Session Management** - named sessions
17. **Form Commands** - form submission
18. **JavaScript Evaluation** - eval command
19. **Chrome-only Features** - CDP, PDF, network (skipped if Chrome not available)

## Manual Testing

For interactive features not covered in automated tests:

```bash
# Interactive snapshot (requires human verification)
bun run dev open example.com
bun run dev snapshot -i

# Click by element ref (requires getting ref from snapshot)
bun run dev click @e1

# Fill and type
bun run dev fill @e1 "test text"
bun run dev type @e1 "typed text"

# Natural language find
bun run dev find "first button" click
bun run dev find label "Email" fill "test@example.com"
```

## Test Configuration

Tests use:
- **Test URL**: `https://example.com` (reliable, simple page)
- **Session**: `test-session` (isolated from your default session)
- **Timeout**: 30s per test (60s for screenshots)
- **Temp Directory**: `/tmp/prawl-test`

## Troubleshooting

### Tests failing with "Session not found"

Make sure you don't have a conflicting session running:

```bash
# Kill any existing prawl processes
pkill -f prawl

# Clear session files
rm -rf ~/.prawl/sessions/test-session
```

### Screenshot tests failing on macOS

Grant screen recording permission to Terminal/iTerm:
1. System Preferences → Security & Privacy → Privacy → Screen Recording
2. Add your terminal app
3. Restart terminal

### Chrome-only tests skipped

These tests run only if Chrome is running with remote debugging:

```bash
# Start Chrome with remote debugging
/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome --remote-debugging-port=9222

# Then run tests
bun test --grep "Chrome"
```
