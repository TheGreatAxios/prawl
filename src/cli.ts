// Main CLI entry point using incur

import { Cli, z } from "incur";
import { WebViewController, SnapshotEngine } from "./core/index.js";

// Global state (per session)
const sessions = new Map<string, { controller: WebViewController; snapshot: SnapshotEngine }>();

function getSession(name: string): { controller: WebViewController; snapshot: SnapshotEngine } | null {
  return sessions.get(name) || null;
}

async function createSession(
  name: string,
  options: {
    headed?: boolean;
    backend?: "webkit" | "chrome";
    private?: boolean;
    width?: number;
    height?: number;
  }
): Promise<{ controller: WebViewController; snapshot: SnapshotEngine }> {
  if (sessions.has(name)) {
    return sessions.get(name)!;
  }

  const controller = new WebViewController({
    headless: !options.headed,
    backend: options.backend,
    sessionName: options.private ? undefined : name,
    privateSession: options.private,
    width: options.width || 1280,
    height: options.height || 720,
  });

  await controller.initialize();
  
  const snapshot = new SnapshotEngine(controller);
  const session = { controller, snapshot };
  sessions.set(name, session);
  
  return session;
}

// Load config files (optional) - sync version
function loadConfig(): Record<string, string> {
  const configs: Record<string, string> = {};
  
  // ~/.config/prawl.json (user config)
  try {
    const home = process.env.HOME || process.env.USERPROFILE;
    if (!home) return configs;
    const userConfigPath = `${home}/.config/prawl.json`;
    const userConfigFile = Bun.file(userConfigPath);
    if (userConfigFile.size > 0) {
      const userConfig = JSON.parseSync(userConfigFile);
      Object.entries(userConfig).forEach(([key, value]) => {
        if (typeof value === "string" || typeof value === "boolean" || typeof value === "number") {
          configs[key] = String(value);
        }
      });
    }
  } catch {
    // Config file doesn't exist or is invalid - that's ok, it's optional
  }
  
  // ./prawl.json (project config - higher priority, overwrites user config)
  try {
    const projectConfigFile = Bun.file(`./prawl.json`);
    if (projectConfigFile.size > 0) {
      const projectConfig = JSON.parseSync(projectConfigFile);
      Object.entries(projectConfig).forEach(([key, value]) => {
        if (typeof value === "string" || typeof value === "boolean" || typeof value === "number") {
          configs[key] = String(value);
        }
      });
    }
  } catch {
    // Config file doesn't exist or is invalid - that's ok, it's optional
  }
  
  return configs;
}

const config = loadConfig();

// Apply config as env vars (if not already set) - CLI flags will override these
const configToEnvMap: Record<string, string> = {
  session: "PRAWL_SESSION",
  headed: "PRAWL_HEADED",
  backend: "PRAWL_BACKEND",
  apiKey: "OPENAI_API_KEY",
  baseUrl: "OPENAI_BASE_URL",
  model: "PRAWL_MODEL",
  password: "PRAWL_STATE_PASSWORD",
};

Object.entries(config).forEach(([key, value]) => {
  const envVar = configToEnvMap[key] || `PRAWL_${key.toUpperCase()}`;
  if (!process.env[envVar]) {
    process.env[envVar] = value;
  }
});

// Create main CLI - v2
const cli = Cli.create("prawl", {
  version: "0.1.0",
  description: "Lightweight browser automation for AI agents using Bun.WebView",
  vars: z.object({
    session: z.custom<{ controller: WebViewController; snapshot: SnapshotEngine }>(),
  }),
  sync: {
    depth: 1,
    suggestions: [
      "prawl open google.com and take a snapshot",
      "prawl click @e3 on the login form",
      "prawl screenshot --full page.png",
    ],
  },
});

// Middleware to resolve session
cli.use(async (c, next) => {
  // Safe access to options (may not be available for all commands)
  const sessionName = (c.options?.session as string) || process.env.PRAWL_SESSION || "default";
  const headed = (c.options?.headed as boolean) || false;
  const backend = c.options?.backend as "webkit" | "chrome" | undefined;
  const isPrivate = sessionName === "private";
  
  let session = getSession(sessionName);
  
  if (!session) {
    session = await createSession(sessionName, {
      headed,
      backend,
      private: isPrivate,
    });
  }
  
  c.set("session", session);
  await next();
});

// Global options
const globalOptions = z.object({
  session: z.string().optional().describe("Session name (default: 'default', 'private' for ephemeral)"),
  headed: z.boolean().optional().describe("Show browser window (not headless)"),
  backend: z.enum(["webkit", "chrome"]).optional().describe("Browser backend (webkit default on macOS)"),
  json: z.boolean().optional().describe("Output as JSON"),
});

// Navigation commands
cli.command("open", {
  description: "Navigate to URL",
  args: z.object({
    url: z.string().describe("URL to navigate to"),
  }),
  options: globalOptions,
  examples: [
    { args: { url: "google.com" }, description: "Open Google" },
    { args: { url: "https://example.com" }, description: "Open with protocol" },
  ],
  output: z.object({
    url: z.string(),
    title: z.string(),
  }),
  async run(c) {
    const { controller } = c.var.session;
    await controller.navigate(c.args.url);
    return {
      url: controller.getUrl(),
      title: controller.getTitle(),
    };
  },
});

cli.command("close", {
  description: "Close browser session",
  options: globalOptions,
  output: z.object({ closed: z.boolean() }),
  async run(c) {
    const { controller } = c.var.session;
    await controller.close();
    sessions.delete(c.options.session as string || "default");
    return { closed: true };
  },
});

cli.command("connect", {
  description: "Connect to existing Chrome with remote debugging enabled",
  args: z.object({
    cdpUrl: z.string().optional().describe("CDP WebSocket URL (e.g., ws://localhost:9222/devtools/browser/xxx)"),
  }),
  options: globalOptions,
  output: z.object({ connected: z.boolean(), url: z.string().optional() }),
  async run(c) {
    const { controller } = c.var.session;
    
    // Auto-discover Chrome if no URL provided
    let cdpUrl = c.args.cdpUrl;
    if (!cdpUrl) {
      try {
        const res = await fetch("http://localhost:9222/json/version");
        if (res.ok) {
          const version = await res.json();
          cdpUrl = `ws://localhost:9222/devtools/browser/${version.webSocketDebuggerUrl?.split('/').pop() || ''}`;
        }
      } catch {
        return c.error({ code: "NOT_FOUND", message: "No Chrome found on port 9222. Start Chrome with: --remote-debugging-port=9222" });
      }
    }
    
    await controller.connectToChrome(cdpUrl);
    return { connected: true, url: cdpUrl };
  },
});

cli.command("goto", {
  description: "Alias for open",
  args: z.object({
    url: z.string().describe("URL to navigate to"),
  }),
  options: globalOptions,
  output: z.object({
    url: z.string(),
    title: z.string(),
  }),
  async run(c) {
    const { controller } = c.var.session;
    await controller.navigate(c.args.url);
    return {
      url: controller.getUrl(),
      title: controller.getTitle(),
    };
  },
});

// Interaction commands
cli.command("click", {
  description: "Click element by selector or @eN ref",
  args: z.object({
    selector: z.string().describe("CSS selector or @eN reference"),
  }),
  options: globalOptions,
  output: z.object({ clicked: z.boolean(), selector: z.string() }),
  async run(c) {
    const { controller } = c.var.session;
    await controller.click(c.args.selector);
    return { clicked: true, selector: c.args.selector };
  },
});

cli.command("fill", {
  description: "Clear and fill input field",
  args: z.object({
    selector: z.string().describe("CSS selector or @eN reference"),
    text: z.string().describe("Text to fill"),
  }),
  options: globalOptions,
  output: z.object({ filled: z.boolean(), selector: z.string() }),
  async run(c) {
    const { controller } = c.var.session;
    await controller.click(c.args.selector);
    await controller.press("Control+a");
    await controller.type(c.args.text);
    return { filled: true, selector: c.args.selector };
  },
});

cli.command("type", {
  description: "Type text into focused element",
  args: z.object({
    selector: z.string().describe("CSS selector or @eN reference"),
    text: z.string().describe("Text to type"),
  }),
  options: globalOptions,
  output: z.object({ typed: z.boolean(), selector: z.string() }),
  async run(c) {
    const { controller } = c.var.session;
    await controller.click(c.args.selector);
    await controller.type(c.args.text);
    return { typed: true, selector: c.args.selector };
  },
});

cli.command("press", {
  description: "Press key (Enter, Tab, Escape, etc.)",
  args: z.object({
    key: z.string().describe("Key to press"),
  }),
  options: globalOptions.extend({
    modifiers: z.array(z.string()).optional().describe("Modifier keys (Control, Alt, Shift, Meta)"),
  }),
  output: z.object({ pressed: z.boolean(), key: z.string() }),
  async run(c) {
    const { controller } = c.var.session;
    const modifiers = c.options.modifiers as string[] | undefined;
    await controller.press(c.args.key, modifiers);
    return { pressed: true, key: c.args.key };
  },
});

cli.command("keydown", {
  description: "Hold key down",
  args: z.object({
    key: z.string().describe("Key to hold down (e.g., 'Control', 'Shift', 'Alt')"),
  }),
  options: globalOptions,
  output: z.object({ keyDown: z.boolean(), key: z.string() }),
  async run(c) {
    const { controller } = c.var.session;
    await controller.keyDown(c.args.key);
    return { keyDown: true, key: c.args.key };
  },
});

cli.command("keyup", {
  description: "Release key",
  args: z.object({
    key: z.string().describe("Key to release"),
  }),
  options: globalOptions,
  output: z.object({ keyUp: z.boolean(), key: z.string() }),
  async run(c) {
    const { controller } = c.var.session;
    await controller.keyUp(c.args.key);
    return { keyUp: true, key: c.args.key };
  },
});

cli.command("hover", {
  description: "Hover over element",
  args: z.object({
    selector: z.string().describe("CSS selector or @eN reference"),
  }),
  options: globalOptions,
  output: z.object({ hovered: z.boolean(), selector: z.string() }),
  async run(c) {
    const { controller } = c.var.session;
    // Hover = click without pressing (implementation detail)
    await controller.click(c.args.selector);
    return { hovered: true, selector: c.args.selector };
  },
});

cli.command("scroll", {
  description: "Scroll page",
  args: z.object({
    direction: z.enum(["up", "down", "left", "right"]).describe("Scroll direction"),
    amount: z.number().default(100).describe("Pixels to scroll"),
  }),
  options: globalOptions,
  output: z.object({ scrolled: z.boolean(), direction: z.string(), amount: z.number() }),
  async run(c) {
    const { controller } = c.var.session;
    let dx = 0;
    let dy = 0;
    
    switch (c.args.direction) {
      case "up": dy = -c.args.amount; break;
      case "down": dy = c.args.amount; break;
      case "left": dx = -c.args.amount; break;
      case "right": dx = c.args.amount; break;
    }
    
    await controller.scroll(dx, dy);
    return { scrolled: true, direction: c.args.direction, amount: c.args.amount };
  },
});

cli.command("scrollTo", {
  description: "Scroll element into view",
  args: z.object({
    selector: z.string().describe("CSS selector or @eN reference"),
  }),
  options: globalOptions,
  output: z.object({ scrolled: z.boolean(), selector: z.string() }),
  async run(c) {
    const { controller } = c.var.session;
    await controller.scrollTo(c.args.selector);
    return { scrolled: true, selector: c.args.selector };
  },
});

// Snapshot command
cli.command("snapshot", {
  description: "Get accessibility tree with refs",
  options: globalOptions.extend({
    interactive: z.boolean().optional().describe("Interactive elements only"),
    compact: z.boolean().optional().describe("Remove empty nodes"),
    depth: z.number().optional().describe("Max tree depth"),
    selector: z.string().optional().describe("Scope to CSS selector"),
    urls: z.boolean().optional().describe("Include URLs for links"),
  }),
  alias: { interactive: "i", compact: "c", depth: "d", selector: "s", urls: "u" },
  examples: [
    { options: { interactive: true }, description: "Interactive elements only (-i)" },
    { options: { compact: true }, description: "Compact mode (-c)" },
    { options: { depth: 3 }, description: "Limit depth to 3 levels (-d 3)" },
    { options: { selector: "#main" }, description: "Scope to #main (-s '#main')" },
    { options: { urls: true }, description: "Include URLs (-u)" },
  ],
  output: z.object({
    snapshot: z.string(),
    refs: z.any(),
  }),
  async run(c) {
    const { snapshot } = c.var.session;
    const result = await snapshot.takeSnapshot({
      interactive: c.options.interactive,
      compact: c.options.compact,
      depth: c.options.depth,
      selector: c.options.selector,
      includeUrls: c.options.urls,
    });
    
    if (!result.success) {
      return c.error({
        code: "SNAPSHOT_FAILED",
        message: result.error || "Unknown error",
      });
    }
    
    return result.data as { snapshot: string; refs: Record<string, { selector: string; tag: string }> };
  },
});

// Query commands
cli.command("get", {
  description: "Get page or element info",
  args: z.object({
    type: z.enum(["text", "html", "value", "attr", "title", "url", "count", "box"]).describe("What to get"),
    selector: z.string().optional().describe("CSS selector (not needed for title/url)"),
    extra: z.array(z.string()).optional().describe("Additional args (e.g., attribute name)"),
  }),
  options: globalOptions,
  output: z.any(),
  async run(c) {
    const { controller } = c.var.session;
    const { type, selector, extra } = c.args;
    
    switch (type) {
      case "title":
        return { value: controller.getTitle() };
      case "url":
        return { value: controller.getUrl() };
      case "text":
        if (!selector) throw new Error("Selector required for get text");
        const text = await controller.evaluate<string>(
          `document.querySelector(${JSON.stringify(selector)})?.textContent?.trim() || ""`
        );
        return { value: text };
      case "html":
        if (!selector) throw new Error("Selector required for get html");
        const html = await controller.evaluate<string>(
          `document.querySelector(${JSON.stringify(selector)})?.innerHTML || ""`
        );
        return { value: html };
      case "value":
        if (!selector) throw new Error("Selector required for get value");
        const val = await controller.evaluate<string>(
          `document.querySelector(${JSON.stringify(selector)})?.value || ""`
        );
        return { value: val };
      case "attr":
        if (!selector || !extra?.[0]) throw new Error("Selector and attribute name required");
        const attr = await controller.evaluate<string>(
          `document.querySelector(${JSON.stringify(selector)})?.getAttribute(${JSON.stringify(extra[0])}) || ""`
        );
        return { value: attr };
      case "count":
        if (!selector) throw new Error("Selector required for get count");
        const count = await controller.evaluate<number>(
          `document.querySelectorAll(${JSON.stringify(selector)}).length`
        );
        return { value: count };
      case "box":
        if (!selector) throw new Error("Selector required for get box");
        const box = await controller.evaluate<{ x: number; y: number; width: number; height: number } | null>(`
          const el = document.querySelector(${JSON.stringify(selector)});
          if (!el) return null;
          const rect = el.getBoundingClientRect();
          return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
        `);
        return { value: box };
      default:
        throw new Error(`Unknown get type: ${type}`);
    }
  },
});

cli.command("is", {
  description: "Check element state",
  args: z.object({
    type: z.enum(["visible", "enabled", "disabled", "checked", "hidden"]).describe("State to check"),
    selector: z.string().describe("CSS selector or @eN reference"),
  }),
  options: globalOptions,
  output: z.object({ state: z.boolean(), type: z.string(), selector: z.string() }),
  async run(c) {
    const { controller } = c.var.session;
    const { type, selector } = c.args;
    
    let result = false;
    
    switch (type) {
      case "visible":
        result = await controller.evaluate<boolean>(`
          const el = document.querySelector(${JSON.stringify(selector)});
          if (!el) return false;
          return el.checkVisibility ? 
            el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }) :
            (el.offsetParent !== null);
        `);
        break;
      case "enabled":
        result = await controller.evaluate<boolean>(`
          const el = document.querySelector(${JSON.stringify(selector)});
          if (!el) return false;
          return !el.disabled;
        `);
        break;
      case "disabled":
        result = await controller.evaluate<boolean>(`
          const el = document.querySelector(${JSON.stringify(selector)});
          if (!el) return false;
          return !!el.disabled;
        `);
        break;
      case "checked":
        result = await controller.evaluate<boolean>(`
          const el = document.querySelector(${JSON.stringify(selector)});
          if (!el) return false;
          return el.checked === true;
        `);
        break;
      case "hidden":
        result = await controller.evaluate<boolean>(`
          const el = document.querySelector(${JSON.stringify(selector)});
          if (!el) return true;
          return !el.checkVisibility || !el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true });
        `);
        break;
    }
    
    return { state: result, type, selector };
  },
});

// Find command (semantic locator)
cli.command("find", {
  description: "Find element by semantic locator (role, label, text, placeholder, alt, testid) and interact",
  args: z.object({
    type: z.enum(["text", "role", "label", "placeholder", "alt", "title", "testid", "first", "last", "nth"]).default("text").describe("Locator type"),
    value: z.string().describe("Value to search for (text, role name, label text, etc.)"),
    action: z.enum(["click", "fill", "type", "hover", "text", "focus", "check", "uncheck"]).default("click").describe("Action to perform"),
    actionValue: z.string().optional().describe("Value for fill action"),
  }),
  options: globalOptions.extend({
    name: z.string().optional().describe("Accessible name filter (for role type)"),
    exact: z.boolean().optional().describe("Require exact text match (default: partial)"),
    index: z.coerce.number().optional().describe("Index for nth selector (1-based, default: 1)"),
  }),
  alias: { exact: "e", name: "n" },
  examples: [
    // Explicit syntax
    { args: { type: "text", value: "Submit", action: "click" }, description: "Find by text and click" },
    { args: { type: "role", value: "button", action: "click" }, options: { name: "Submit" }, description: "Find button by role and name" },
    { args: { type: "label", value: "Email", action: "fill" }, description: "Find input by label and fill" },
    // Natural language (position-based)
    { args: { type: "text", value: "first button", action: "click" }, description: "Natural: first button" },
    { args: { type: "text", value: "second link", action: "click" }, description: "Natural: second link" },
    { args: { type: "text", value: "last item", action: "click" }, description: "Natural: last item" },
    // Natural language (locator-based)
    { args: { type: "text", value: "button named Submit", action: "click" }, description: "Natural: button named X" },
    { args: { type: "text", value: "label Email", action: "fill" }, description: "Natural: label X" },
    { args: { type: "text", value: "placeholder Search", action: "fill" }, description: "Natural: placeholder X" },
    { args: { type: "text", value: "alt Logo", action: "click" }, description: "Natural: alt X" },
    { args: { type: "text", value: "testid submit-btn", action: "click" }, description: "Natural: testid X" },
    // Other actions
    { args: { type: "text", value: "Accept", action: "check" }, description: "Find and check checkbox" },
  ],
  output: z.object({
    found: z.boolean(),
    selector: z.string().optional(),
    action: z.string(),
    element: z.object({ tag: z.string(), text: z.string().optional(), accessibleName: z.string().optional() }).optional(),
    text: z.string().optional(),
  }),
  async run(c) {
    const { controller } = c.var.session;
    let { type, value, action } = c.args;
    let { name, exact, index } = c.options;

    // Natural language parsing for ALL locator types
    // Supports: "first button", "second link", "label Email", "placeholder Search", etc.
    if (type === "text") {
      const naturalPatterns = [
        // Position-based: "first button", "2nd link", "last item"
        { pattern: /^(first|second|third|fourth|fifth|last|1st|2nd|3rd|4th|5th)\s+(.+)$/i, handler: (m: RegExpMatchArray) => {
          const pos = m[1].toLowerCase();
          const el = m[2].trim();
          const map: Record<string, { type: string; index?: number }> = {
            first: { type: "first" }, second: { type: "nth", index: 2 },
            third: { type: "nth", index: 3 }, fourth: { type: "nth", index: 4 },
            fifth: { type: "nth", index: 5 }, last: { type: "last" },
            "1st": { type: "first" }, "2nd": { type: "nth", index: 2 },
            "3rd": { type: "nth", index: 3 }, "4th": { type: "nth", index: 4 },
            "5th": { type: "nth", index: 5 },
          };
          const mapped = map[pos];
          return mapped ? { type: mapped.type, value: el, index: mapped.index } : null;
        }},
        // Role with name: "button named Submit", "link named Read more"
        { pattern: /^(button|link|input|checkbox|radio|heading|img|image)\s+(?:named|with\s+name|with\s+text|labelled)\s+(.+)$/i, handler: (m: RegExpMatchArray) => {
          const role = m[1].toLowerCase();
          const nm = m[2].trim();
          return { type: "role", value: role === "img" || role === "image" ? "img" : role, name: nm };
        }},
        // Direct locators: "label Email", "placeholder Search", "alt Logo", "title Close", "testid submit-btn"
        { pattern: /^(label|placeholder|alt|title|testid)\s+(.+)$/i, handler: (m: RegExpMatchArray) => {
          const locType = m[1].toLowerCase();
          const val = m[2].trim();
          return { type: locType, value: val };
        }},
      ];

      for (const { pattern, handler } of naturalPatterns) {
        const match = value.match(pattern);
        if (match) {
          const result = handler(match);
          if (result) {
            type = result.type as any;
            value = result.value;
            if (result.index) index = result.index;
            if (result.name) name = result.name;
            break;
          }
        }
      }
    }

    let selector: string | null = null;
    let matchedElement: { tag: string; text?: string; accessibleName?: string } | null = null;

    switch (type) {
      case "role": {
        // Find by ARIA role with optional name filter
        const result = await controller.evaluate<{
          selector: string;
          tag: string;
          accessibleName: string;
        } | null>(`
          (function() {
            const elements = document.querySelectorAll('[role="${value}"], ${value}');
            for (const el of elements) {
              const accessibleName = el.getAttribute('aria-label') ||
                                    el.textContent?.trim() ||
                                    el.getAttribute('title') || '';
              ${name
                ? `if (accessibleName.toLowerCase().includes("${name.toLowerCase()}"))`
                : ''}
              return {
                selector: el.id ? '#'+el.id : 
                         (el.className && typeof el.className === 'string' && el.className.trim()) 
                           ? el.tagName.toLowerCase() + '.' + el.className.trim().split(/\\s+/)[0]
                           : el.tagName.toLowerCase(),
                tag: el.tagName.toLowerCase(),
                accessibleName
              };
            }
            return null;
          })()
        `);
        if (result) {
          selector = result.selector;
          matchedElement = { tag: result.tag, accessibleName: result.accessibleName };
        }
        break;
      }

      case "label": {
        // Find input associated with label text
        const result = await controller.evaluate<{
          selector: string;
          tag: string;
          text: string;
        } | null>(`
          (function() {
            // Find label with text
            const labels = document.querySelectorAll('label');
            for (const label of labels) {
              const text = label.textContent?.trim() || '';
              if (${exact ? `text === "${value}"` : `text.toLowerCase().includes("${value.toLowerCase()}")`}) {
                // Return the associated input
                const forId = label.getAttribute('for');
                let input = null;
                if (forId) {
                  input = document.getElementById(forId);
                }
                // Or nested input
                if (!input) {
                  input = label.querySelector('input, textarea, select');
                }
                if (input) {
                  return {
                    selector: input.id ? '#'+input.id :
                             (input.className && typeof input.className === 'string' && input.className.trim())
                               ? input.tagName.toLowerCase() + '.' + input.className.trim().split(/\\s+/)[0]
                               : input.tagName.toLowerCase(),
                    tag: input.tagName.toLowerCase(),
                    text: text
                  };
                }
              }
            }
            // Also check aria-label directly on inputs
            const inputs = document.querySelectorAll('input, textarea, select');
            for (const input of inputs) {
              const ariaLabel = input.getAttribute('aria-label') || '';
              if (${exact ? `ariaLabel === "${value}"` : `ariaLabel.toLowerCase().includes("${value.toLowerCase()}")`}) {
                return {
                  selector: input.id ? '#'+input.id :
                           (input.className && typeof input.className === 'string' && input.className.trim())
                             ? input.tagName.toLowerCase() + '.' + input.className.trim().split(/\\s+/)[0]
                             : input.tagName.toLowerCase(),
                  tag: input.tagName.toLowerCase(),
                  text: ariaLabel
                };
              }
            }
            return null;
          })()
        `);
        if (result) {
          selector = result.selector;
          matchedElement = result;
        }
        break;
      }

      case "placeholder": {
        // Find by placeholder text
        const result = await controller.evaluate<{
          selector: string;
          tag: string;
          text: string;
        } | null>(`
          (function() {
            const elements = document.querySelectorAll('input[placeholder], textarea[placeholder]');
            for (const el of elements) {
              const ph = el.getAttribute('placeholder') || '';
              if (${exact ? `ph === "${value}"` : `ph.toLowerCase().includes("${value.toLowerCase()}")`}) {
                return {
                  selector: el.id ? '#'+el.id :
                           (el.className && typeof el.className === 'string' && el.className.trim())
                             ? el.tagName.toLowerCase() + '.' + el.className.trim().split(/\\s+/)[0]
                             : el.tagName.toLowerCase() + '[placeholder*="${value}"]',
                  tag: el.tagName.toLowerCase(),
                  text: ph
                };
              }
            }
            return null;
          })()
        `);
        if (result) {
          selector = result.selector;
          matchedElement = result;
        }
        break;
      }

      case "alt": {
        // Find by alt text (images, areas)
        const result = await controller.evaluate<{
          selector: string;
          tag: string;
          text: string;
        } | null>(`
          (function() {
            const elements = document.querySelectorAll('img[alt], area[alt], [role="img"][aria-label]');
            for (const el of elements) {
              const alt = el.getAttribute('alt') || el.getAttribute('aria-label') || '';
              if (${exact ? `alt === "${value}"` : `alt.toLowerCase().includes("${value.toLowerCase()}")`}) {
                return {
                  selector: el.id ? '#'+el.id :
                           (el.className && typeof el.className === 'string' && el.className.trim())
                             ? el.tagName.toLowerCase() + '.' + el.className.trim().split(/\\s+/)[0]
                             : el.tagName.toLowerCase(),
                  tag: el.tagName.toLowerCase(),
                  text: alt
                };
              }
            }
            return null;
          })()
        `);
        if (result) {
          selector = result.selector;
          matchedElement = result;
        }
        break;
      }

      case "title": {
        // Find by title attribute
        const result = await controller.evaluate<{
          selector: string;
          tag: string;
          text: string;
        } | null>(`
          (function() {
            const elements = document.querySelectorAll('[title]');
            for (const el of elements) {
              const title = el.getAttribute('title') || '';
              if (${exact ? `title === "${value}"` : `title.toLowerCase().includes("${value.toLowerCase()}")`}) {
                return {
                  selector: el.id ? '#'+el.id :
                           (el.className && typeof el.className === 'string' && el.className.trim())
                             ? el.tagName.toLowerCase() + '.' + el.className.trim().split(/\\s+/)[0]
                             : el.tagName.toLowerCase() + '[title*="${value}"]',
                  tag: el.tagName.toLowerCase(),
                  text: title
                };
              }
            }
            return null;
          })()
        `);
        if (result) {
          selector = result.selector;
          matchedElement = result;
        }
        break;
      }

      case "testid": {
        // Find by data-testid (testing best practice)
        selector = `[data-testid="${value}"]`;
        // Verify it exists
        const exists = await controller.evaluate<boolean>(`
          !!document.querySelector('[data-testid="${value}"]')
        `);
        if (exists) {
          const tag = await controller.evaluate<string>(`
            document.querySelector('[data-testid="${value}"]')?.tagName.toLowerCase() || 'unknown'
          `);
          matchedElement = { tag };
        } else {
          selector = null;
        }
        break;
      }

      case "first":
      case "last":
      case "nth": {
        // Position-based selection
        const idx = type === "first" ? 0 : type === "last" ? -1 : ((index || 1) - 1);
        const result = await controller.evaluate<{
          selector: string;
          tag: string;
          index: number;
        } | null>(`
          (function() {
            const elements = document.querySelectorAll('${value}');
            const el = ${idx === -1 ? 'elements[elements.length - 1]' : `elements[${idx}]`};
            if (!el) return null;
            return {
              selector: el.id ? '#'+el.id :
                       (el.className && typeof el.className === 'string' && el.className.trim())
                         ? el.tagName.toLowerCase() + '.' + el.className.trim().split(/\\s+/)[0]
                         : '${value}',
              tag: el.tagName.toLowerCase(),
              index: ${idx === -1 ? 'elements.length - 1' : idx}
            };
          })()
        `);
        if (result) {
          selector = result.selector;
          matchedElement = { tag: result.tag };
        }
        break;
      }

      default: {
        // Text-based search (backward compatible)
        const result = await controller.evaluate<{
          selector: string;
          tag: string;
          text: string;
        } | null>(`
          (function() {
            const elements = document.querySelectorAll('button, a, input, textarea, select, label, [role="button"], [role="link"]');
            for (const el of elements) {
              const textContent = el.textContent?.trim() || '';
              const ariaLabel = el.getAttribute('aria-label') || '';
              const title = el.title || '';
              const haystack = ${exact ? 'textContent' : '(textContent + " " + ariaLabel + " " + title).toLowerCase()'};
              const needle = ${JSON.stringify(exact ? value : value.toLowerCase())};

              if (${exact ? 'haystack === needle' : 'haystack.includes(needle)'}) {
                return {
                  selector: el.id ? '#'+el.id :
                           (el.className && typeof el.className === 'string' && el.className.trim())
                             ? el.tagName.toLowerCase() + '.' + el.className.trim().split(/\\s+/)[0]
                             : el.tagName.toLowerCase(),
                  tag: el.tagName.toLowerCase(),
                  text: textContent
                };
              }
            }
            return null;
          })()
        `);
        if (result) {
          selector = result.selector;
          matchedElement = result;
        }
      }
    }

    if (!selector) {
      return c.error({
        code: "NOT_FOUND",
        message: `No element found with ${type}="${value}"${name ? ` and name="${name}"` : ''}${type === 'nth' ? ` at index ${index || 1}` : ''}`,
      });
    }

    // Perform action
    switch (action) {
      case "click":
        await controller.click(selector);
        break;
      case "fill":
        await controller.click(selector);
        await controller.press("Control+a");
        await controller.type(c.args.actionValue || "");
        break;
      case "type":
        // Type without clearing (distinct from fill)
        await controller.click(selector);
        await controller.type(c.args.actionValue || "");
        break;
      case "check": {
        // Check checkbox/radio if not already checked
        const wasChecked = await controller.evaluate<boolean>(`
          const el = document.querySelector("${selector.replace(/"/g, '\\"')}");
          if (!el) return false;
          if (!el.checked) {
            el.click();
            return true;
          }
          return false;
        `);
        return { found: true, selector, action: "check", wasChecked, element: matchedElement || undefined };
      }
      case "uncheck": {
        // Uncheck checkbox if currently checked
        const wasUnchecked = await controller.evaluate<boolean>(`
          const el = document.querySelector("${selector.replace(/"/g, '\\"')}");
          if (!el) return false;
          if (el.checked) {
            el.click();
            return true;
          }
          return false;
        `);
        return { found: true, selector, action: "uncheck", wasUnchecked, element: matchedElement || undefined };
      }
      case "hover":
        await controller.click(selector);
        break;
      case "focus":
        await controller.click(selector);
        break;
      case "text": {
        // Just return the text without clicking
        const text = await controller.evaluate<string>(
          `document.querySelector("${selector.replace(/"/g, '\\"')}")?.textContent?.trim() || ""`
        );
        return { found: true, selector, action: "text", text, element: matchedElement || undefined };
      }
    }

    return {
      found: true,
      selector,
      action,
      element: matchedElement || undefined,
    };
  },
});

// Wait command
cli.command("wait", {
  description: "Wait for element, text, or timeout",
  args: z.object({
    target: z.union([z.string(), z.number()]).describe("Selector, text to find, or milliseconds"),
  }),
  options: globalOptions.extend({
    text: z.boolean().optional().describe("Wait for text content"),
    url: z.boolean().optional().describe("Wait for URL pattern"),
    loadState: z.enum(["load", "domcontentloaded", "networkidle"]).optional().describe("Wait for load state"),
    state: z.enum(["visible", "hidden"]).optional().describe("Wait for visibility state"),
    timeout: z.number().default(25000).describe("Timeout in milliseconds"),
  }),
  output: z.object({ waited: z.boolean(), target: z.union([z.string(), z.number()]) }),
  async run(c) {
    const { controller } = c.var.session;
    const { target } = c.args;
    const timeout = c.options.timeout as number;
    
    if (typeof target === "number") {
      // Simple timeout
      await new Promise(resolve => setTimeout(resolve, target));
      return { waited: true, target };
    }
    
    if (c.options.text) {
      // Wait for text
      const startTime = Date.now();
      let found = false;
      
      while (Date.now() - startTime < timeout) {
        found = await controller.evaluate<boolean>(`
          document.body.innerText.includes(${JSON.stringify(target)})
        `);
        if (found) break;
        await new Promise(r => setTimeout(r, 100));
      }
      
      if (!found) {
        return c.error({ code: "TIMEOUT", message: `Text "${target}" not found within ${timeout}ms` });
      }
      
      return { waited: true, target };
    }
    
    if (c.options.url) {
      // Wait for URL pattern
      const startTime = Date.now();
      let matched = false;
      
      while (Date.now() - startTime < timeout) {
        const url = controller.getUrl();
        if (url.includes(target)) {
          matched = true;
          break;
        }
        await new Promise(r => setTimeout(r, 100));
      }
      
      if (!matched) {
        return c.error({ code: "TIMEOUT", message: `URL pattern "${target}" not matched within ${timeout}ms` });
      }
      
      return { waited: true, target };
    }
    
    // Default: wait for selector
    const startTime = Date.now();
    let found = false;
    
    while (Date.now() - startTime < timeout) {
      const visible = c.options.state !== "hidden";
      found = await controller.evaluate<boolean>(`
        const el = document.querySelector(${JSON.stringify(target)});
        if (!el) return false;
        ${visible ? `
        return el.checkVisibility ? 
          el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }) :
          (el.offsetParent !== null);
        ` : `
        return !el.checkVisibility || !el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true });
        `}
      `);
      if (found) break;
      await new Promise(r => setTimeout(r, 100));
    }
    
    if (!found) {
      return c.error({ code: "TIMEOUT", message: `Element "${target}" not ${c.options.state || "visible"} within ${timeout}ms` });
    }
    
    return { waited: true, target };
  },
});

// Screenshot command
cli.command("screenshot", {
  description: "Take screenshot",
  args: z.object({
    path: z.string().optional().describe("Output path (default: auto-generated)"),
  }),
  options: globalOptions.extend({
    format: z.enum(["png", "jpeg", "webp"]).default("png").describe("Image format"),
    quality: z.number().min(0).max(100).optional().describe("JPEG quality (0-100)"),
    fullPage: z.boolean().optional().describe("Full page screenshot"),
  }),
  alias: { fullPage: "full" },
  output: z.object({ path: z.string(), format: z.string() }),
  async run(c) {
    const { controller } = c.var.session;
    
    const image = await controller.screenshot({
      format: c.options.format as "png" | "jpeg" | "webp",
      quality: c.options.quality,
      fullPage: c.options.fullPage,
    });
    
    // Validate and sanitize output path
    let outputPath = c.args.path || `/tmp/prawl-${Date.now()}.${c.options.format}`;
    
    // Prevent directory traversal - ensure path is within allowed directories
    const allowedDirs = [
      process.cwd(),
      '/tmp',
      process.env.HOME || '/tmp',
      process.env.PRAWL_OUTPUT_DIR,
    ].filter(Boolean);
    
    const path = await import('path');
    const resolvedPath = path.resolve(outputPath);
    const isAllowed = allowedDirs.some(dir => resolvedPath.startsWith(dir));
    
    if (!isAllowed && !process.env.PRAWL_UNRESTRICTED) {
      return c.error({ 
        code: "INVALID_PATH", 
        message: `Path "${outputPath}" is outside allowed directories. Use cwd, /tmp, or set PRAWL_OUTPUT_DIR. Use --json for base64 output instead.` 
      });
    }
    
    await Bun.write(outputPath, image);
    
    return { path: outputPath, format: c.options.format as string };
  },
});

// Evaluate command
cli.command("eval", {
  description: "Evaluate JavaScript in page context (DANGEROUS: executes arbitrary code in browser)",
  args: z.object({
    script: z.string().describe("JavaScript code to execute"),
  }),
  options: globalOptions.extend({
    force: z.boolean().optional().describe("Acknowledge security risk and execute anyway"),
  }),
  output: z.object({ result: z.any() }),
  hint: "⚠️ Warning: eval executes arbitrary JavaScript in the browser context. Only use with trusted scripts. Use --force to bypass confirmation in scripts.",
  async run(c) {
    const { controller } = c.var.session;
    
    // Security warning if not forcing
    if (!c.options.force && !process.env.PRAWL_UNRESTRICTED) {
      console.error("⚠️  WARNING: Evaluating arbitrary JavaScript in the browser context can be dangerous.");
      console.error("   Use --force flag to execute, or set PRAWL_UNRESTRICTED=1");
      return c.error({ code: "SECURITY_CONFIRMATION", message: "Use --force to acknowledge security risk" });
    }
    
    const result = await controller.evaluate(c.args.script);
    return { result };
  },
});

// Eval-file command - execute JavaScript from file
cli.command("eval-file", {
  description: "Evaluate JavaScript from file (DANGEROUS: executes arbitrary code in browser)",
  args: z.object({
    path: z.string().describe("Path to JavaScript file to execute"),
  }),
  options: globalOptions.extend({
    force: z.boolean().optional().describe("Acknowledge security risk and execute anyway"),
  }),
  output: z.object({ result: z.any() }),
  hint: "⚠️ Warning: eval-file executes arbitrary JavaScript in the browser context. Only use with trusted scripts. Use --force to bypass confirmation.",
  async run(c) {
    const { controller } = c.var.session;
    
    // Security warning if not forcing
    if (!c.options.force && !process.env.ROVER_UNRESTRICTED) {
      console.error("⚠️  Security Warning: eval-file executes arbitrary JavaScript in the browser.");
      console.error("   The script has access to cookies, localStorage, and can make network requests.");
      console.error("   Use --force flag to execute, or set ROVER_UNRESTRICTED=1");
      return c.error({ code: "SECURITY_CONFIRMATION", message: "Use --force to acknowledge security risk" });
    }
    
    // Validate path
    const resolvedPath = c.args.path.startsWith("/") 
      ? c.args.path 
      : `${process.cwd()}/${c.args.path}`;
    
    // Security: Check for path traversal
    if (resolvedPath.includes("..") || resolvedPath.includes("~")) {
      return c.error({ code: "INVALID_PATH", message: "Invalid file path" });
    }
    
    const script = await Bun.file(resolvedPath).text();
    const result = await controller.evaluate(script);
    return { result };
  },
});

// Navigation controls
cli.command("back", {
  description: "Go back in history",
  options: globalOptions,
  output: z.object({ navigated: z.boolean() }),
  async run(c) {
    const { controller } = c.var.session;
    await controller.goBack();
    return { navigated: true };
  },
});

cli.command("forward", {
  description: "Go forward in history",
  options: globalOptions,
  output: z.object({ navigated: z.boolean() }),
  async run(c) {
    const { controller } = c.var.session;
    await controller.goForward();
    return { navigated: true };
  },
});

cli.command("reload", {
  description: "Reload page",
  options: globalOptions,
  output: z.object({ reloaded: z.boolean() }),
  async run(c) {
    const { controller } = c.var.session;
    await controller.reload();
    return { reloaded: true };
  },
});

// Batch command
cli.command("batch", {
  description: "Execute multiple commands from file or inline",
  args: z.object({
    file: z.string().optional().describe("Path to batch file (.prawl)"),
    commands: z.array(z.string()).optional().describe("Commands to execute in sequence (if no file provided)"),
  }),
  options: globalOptions.extend({
    bail: z.boolean().optional().describe("Stop on first error"),
  }),
  output: z.object({
    results: z.array(z.object({ command: z.string(), success: z.boolean(), data: z.any() })),
    allSucceeded: z.boolean(),
    completed: z.boolean(),
  }),
  async run(c) {
    const { controller, snapshot } = c.var.session;
    const results = [];
    
    // Get commands from file or args
    let commands: string[] = [];
    
    if (c.args.file) {
      // Read commands from file
      try {
        const content = await Bun.file(c.args.file).text();
        commands = content.split('\n').map(line => line.trim()).filter(line => line.length > 0 && !line.startsWith('#'));
      } catch (error) {
        return c.error({ code: "FILE_ERROR", message: `Failed to read batch file: ${error}` });
      }
    } else if (c.args.commands) {
      commands = c.args.commands;
    } else {
      return c.error({ code: "NO_COMMANDS", message: "Provide either a file path or commands array" });
    }
    
    for (const cmdStr of commands) {
      const startTime = Date.now();
      
      // Parse command string
      const parts = cmdStr.split(/\s+/);
      const action = parts[0];
      const args = parts.slice(1);
      
      try {
        let result: any;
        let success = false;
        
        // Execute common commands
        switch (action) {
          case "open":
          case "goto":
            if (args[0]) {
              await controller.navigate(args[0]);
              result = { url: controller.getUrl(), title: controller.getTitle() };
              success = true;
            } else {
              throw new Error("URL required for open");
            }
            break;
            
          case "click":
            if (args[0]) {
              await controller.click(args[0]);
              result = { clicked: true, selector: args[0] };
              success = true;
            } else {
              throw new Error("Selector required for click");
            }
            break;
            
          case "fill":
            if (args[0] && args[1]) {
              await controller.click(args[0]);
              await controller.press("Control+a");
              await controller.type(args[1]);
              result = { filled: true, selector: args[0], text: args[1] };
              success = true;
            } else {
              throw new Error("Selector and text required for fill");
            }
            break;
            
          case "type":
            if (args[0] && args[1]) {
              await controller.click(args[0]);
              await controller.type(args[1]);
              result = { typed: true, selector: args[0], text: args[1] };
              success = true;
            } else {
              throw new Error("Selector and text required for type");
            }
            break;
            
          case "press":
            if (args[0]) {
              await controller.press(args[0]);
              result = { pressed: true, key: args[0] };
              success = true;
            } else {
              throw new Error("Key required for press");
            }
            break;
            
          case "wait":
            if (args[0]) {
              const ms = parseInt(args[0]);
              if (!isNaN(ms)) {
                await new Promise(r => setTimeout(r, ms));
                result = { waited: ms };
                success = true;
              }
            } else {
              throw new Error("Milliseconds required for wait");
            }
            break;
            
          case "snapshot":
            const snapResult = await snapshot.takeSnapshot({
              interactive: args.includes("-i") || args.includes("--interactive"),
            });
            success = snapResult.success;
            result = snapResult.data;
            if (!success) throw new Error(snapResult.error);
            break;
            
          case "get":
            if (args[0] === "title") {
              result = { title: controller.getTitle() };
              success = true;
            } else if (args[0] === "url") {
              result = { url: controller.getUrl() };
              success = true;
            } else {
              throw new Error("Invalid get command");
            }
            break;
            
          case "close":
            await controller.close();
            result = { closed: true };
            success = true;
            break;
            
          default:
            throw new Error(`Unknown command: ${action}`);
        }
        
        results.push({ command: cmdStr, success, data: result });
      } catch (error) {
        results.push({ 
          command: cmdStr, 
          success: false, 
          data: error instanceof Error ? error.message : String(error) 
        });
        if (c.options.bail) break;
      }
    }
    
    return {
      results,
      allSucceeded: results.every(r => r.success),
      completed: true,
    };
  },
});

// Session management
cli.command("sessions", {
  description: "List active sessions",
  options: globalOptions,
  output: z.object({ sessions: z.array(z.string()) }),
  run() {
    return { sessions: Array.from(sessions.keys()) };
  },
});

// ==================== CONSOLE COMMANDS ====================

cli.command("console.enable", {
  description: "Enable console capture to view browser logs",
  options: globalOptions,
  output: z.object({ enabled: z.boolean() }),
  async run(c) {
    const { controller } = c.var.session;
    await controller.enableConsoleCapture();
    return { enabled: true };
  },
});

cli.command("console", {
  description: "View captured console logs (run console.enable first)",
  options: globalOptions.extend({
    clear: z.boolean().optional().describe("Clear logs after viewing"),
  }),
  output: z.object({ logs: z.array(z.object({ type: z.string(), message: z.string(), timestamp: z.number() })) }),
  async run(c) {
    const { controller } = c.var.session;
    const logs = await controller.getConsoleLogs(c.options.clear || false);
    return { logs };
  },
});

cli.command("console.clear", {
  description: "Clear console logs",
  options: globalOptions,
  output: z.object({ cleared: z.boolean() }),
  async run(c) {
    const { controller } = c.var.session;
    controller.clearConsoleLogs();
      await controller.evaluate(`window.__prawlConsole = []`);
    return { cleared: true };
  },
});

// ==================== STATE COMMANDS ====================

cli.command("state.save", {
  description: "Save session state to file",
  args: z.object({
    path: z.string().describe("File path to save state"),
  }),
  options: globalOptions.extend({
    password: z.string().optional().describe("Password to encrypt state file (optional)"),
  }),
  output: z.object({ saved: z.boolean(), path: z.string(), encrypted: z.boolean() }),
  async run(c) {
    const { controller } = c.var.session;
    const password = c.options.password || process.env.PRAWL_STATE_PASSWORD;
    await controller.saveState(c.args.path, password);
    return { saved: true, path: c.args.path, encrypted: !!password };
  },
});

cli.command("state.load", {
  description: "Load session state from file",
  args: z.object({
    path: z.string().describe("File path to load state from"),
  }),
  options: globalOptions.extend({
    password: z.string().optional().describe("Password to decrypt state file (if encrypted)"),
  }),
  output: z.object({ loaded: z.boolean(), path: z.string() }),
  async run(c) {
    const { controller } = c.var.session;
    const password = c.options.password || process.env.PRAWL_STATE_PASSWORD;
    await controller.loadState(c.args.path, password);
    return { loaded: true, path: c.args.path };
  },
});

// ==================== DIALOG COMMANDS ====================

cli.command("dialog.status", {
  description: "Check if a dialog is pending",
  options: globalOptions,
  output: z.object({
    pending: z.boolean(),
    type: z.string().optional(),
    message: z.string().optional(),
  }),
  async run(c) {
    const { controller } = c.var.session;
    const dialog = controller.getPendingDialog();

    if (!dialog) {
      return { pending: false };
    }

    return {
      pending: true,
      type: dialog.type,
      message: dialog.message,
    };
  },
});

cli.command("dialog.accept", {
  description: "Accept the pending dialog",
  args: z.object({
    text: z.string().optional().describe("Text to enter for prompt dialogs"),
  }),
  options: globalOptions,
  examples: [
    { args: {}, description: "Accept confirm dialog" },
    { args: { text: "John Doe" }, description: "Accept prompt with text" },
  ],
  output: z.object({ accepted: z.boolean() }),
  async run(c) {
    const { controller } = c.var.session;
    controller.acceptDialog(c.args.text);
    return { accepted: true };
  },
});

cli.command("dialog.dismiss", {
  description: "Dismiss the pending dialog",
  options: globalOptions,
  output: z.object({ dismissed: z.boolean() }),
  async run(c) {
    const { controller } = c.var.session;
    controller.dismissDialog();
    return { dismissed: true };
  },
});

// ==================== FORM COMMANDS ====================

cli.command("submit", {
  description: "Submit a form by selector",
  args: z.object({
    selector: z.string().describe("CSS selector for the form"),
  }),
  options: globalOptions,
  examples: [
    { args: { selector: "#login-form" }, description: "Submit login form" },
    { args: { selector: "form.search" }, description: "Submit search form" },
  ],
  output: z.object({ submitted: z.boolean(), selector: z.string() }),
  async run(c) {
    const { controller } = c.var.session;
    await controller.submitForm(c.args.selector);
    return { submitted: true, selector: c.args.selector };
  },
});

cli.command("setForm", {
  description: "Set form input values (JSON object)",
  args: z.object({
    selector: z.string().describe("CSS selector for the form"),
    values: z.string().describe("JSON object with field names and values (e.g., '{\"email\":\"test@example.com\"}')"),
  }),
  options: globalOptions,
  examples: [
    { args: { selector: "#login-form", values: '{"username":"admin","password":"secret"}' }, description: "Set login credentials" },
    { args: { selector: "form.contact", values: '{"name":"John","email":"john@example.com"}' }, description: "Set contact form values" },
  ],
  output: z.object({ set: z.boolean(), selector: z.string(), fields: z.number() }),
  async run(c) {
    const { controller } = c.var.session;

    let values: Record<string, string>;
    try {
      values = JSON.parse(c.args.values);
    } catch {
      return c.error({ code: "INVALID_JSON", message: "Invalid JSON format for values" });
    }

    if (typeof values !== "object" || values === null) {
      return c.error({ code: "INVALID_VALUES", message: "Values must be a JSON object" });
    }

    await controller.setFormValues(c.args.selector, values);
    return { set: true, selector: c.args.selector, fields: Object.keys(values).length };
  },
});

// ==================== UPLOAD COMMAND ====================

cli.command("upload", {
  description: "Upload file(s) to a file input",
  args: z.object({
    selector: z.string().describe("CSS selector for the file input"),
    files: z.array(z.string()).describe("File path(s) to upload"),
  }),
  options: globalOptions,
  examples: [
    { args: { selector: "input[type=file]", files: ["/path/to/photo.jpg"] }, description: "Upload single file" },
    { args: { selector: "#attachments", files: ["/file1.pdf", "/file2.png"] }, description: "Upload multiple files" },
  ],
  output: z.object({ uploaded: z.boolean(), selector: z.string(), files: z.number() }),
  async run(c) {
    const { controller } = c.var.session;
    const filePaths = c.args.files;

    if (filePaths.length === 1) {
      await controller.uploadFile(c.args.selector, filePaths[0]);
    } else {
      await controller.uploadFiles(c.args.selector, filePaths);
    }

    return { uploaded: true, selector: c.args.selector, files: filePaths.length };
  },
});

// ==================== CHROME-ONLY ADVANCED COMMANDS ====================

cli.command("cdp", {
  description: "Execute a raw Chrome DevTools Protocol command (Chrome only)",
  args: z.object({
    method: z.string().describe("CDP method name (e.g., 'Runtime.evaluate')"),
    params: z.string().optional().describe("JSON params object (optional)"),
  }),
  options: globalOptions,
  examples: [
    { args: { method: "Runtime.evaluate", params: '{"expression":"1+1"}' }, description: "Evaluate expression via CDP" },
    { args: { method: "Page.reload" }, description: "Reload page via CDP" },
  ],
  output: z.object({ result: z.any() }),
  async run(c) {
    const { controller } = c.var.session;

    if (!controller.isChrome()) {
      return c.error({ code: "CHROME_ONLY", message: "CDP is only available with Chrome backend. Use --backend chrome" });
    }

    // CDP method allowlist for security
    const ALLOWED_CDP_METHODS = new Set([
      // Runtime
      "Runtime.evaluate",
      "Runtime.getProperties",
      "Runtime.callFunctionOn",
      // DOM
      "DOM.querySelector",
      "DOM.querySelectorAll",
      "DOM.getDocument",
      "DOM.getBoxModel",
      // Page
      "Page.reload",
      "Page.navigate",
      "Page.getResourceTree",
      "Page.captureScreenshot",
      "Page.printToPDF",
      // Network (read-only)
      "Network.enable",
      "Network.disable",
      "Network.getResponseBody",
      // Target (limited)
      "Target.getTargets",
      // Accessibility
      "Accessibility.getFullAXTree",
      // Debugger (safe only)
      "Debugger.enable",
      "Debugger.disable",
    ]);

    const BLOCKED_PATTERNS = [
      /Target\.createTarget/,
      /Target\.closeTarget/,
      /Browser\./,
      /Storage\.clear/,
      /Storage\.set/,
      /Network\.setCookie/,
      /Network\.deleteCookies/,
      /Emulation\.set/,
    ];

    const isBlocked = BLOCKED_PATTERNS.some(pattern => pattern.test(c.args.method));
    
    if (isBlocked || !ALLOWED_CDP_METHODS.has(c.args.method)) {
      return c.error({ 
        code: "FORBIDDEN_METHOD", 
        message: `CDP method "${c.args.method}" is not allowed for security reasons. Use 'Runtime.evaluate', 'DOM.querySelector', 'Page.reload', etc.` 
      });
    }

    let params: Record<string, unknown> | undefined;
    if (c.args.params) {
      try {
        params = JSON.parse(c.args.params);
      } catch {
        return c.error({ code: "INVALID_JSON", message: "Invalid JSON format for params" });
      }
    }

    const result = await controller.cdp(c.args.method, params);
    return { result };
  },
});

cli.command("pdf", {
  description: "Generate PDF of the current page (Chrome only)",
  args: z.object({
    path: z.string().describe("Output file path"),
  }),
  options: globalOptions.extend({
    landscape: z.boolean().optional().describe("Landscape orientation"),
    printBackground: z.boolean().optional().describe("Print background graphics"),
    scale: z.number().optional().describe("Scale factor (default: 1)"),
    width: z.number().optional().describe("Paper width in inches"),
    height: z.number().optional().describe("Paper height in inches"),
  }),
  examples: [
    { args: { path: "/tmp/page.pdf" }, description: "Generate PDF" },
    { args: { path: "/tmp/page.pdf" }, options: { landscape: true }, description: "Landscape PDF" },
  ],
  output: z.object({ path: z.string(), generated: z.boolean() }),
  async run(c) {
    const { controller } = c.var.session;

    if (!controller.isChrome()) {
      return c.error({ code: "CHROME_ONLY", message: "PDF generation is only available with Chrome backend. Use --backend chrome" });
    }

    const resultPath = await controller.printToPDF({
      path: c.args.path,
      landscape: c.options.landscape,
      printBackground: c.options.printBackground,
      scale: c.options.scale,
      paperWidth: c.options.width,
      paperHeight: c.options.height,
    });

    return { path: resultPath, generated: true };
  },
});

cli.command("network.enable", {
  description: "Enable network request interception (Chrome only)",
  options: globalOptions,
  output: z.object({ enabled: z.boolean() }),
  async run(c) {
    const { controller } = c.var.session;

    if (!controller.isChrome()) {
      return c.error({ code: "CHROME_ONLY", message: "Network interception is only available with Chrome backend. Use --backend chrome" });
    }

    await controller.enableNetworkInterception();
    return { enabled: true };
  },
});

// ==================== DEVICE/VIEWPORT COMMANDS ====================

cli.command("device", {
  description: "Emulate a mobile device",
  args: z.object({
    name: z.enum(["iPhone 14", "iPhone 14 Pro Max", "iPad Pro", "Pixel 7", "Galaxy S22"]).describe("Device name to emulate"),
  }),
  options: globalOptions,
  examples: [
    { args: { name: "iPhone 14" }, description: "Emulate iPhone 14" },
    { args: { name: "Pixel 7" }, description: "Emulate Pixel 7" },
    { args: { name: "iPad Pro" }, description: "Emulate iPad Pro" },
  ],
  output: z.object({
    emulated: z.boolean(),
    device: z.string(),
    viewport: z.object({ width: z.number(), height: z.number() }),
  }),
  async run(c) {
    const { controller } = c.var.session;
    await controller.emulateDevice(c.args.name);
    return { emulated: true, device: c.args.name, viewport: { width: 0, height: 0 } };
  },
});

cli.command("viewport", {
  description: "Set the viewport size",
  args: z.object({
    width: z.number().describe("Viewport width in pixels"),
    height: z.number().describe("Viewport height in pixels"),
  }),
  options: globalOptions.extend({
    scale: z.number().optional().describe("Device scale factor (default: 1)"),
  }),
  examples: [
    { args: { width: 1920, height: 1080 }, description: "Full HD viewport" },
    { args: { width: 1366, height: 768 }, description: "Laptop viewport" },
    { args: { width: 375, height: 667 }, description: "Mobile viewport" },
  ],
  output: z.object({
    set: z.boolean(),
    width: z.number(),
    height: z.number(),
    scale: z.number(),
  }),
  async run(c) {
    const { controller } = c.var.session;
    await controller.setViewport(c.args.width, c.args.height, c.options.scale);
    return { set: true, width: c.args.width, height: c.args.height, scale: c.options.scale || 1 };
  },
});

cli.command("devices", {
  description: "List available device presets",
  options: globalOptions,
  output: z.object({ devices: z.array(z.string()) }),
  async run(c) {
    const { controller } = c.var.session;
    const presets = controller.getDevicePresets();
    return { devices: presets };
  },
});

// Multi-command chain execution
cli.command("chain", {
  description: "Execute multiple commands in sequence",
  args: z.object({
    commands: z.string().describe("Commands separated by '&&' (stop on error) or ';' (continue on error). Use 'snapshot -i' not 'snapshot -i'"),
  }),
  options: globalOptions.extend({
    continue: z.boolean().optional().describe("Continue on error (default: false, stops on first error)"),
    keepOpen: z.boolean().optional().describe("Keep browser session open after commands complete"),
  }),
  examples: [
    { args: { commands: "open google.com && snapshot -i" }, description: "Open and snapshot with error stop" },
    { args: { commands: "open example.com; wait 2000; screenshot" }, description: "Chain with delays, continue on error" },
    { args: { commands: "open form.com && fill @e1 'test' && fill @e2 'pass' && click @e3" }, description: "Fill form and submit" },
    { args: { commands: "device 'iPhone 14' && open mobile.twitter.com && screenshot" }, options: { continue: true }, description: "Mobile test with continue on error" },
  ],
  output: z.object({
    executed: z.number().describe("Number of commands executed"),
    succeeded: z.number().describe("Number of successful commands"),
    failed: z.number().describe("Number of failed commands"),
    results: z.array(z.object({
      command: z.string(),
      success: z.boolean(),
      data: z.any().optional(),
      error: z.string().optional(),
      duration: z.number().describe("Execution time in ms"),
    })),
    stopped: z.boolean().describe("Whether execution stopped early due to error"),
  }),
  async run(c) {
    const { controller, snapshot } = c.var.session;
    const commandString = c.args.commands;
    const continueOnError = c.options.continue || false;
    
    // Parse command string
    // Split by "&&" (stop on fail) or ";" (continue on fail)
    // But first, we need to handle quoted strings
    const commands: { cmd: string; stopOnFail: boolean }[] = [];
    
    // Simple parsing: split by && or ;
    const parts = commandString.split(/(\&\&|;)/);
    let currentCmd = "";
    let nextStopOnFail = true; // Default for &&
    
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i].trim();
      
      if (part === "&&") {
        if (currentCmd) {
          commands.push({ cmd: currentCmd.trim(), stopOnFail: true });
          currentCmd = "";
        }
        nextStopOnFail = true;
      } else if (part === ";") {
        if (currentCmd) {
          commands.push({ cmd: currentCmd.trim(), stopOnFail: false });
          currentCmd = "";
        }
        nextStopOnFail = false;
      } else {
        currentCmd += part;
      }
    }
    
    // Add final command
    if (currentCmd.trim()) {
      commands.push({ cmd: currentCmd.trim(), stopOnFail: nextStopOnFail });
    }
    
    // If no && or ; found, treat as single command
    if (commands.length === 0 && commandString.trim()) {
      commands.push({ cmd: commandString.trim(), stopOnFail: true });
    }
    
    // Execute commands
    const results: any[] = [];
    let stopped = false;

    for (const { cmd, stopOnFail } of commands) {
      const startTime = Date.now();

      try {
        // Parse the command with proper quoted string support
        // Handles: find "first button" click, find label "Email Address" fill "test@example.com"
        const args: string[] = [];
        const regex = /[^\s"']+|"([^"]*)"|'([^']*)'/g;
        let match;
        while ((match = regex.exec(cmd)) !== null) {
          // Remove quotes from quoted matches
          const arg = match[1] !== undefined ? match[1] : match[2] !== undefined ? match[2] : match[0];
          args.push(arg);
        }
        const action = args.shift()!;

        // Execute via direct controller methods for common commands
        let result: any;
        let success = false;

        switch (action) {
          case "open":
          case "goto":
            if (args[0]) {
              await controller.navigate(args[0]);
              result = { url: controller.getUrl(), title: controller.getTitle() };
              success = true;
            } else {
              throw new Error("URL required for open");
            }
            break;
            
          case "snapshot":
            const snapResult = await snapshot.takeSnapshot({
              interactive: args.includes("-i") || args.includes("--interactive"),
              compact: args.includes("-c") || args.includes("--compact"),
            });
            success = snapResult.success;
            result = snapResult.data;
            if (!success) throw new Error(snapResult.error);
            break;
            
          case "click":
            if (args[0]) {
              await controller.click(args[0]);
              result = { clicked: true, selector: args[0] };
              success = true;
            } else {
              throw new Error("Selector required for click");
            }
            break;
            
          case "fill":
            if (args[0] && args[1]) {
              await controller.click(args[0]);
              await controller.press("Control+a");
              await controller.type(args[1].replace(/^['"]|['"]$/g, "")); // Remove quotes
              result = { filled: true, selector: args[0], text: args[1] };
              success = true;
            } else {
              throw new Error("Selector and text required for fill");
            }
            break;
            
          case "type":
            if (args[0] && args[1]) {
              await controller.click(args[0]);
              await controller.type(args[1].replace(/^['"]|['"]$/g, ""));
              result = { typed: true, selector: args[0], text: args[1] };
              success = true;
            } else {
              throw new Error("Selector and text required for type");
            }
            break;
            
          case "press":
            if (args[0]) {
              await controller.press(args[0]);
              result = { pressed: true, key: args[0] };
              success = true;
            } else {
              throw new Error("Key required for press");
            }
            break;
            
          case "wait":
            if (args[0]) {
              const ms = parseInt(args[0]);
              if (!isNaN(ms)) {
                await new Promise(r => setTimeout(r, ms));
                result = { waited: ms };
                success = true;
              } else {
                // Wait for selector
                const selector = args[0].replace(/^['"]|['"]$/g, "");
                const start = Date.now();
                while (Date.now() - start < 25000) {
                  const exists = await controller.evaluate(`!!document.querySelector(${JSON.stringify(selector)})`);
                  if (exists) break;
                  await new Promise(r => setTimeout(r, 100));
                }
                result = { waited: args[0] };
                success = true;
              }
            } else {
              throw new Error("Milliseconds or selector required for wait");
            }
            break;
            
          case "screenshot":
            const image = await controller.screenshot({ format: "png" });
            const path = args[0] || `/tmp/prawl-${Date.now()}.png`;
            await Bun.write(path, image);
            result = { screenshot: path };
            success = true;
            break;
            
          case "get":
            if (args[0] === "title") {
              result = { title: controller.getTitle() };
              success = true;
            } else if (args[0] === "url") {
              result = { url: controller.getUrl() };
              success = true;
            } else if (args[0] && args[1]) {
              const selector = args[1].replace(/^['"]|['"]$/g, "");
              const text = await controller.evaluate(`document.querySelector(${JSON.stringify(selector)})?.textContent?.trim() || ""`);
              result = { [args[0]]: text };
              success = true;
            } else {
              throw new Error("Invalid get command");
            }
            break;
            
          case "scroll":
            const dir = args[0] || "down";
            const amount = parseInt(args[1] || "100");
            let dx = 0, dy = 0;
            if (dir === "up") dy = -amount;
            if (dir === "down") dy = amount;
            if (dir === "left") dx = -amount;
            if (dir === "right") dx = amount;
            await controller.scroll(dx, dy);
            result = { scrolled: dir, amount };
            success = true;
            break;
            
          case "back":
            await controller.goBack();
            result = { navigated: "back" };
            success = true;
            break;
            
          case "forward":
            await controller.goForward();
            result = { navigated: "forward" };
            success = true;
            break;

          case "reload":
            await controller.reload();
            result = { reloaded: true };
            success = true;
            break;

          case "device":
            if (args[0]) {
              const deviceName = args[0].replace(/^['"]|['"]$/g, "");
              await controller.emulateDevice(deviceName);
              result = { device: deviceName };
              success = true;
            } else {
              throw new Error("Device name required");
            }
            break;

          case "viewport":
            if (args[0] && args[1]) {
              const w = parseInt(args[0]);
              const h = parseInt(args[1]);
              await controller.setViewport(w, h);
              result = { viewport: { width: w, height: h } };
              success = true;
            } else {
              throw new Error("Width and height required for viewport");
            }
            break;

          case "close":
            await controller.close();
            result = { closed: true };
            success = true;
            break;

          // FIND command - semantic locator support
          case "find": {
            // Parse find command: find [options] <type> <value> [action] [actionValue]
            // Examples:
            //   find role button click
            //   find --name Close role button click
            //   find label Email fill test@example.com
            //   find --exact text Submit click
            //   find "first button" click (natural language)

            let findArgs = [...args];
            let findOptions: Record<string, any> = {};

            // Parse options (--name, --exact, --index)
            while (findArgs.length > 0 && findArgs[0].startsWith("--")) {
              const opt = findArgs.shift()!;
              if (opt === "--name" || opt === "-n") {
                findOptions.name = findArgs.shift();
              } else if (opt === "--exact" || opt === "-e") {
                findOptions.exact = true;
              } else if (opt === "--index") {
                findOptions.index = parseInt(findArgs.shift() || "1");
              }
            }

            // Check if first arg is a quoted natural language pattern
            let type = findArgs[0];
            let value = findArgs[1];
            let action = "click";
            let actionValue = "";

            // Handle quoted natural language: find "first button" click
            if (type && (type.startsWith('"') || type.startsWith("'"))) {
              // Combine quoted parts
              const quoteChar = type[0];
              let combined = type;
              let quoteIdx = 1;
              while (quoteIdx < findArgs.length && !findArgs[quoteIdx].endsWith(quoteChar)) {
                combined += " " + findArgs[quoteIdx];
                quoteIdx++;
              }
              if (quoteIdx < findArgs.length) {
                combined += " " + findArgs[quoteIdx];
              }
              // Remove quotes
              value = combined.slice(1, -1);
              type = "text"; // Natural language defaults to text type
              action = findArgs[quoteIdx + 1] || "click";
              actionValue = findArgs.slice(quoteIdx + 2).join(" ").replace(/^['"]|['"]$/g, "");
            } else {
              // Standard syntax: find <type> <value> [action] [actionValue]
              if (!type || !value) {
                throw new Error("Find requires type and value (e.g., 'find role button click')");
              }

              // Check if value is quoted
              if (value.startsWith('"') || value.startsWith("'")) {
                const quoteChar = value[0];
                let combined = value;
                let quoteIdx = 2;
                while (quoteIdx < findArgs.length && !findArgs[quoteIdx].endsWith(quoteChar)) {
                  combined += " " + findArgs[quoteIdx];
                  quoteIdx++;
                }
                if (quoteIdx < findArgs.length) {
                  combined += " " + findArgs[quoteIdx];
                }
                value = combined.slice(1, -1);
                action = findArgs[quoteIdx] || "click";
                actionValue = findArgs.slice(quoteIdx + 1).join(" ").replace(/^['"]|['"]$/g, "");
              } else {
                action = findArgs[2] || "click";
                actionValue = findArgs.slice(3).join(" ").replace(/^['"]|['"]$/g, "");
              }
            }

            // Now execute the find logic (simplified version of the find command)
            let selector: string | null = null;
            let matchedElement: { tag: string; text?: string; accessibleName?: string } | null = null;

            // Natural language parsing
            if (type === "text") {
              const naturalPatterns = [
                { pattern: /^(first|second|third|fourth|fifth|last|1st|2nd|3rd|4th|5th)\s+(.+)$/i, handler: (m: RegExpMatchArray) => {
                  const pos = m[1].toLowerCase();
                  const el = m[2].trim();
                  const map: Record<string, { type: string; index?: number }> = {
                    first: { type: "first" }, second: { type: "nth", index: 2 },
                    third: { type: "nth", index: 3 }, fourth: { type: "nth", index: 4 },
                    fifth: { type: "nth", index: 5 }, last: { type: "last" },
                    "1st": { type: "first" }, "2nd": { type: "nth", index: 2 },
                    "3rd": { type: "nth", index: 3 }, "4th": { type: "nth", index: 4 },
                    "5th": { type: "nth", index: 5 },
                  };
                  const mapped = map[pos];
                  return mapped ? { type: mapped.type, value: el, index: mapped.index } : null;
                }},
                { pattern: /^(button|link|input|checkbox|radio|heading|img|image)\s+(?:named|with\s+name|with\s+text|labelled)\s+(.+)$/i, handler: (m: RegExpMatchArray) => {
                  const role = m[1].toLowerCase();
                  const nm = m[2].trim();
                  return { type: "role", value: role === "img" || role === "image" ? "img" : role, name: nm };
                }},
                { pattern: /^(label|placeholder|alt|title|testid)\s+(.+)$/i, handler: (m: RegExpMatchArray) => {
                  return { type: m[1].toLowerCase(), value: m[2].trim() };
                }},
              ];

              for (const { pattern, handler } of naturalPatterns) {
                const match = value.match(pattern);
                if (match) {
                  const r = handler(match);
                  if (r) {
                    type = r.type;
                    value = r.value;
                    if (r.index) findOptions.index = r.index;
                    if (r.name) findOptions.name = r.name;
                    break;
                  }
                }
              }
            }

            // Execute find based on type
            switch (type) {
              case "role": {
                const els = await controller.evaluate<Array<{ selector: string; tag: string; accessibleName: string }>>(`
                  Array.from(document.querySelectorAll('[role="${value}"], ${value}')).map(el => ({
                    selector: el.id ? '#'+el.id : (el.className && typeof el.className === 'string' && el.className.trim())
                      ? el.tagName.toLowerCase() + '.' + el.className.trim().split(/\\s+/)[0]
                      : el.tagName.toLowerCase(),
                    tag: el.tagName.toLowerCase(),
                    accessibleName: el.getAttribute('aria-label') || el.textContent?.trim() || el.getAttribute('title') || ''
                  })).filter(el => ${findOptions.name ? `el.accessibleName.toLowerCase().includes("${findOptions.name.toLowerCase()}")` : "true"})
                `);
                if (els.length > 0) {
                  selector = els[0].selector;
                  matchedElement = { tag: els[0].tag, accessibleName: els[0].accessibleName };
                }
                break;
              }

              case "label": {
                const labels = await controller.evaluate<Array<{ selector: string; tag: string; text: string }>>(`
                  const results = [];
                  for (const label of document.querySelectorAll('label')) {
                    const text = label.textContent?.trim() || '';
                    if (${findOptions.exact ? `text === "${value}"` : `text.toLowerCase().includes("${value.toLowerCase()}")`}) {
                      const forId = label.getAttribute('for');
                      let input = forId ? document.getElementById(forId) : label.querySelector('input, textarea, select');
                      if (input) {
                        results.push({
                          selector: input.id ? '#'+input.id : (input.className && typeof input.className === 'string' && input.className.trim())
                            ? input.tagName.toLowerCase() + '.' + input.className.trim().split(/\\s+/)[0]
                            : input.tagName.toLowerCase(),
                          tag: input.tagName.toLowerCase(),
                          text: text
                        });
                      }
                    }
                  }
                  results;
                `);
                if (labels.length > 0) {
                  selector = labels[0].selector;
                  matchedElement = labels[0];
                }
                break;
              }

              case "placeholder": {
                const ph = await controller.evaluate<Array<{ selector: string; tag: string; text: string }>>(`
                  Array.from(document.querySelectorAll('input[placeholder], textarea[placeholder]')).filter(el => {
                    const ph = el.getAttribute('placeholder') || '';
                    return ${findOptions.exact ? `ph === "${value}"` : `ph.toLowerCase().includes("${value.toLowerCase()}")`};
                  }).map(el => ({
                    selector: el.id ? '#'+el.id : (el.className && typeof el.className === 'string' && el.className.trim())
                      ? el.tagName.toLowerCase() + '.' + el.className.trim().split(/\\s+/)[0]
                      : el.tagName.toLowerCase() + '[placeholder*="${value}"]',
                    tag: el.tagName.toLowerCase(),
                    text: el.getAttribute('placeholder') || ''
                  }));
                `);
                if (ph.length > 0) {
                  selector = ph[0].selector;
                  matchedElement = ph[0];
                }
                break;
              }

              case "alt": {
                const alts = await controller.evaluate<Array<{ selector: string; tag: string; text: string }>>(`
                  Array.from(document.querySelectorAll('img[alt], area[alt], [role="img"][aria-label]')).filter(el => {
                    const alt = el.getAttribute('alt') || el.getAttribute('aria-label') || '';
                    return ${findOptions.exact ? `alt === "${value}"` : `alt.toLowerCase().includes("${value.toLowerCase()}")`};
                  }).map(el => ({
                    selector: el.id ? '#'+el.id : (el.className && typeof el.className === 'string' && el.className.trim())
                      ? el.tagName.toLowerCase() + '.' + el.className.trim().split(/\\s+/)[0]
                      : el.tagName.toLowerCase(),
                    tag: el.tagName.toLowerCase(),
                    text: el.getAttribute('alt') || el.getAttribute('aria-label') || ''
                  }));
                `);
                if (alts.length > 0) {
                  selector = alts[0].selector;
                  matchedElement = alts[0];
                }
                break;
              }

              case "title": {
                const titles = await controller.evaluate<Array<{ selector: string; tag: string; text: string }>>(`
                  Array.from(document.querySelectorAll('[title]')).filter(el => {
                    const title = el.getAttribute('title') || '';
                    return ${findOptions.exact ? `title === "${value}"` : `title.toLowerCase().includes("${value.toLowerCase()}")`};
                  }).map(el => ({
                    selector: el.id ? '#'+el.id : (el.className && typeof el.className === 'string' && el.className.trim())
                      ? el.tagName.toLowerCase() + '.' + el.className.trim().split(/\\s+/)[0]
                      : el.tagName.toLowerCase() + '[title*="${value}"]',
                    tag: el.tagName.toLowerCase(),
                    text: el.getAttribute('title') || ''
                  }));
                `);
                if (titles.length > 0) {
                  selector = titles[0].selector;
                  matchedElement = titles[0];
                }
                break;
              }

              case "testid": {
                selector = `[data-testid="${value}"]`;
                const exists = await controller.evaluate<boolean>(`!!document.querySelector('[data-testid="${value}"]')`);
                if (exists) {
                  const tag = await controller.evaluate<string>(`document.querySelector('[data-testid="${value}"]')?.tagName.toLowerCase() || 'unknown'`);
                  matchedElement = { tag };
                } else {
                  selector = null;
                }
                break;
              }

              case "first":
              case "last":
              case "nth": {
                const idx = type === "first" ? 0 : type === "last" ? -1 : ((findOptions.index || 1) - 1);
                const posResult = await controller.evaluate<{ selector: string; tag: string; index: number } | null>(`
                  const elements = document.querySelectorAll('${value}');
                  const el = ${idx === -1 ? 'elements[elements.length - 1]' : `elements[${idx}]`};
                  if (!el) return null;
                  return {
                    selector: el.id ? '#'+el.id : (el.className && typeof el.className === 'string' && el.className.trim())
                      ? el.tagName.toLowerCase() + '.' + el.className.trim().split(/\\s+/)[0]
                      : '${value}',
                    tag: el.tagName.toLowerCase(),
                    index: ${idx === -1 ? 'elements.length - 1' : idx}
                  };
                `);
                if (posResult) {
                  selector = posResult.selector;
                  matchedElement = { tag: posResult.tag };
                }
                break;
              }

              default: {
                // Text-based search
                const textResults = await controller.evaluate<Array<{ selector: string; tag: string; text: string }>>(`
                  Array.from(document.querySelectorAll('button, a, input, textarea, select, label, [role="button"], [role="link"]')).filter(el => {
                    const textContent = el.textContent?.trim() || '';
                    const ariaLabel = el.getAttribute('aria-label') || '';
                    const title = el.title || '';
                    const haystack = ${findOptions.exact ? 'textContent' : '(textContent + " " + ariaLabel + " " + title).toLowerCase()'};
                    const needle = ${JSON.stringify(findOptions.exact ? value : value.toLowerCase())};
                    return ${findOptions.exact ? 'haystack === needle' : 'haystack.includes(needle)'};
                  }).map(el => ({
                    selector: el.id ? '#'+el.id : (el.className && typeof el.className === 'string' && el.className.trim())
                      ? el.tagName.toLowerCase() + '.' + el.className.trim().split(/\\s+/)[0]
                      : el.tagName.toLowerCase(),
                    tag: el.tagName.toLowerCase(),
                    text: el.textContent?.trim() || ''
                  }));
                `);
                if (textResults.length > 0) {
                  selector = textResults[0].selector;
                  matchedElement = textResults[0];
                }
              }
            }

            if (!selector) {
              throw new Error(`No element found with ${type}="${value}"${findOptions.name ? ` and name="${findOptions.name}"` : ''}`);
            }

            // Perform action
            switch (action) {
              case "click":
                await controller.click(selector);
                break;
              case "fill":
                await controller.click(selector);
                await controller.press("Control+a");
                await controller.type(actionValue || "");
                break;
              case "type":
                await controller.click(selector);
                await controller.type(actionValue || "");
                break;
              case "check": {
                const wasChecked = await controller.evaluate<boolean>(`
                  const el = document.querySelector("${selector.replace(/"/g, '\\"')}");
                  if (!el) return false;
                  if (!el.checked) { el.click(); return true; }
                  return false;
                `);
                result = { found: true, selector, action: "check", wasChecked, element: matchedElement };
                success = true;
                break;
              }
              case "uncheck": {
                const wasUnchecked = await controller.evaluate<boolean>(`
                  const el = document.querySelector("${selector.replace(/"/g, '\\"')}");
                  if (!el) return false;
                  if (el.checked) { el.click(); return true; }
                  return false;
                `);
                result = { found: true, selector, action: "uncheck", wasUnchecked, element: matchedElement };
                success = true;
                break;
              }
              case "text": {
                const text = await controller.evaluate<string>(`document.querySelector("${selector.replace(/"/g, '\\"')}")?.textContent?.trim() || ""`);
                result = { found: true, selector, action: "text", text, element: matchedElement };
                success = true;
                break;
              }
              default:
                await controller.click(selector);
            }

            if (!result) {
              result = { found: true, selector, action, element: matchedElement };
            }
            success = true;
            break;
          }

          default:
            throw new Error(`Unknown command: ${action}`);
        }

        results.push({
          command: cmd,
          success,
          data: result,
          duration: Date.now() - startTime,
        });

      } catch (error) {
        results.push({
          command: cmd,
          success: false,
          error: error instanceof Error ? error.message : String(error),
          duration: Date.now() - startTime,
        });
        
        if (stopOnFail && !continueOnError) {
          stopped = true;
          break;
        }
      }
    }
    
    const succeeded = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;
    
    // Auto-close session unless --keep-open flag is set
    const keepOpen = c.options.keepOpen as boolean || false;
    if (!keepOpen) {
      await controller.close();
      sessions.delete(c.options.session as string || "default");
    }
    
    return {
      executed: results.length,
      succeeded,
      failed,
      results,
      stopped,
    };
  },
});

// Alias: run = chain
cli.command("run", {
  description: "Alias for chain - Execute multiple commands in sequence",
  args: z.object({
    commands: z.string().describe("Commands separated by '&&' (stop on error) or ';' (continue on error)"),
  }),
  options: globalOptions.extend({
    continue: z.boolean().optional().describe("Continue on error"),
    keepOpen: z.boolean().optional().describe("Keep browser session open after commands complete"),
  }),
  output: z.object({
    executed: z.number(),
    succeeded: z.number(),
    failed: z.number(),
    results: z.array(z.any()),
    stopped: z.boolean(),
  }),
  async run(c) {
    // Delegate to chain command
    const chainResult = await cli._commands.get("chain")?.run(c);
    return chainResult || { executed: 0, succeeded: 0, failed: 0, results: [], stopped: true };
  },
});

// Parallel command execution
cli.command("parallel", {
  description: "Execute multiple commands in parallel",
  args: z.object({
    commands: z.string().describe("Commands separated by '|' (pipe character)"),
  }),
  options: globalOptions.extend({
    max: z.number().default(5).describe("Max concurrent executions"),
    timeout: z.number().default(60000).describe("Timeout per command in ms"),
    keepOpen: z.boolean().optional().describe("Keep browser session open after commands complete"),
  }),
  examples: [
    { args: { commands: "open google.com | open example.com | open github.com" }, description: "Open 3 sites in parallel" },
    { args: { commands: "screenshot /tmp/a.png | screenshot /tmp/b.png" }, options: { max: 2 }, description: "2 parallel screenshots" },
    { args: { commands: "get title | get url | snapshot -i" }, description: "Get multiple data points at once" },
  ],
  output: z.object({
    executed: z.number().describe("Number of commands executed"),
    succeeded: z.number().describe("Number of successful commands"),
    failed: z.number().describe("Number of failed commands"),
    duration: z.number().describe("Total execution time in ms"),
    results: z.array(z.object({
      command: z.string(),
      success: z.boolean(),
      data: z.any().optional(),
      error: z.string().optional(),
      duration: z.number().describe("Execution time in ms"),
    })),
  }),
  async run(c) {
    const { controller, snapshot } = c.var.session;
    const commandString = c.args.commands;
    const maxConcurrent = c.options.max || 5;
    const timeout = c.options.timeout || 60000;
    
    // Parse commands (split by |)
    const commands = commandString.split("|").map(cmd => cmd.trim()).filter(Boolean);
    
    if (commands.length === 0) {
      return { executed: 0, succeeded: 0, failed: 0, duration: 0, results: [] };
    }
    
    const totalStartTime = Date.now();
    
    // Execute commands with concurrency limit
    const executeCommand = async (cmd: string, index: number): Promise<any> => {
      const startTime = Date.now();
      
      try {
        // Parse the command
        const cmdParts = cmd.split(/\s+/);
        const action = cmdParts[0];
        const args = cmdParts.slice(1);
        
        let result: any;
        let success = false;
        
        // Same command implementations as chain
        switch (action) {
          case "open":
          case "goto":
            if (args[0]) {
              await controller.navigate(args[0]);
              result = { url: controller.getUrl(), title: controller.getTitle() };
              success = true;
            } else {
              throw new Error("URL required for open");
            }
            break;
            
          case "snapshot":
            const snapResult = await snapshot.takeSnapshot({
              interactive: args.includes("-i") || args.includes("--interactive"),
              compact: args.includes("-c") || args.includes("--compact"),
            });
            success = snapResult.success;
            result = snapResult.data;
            if (!success) throw new Error(snapResult.error);
            break;
            
          case "click":
            if (args[0]) {
              await controller.click(args[0]);
              result = { clicked: true, selector: args[0] };
              success = true;
            } else {
              throw new Error("Selector required for click");
            }
            break;
            
          case "fill":
            if (args[0] && args[1]) {
              await controller.click(args[0]);
              await controller.press("Control+a");
              await controller.type(args[1].replace(/^['"]|['"]$/g, ""));
              result = { filled: true, selector: args[0], text: args[1] };
              success = true;
            } else {
              throw new Error("Selector and text required for fill");
            }
            break;
            
          case "type":
            if (args[0] && args[1]) {
              await controller.click(args[0]);
              await controller.type(args[1].replace(/^['"]|['"]$/g, ""));
              result = { typed: true, selector: args[0], text: args[1] };
              success = true;
            } else {
              throw new Error("Selector and text required for type");
            }
            break;
            
          case "press":
            if (args[0]) {
              await controller.press(args[0]);
              result = { pressed: true, key: args[0] };
              success = true;
            } else {
              throw new Error("Key required for press");
            }
            break;
            
          case "wait":
            if (args[0]) {
              const ms = parseInt(args[0]);
              if (!isNaN(ms)) {
                await new Promise(r => setTimeout(r, ms));
                result = { waited: ms };
                success = true;
              }
            } else {
              throw new Error("Milliseconds required for wait");
            }
            break;
            
          case "screenshot":
            const image = await controller.screenshot({ format: "png" });
            const path = args[0] || `/tmp/prawl-${Date.now()}-${index}.png`;
            await Bun.write(path, image);
            result = { screenshot: path };
            success = true;
            break;
            
          case "get":
            if (args[0] === "title") {
              result = { title: controller.getTitle() };
              success = true;
            } else if (args[0] === "url") {
              result = { url: controller.getUrl() };
              success = true;
            } else {
              throw new Error("Invalid get command");
            }
            break;
            
          case "eval":
            const script = args.join(" ");
            const evalResult = await controller.evaluate(script);
            result = { result: evalResult };
            success = true;
            break;
            
          case "scroll":
            const dir = args[0] || "down";
            const amount = parseInt(args[1] || "100");
            let dx = 0, dy = 0;
            if (dir === "up") dy = -amount;
            if (dir === "down") dy = amount;
            if (dir === "left") dx = -amount;
            if (dir === "right") dx = amount;
            await controller.scroll(dx, dy);
            result = { scrolled: dir, amount };
            success = true;
            break;
            
          case "back":
            await controller.goBack();
            result = { navigated: "back" };
            success = true;
            break;
            
          case "forward":
            await controller.goForward();
            result = { navigated: "forward" };
            success = true;
            break;
            
          case "reload":
            await controller.reload();
            result = { reloaded: true };
            success = true;
            break;
            
          case "device":
            if (args[0]) {
              const deviceName = args[0].replace(/^['"]|['"]$/g, "");
              await controller.emulateDevice(deviceName);
              result = { device: deviceName };
              success = true;
            } else {
              throw new Error("Device name required");
            }
            break;
            
          case "viewport":
            if (args[0] && args[1]) {
              const w = parseInt(args[0]);
              const h = parseInt(args[1]);
              await controller.setViewport(w, h);
              result = { viewport: { width: w, height: h } };
              success = true;
            } else {
              throw new Error("Width and height required for viewport");
            }
            break;
            
          case "close":
            await controller.close();
            result = { closed: true };
            success = true;
            break;
            
          default:
            throw new Error(`Unknown command: ${action}`);
        }
        
        return {
          command: cmd,
          success,
          data: result,
          duration: Date.now() - startTime,
        };
        
      } catch (error) {
        return {
          command: cmd,
          success: false,
          error: error instanceof Error ? error.message : String(error),
          duration: Date.now() - startTime,
        };
      }
    };
    
    // Execute with concurrency limit
    const results: any[] = [];
    const executing: Promise<void>[] = [];
    
    for (let i = 0; i < commands.length; i++) {
      const promise = executeCommand(commands[i], i).then(result => {
        results[i] = result;
      });
      
      executing.push(promise);
      
      // If we've reached max concurrent, wait for one to complete
      if (executing.length >= maxConcurrent) {
        await Promise.race(executing);
        // Remove completed promises
        const index = executing.findIndex(p => p === promise);
        if (index > -1) executing.splice(index, 1);
      }
    }
    
    // Wait for all remaining
    await Promise.all(executing);
    
    const succeeded = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;
    
    // Auto-close session unless --keep-open flag is set
    const keepOpen = c.options.keepOpen as boolean || false;
    if (!keepOpen) {
      await controller.close();
      sessions.delete(c.options.session as string || "default");
    }
    
    return {
      executed: commands.length,
      succeeded,
      failed,
      duration: Date.now() - totalStartTime,
      results,
    };
  },
});

// AI Chat command
cli.command("chat", {
  description: "Natural language browser control via AI (OpenAI-compatible)",
  args: z.object({
    instruction: z.string().optional().describe("Natural language instruction (omit for interactive mode)"),
  }),
  options: globalOptions.extend({
    model: z.string().default("gpt-4o-mini").describe("AI model (gpt-4o, gpt-4o-mini, claude-3-5-sonnet, etc.)"),
    apiKey: z.string().optional().describe("API key (or use OPENAI_API_KEY env var)"),
    baseUrl: z.string().optional().describe("API base URL (default: https://api.openai.com/v1, or use OPENAI_BASE_URL env)"),
    interactive: z.boolean().optional().describe("Interactive chat mode (REPL)"),
  }),
  alias: { apiKey: "key", baseUrl: "url" },
  examples: [
    { args: { instruction: "search for cats" }, description: "Single instruction with default model" },
    { args: { instruction: "go to github" }, options: { model: "gpt-4o" }, description: "Use specific model" },
    { args: { instruction: "take screenshot" }, options: { baseUrl: "http://localhost:11434/v1", model: "llama2" }, description: "Use local Ollama" },
    { args: { instruction: "analyze page" }, options: { apiKey: "sk-xxx", model: "claude-3-5-sonnet-20241022" }, description: "Use Claude via proxy" },
  ],
  output: z.object({
    commands: z.array(z.string()),
    results: z.array(z.any()),
  }),
  async run(c) {
    const { controller } = c.var.session;
    const apiKey = c.options.apiKey || process.env.OPENAI_API_KEY;
    const baseUrl = c.options.baseUrl || process.env.OPENAI_BASE_URL || "https://api.openai.com/v1";
    
    if (!apiKey) {
      return c.error({ code: "NO_API_KEY", message: "Set OPENAI_API_KEY environment variable or use --api-key flag" });
    }
    
    const instruction = c.args.instruction;
    if (!instruction && !c.options.interactive) {
      return c.error({ code: "NO_INSTRUCTION", message: "Provide an instruction or use --interactive for REPL mode" });
    }
    
    // Take snapshot for context
    const snapResult = await controller.evaluate<{ tree: any }>(`
      (function() {
        const interactive = [];
        const elements = document.querySelectorAll('button, a, input, select, textarea');
        elements.forEach((el, i) => {
          const text = el.textContent?.trim() || el.placeholder || el.value || '';
          interactive.push({
            ref: 'e' + (i + 1),
            tag: el.tagName.toLowerCase(),
            type: el.type,
            text: text.substring(0, 50),
            id: el.id,
            class: el.className
          });
        });
        return { tree: interactive, title: document.title, url: location.href };
      })()
    `);
    
    // Build prompt
    const systemPrompt = `You are a browser automation assistant. The user is on a webpage with these interactive elements:
${JSON.stringify(snapResult.tree, null, 2)}

Convert natural language instructions into prawl CLI commands. Available commands:
- open <url>
- click @eN (use refs from above)
- fill @eN <text>
- type @eN <text>
- press <key>
- screenshot
- get title/url
- snapshot

Respond with ONLY a JSON array of commands, like: ["open google.com", "click @e3"]`;

    // Call OpenAI API
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: c.options.model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: instruction || "What can I do on this page?" }
        ],
        temperature: 0.3,
      }),
    });
    
    if (!response.ok) {
      const error = await response.text();
      return c.error({ code: "AI_ERROR", message: `OpenAI API error: ${error}` });
    }
    
    const aiResponse = await response.json();
    const content = aiResponse.choices?.[0]?.message?.content || "[]";
    
    // Extract JSON commands
    let commands: string[] = [];
    try {
      const jsonMatch = content.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        commands = JSON.parse(jsonMatch[0]);
      }
    } catch {
      // If no JSON found, treat each line as a command
      commands = content.split('\n').filter(l => l.trim().startsWith('prawl')).map(l => l.replace('prawl ', '').trim());
    }
    
    // Execute commands
    const results = [];
    for (const cmd of commands) {
      try {
        // Parse and execute via chain
        const parts = cmd.split(' ');
        const action = parts[0];
        const args = parts.slice(1);
        
        // Simple execution
        let result: any;
        switch (action) {
          case "open":
            await controller.navigate(args[0]);
            result = { url: controller.getUrl() };
            break;
          case "click":
            await controller.click(args[0]);
            result = { clicked: args[0] };
            break;
          case "fill":
            await controller.click(args[0]);
            await controller.press("Control+a");
            await controller.type(args.slice(1).join(" "));
            result = { filled: args[0] };
            break;
          case "screenshot":
            const img = await controller.screenshot();
            result = { screenshot: "taken" };
            break;
          case "snapshot":
          case "get":
            result = { data: await controller.evaluate("document.title") };
            break;
          default:
            result = { skipped: action };
        }
        results.push({ command: cmd, result });
      } catch (err) {
        results.push({ command: cmd, error: String(err) });
      }
    }
    
    return { commands, results };
  },
});

// Alias: p = parallel
cli.command("p", {
  description: "Alias for parallel - Execute multiple commands in parallel",
  args: z.object({
    commands: z.string().describe("Commands separated by '|'"),
  }),
  options: globalOptions.extend({
    max: z.number().default(5).describe("Max concurrent"),
    timeout: z.number().default(60000).describe("Timeout per command"),
    keepOpen: z.boolean().optional().describe("Keep browser session open after commands complete"),
  }),
  output: z.object({
    executed: z.number(),
    succeeded: z.number(),
    failed: z.number(),
    duration: z.number(),
    results: z.array(z.any()),
  }),
  async run(c) {
    // Delegate to parallel command
    return cli._commands.get("parallel")?.run(c) || { executed: 0, succeeded: 0, failed: 0, duration: 0, results: [] };
  },
});

// Middleware to exit after command completes
cli.use(async (c, next) => {
  await next();
  setTimeout(() => process.exit(0), 100);
});

// Config commands
cli.command("config", {
  description: "Show current configuration",
  options: globalOptions,
  output: z.object({ config: z.record(z.string()) }),
  async run(c) {
    const userConfig: Record<string, string> = {};
    
    // Load user config from ~/.config/prawl.json
    try {
      const home = process.env.HOME || process.env.USERPROFILE;
      if (home) {
        const userConfigPath = `${home}/.config/prawl.json`;
        const file = Bun.file(userConfigPath);
        if (file.size > 0) {
          const content = await file.json();
          Object.entries(content).forEach(([k, v]) => {
            if (typeof v === "string") userConfig[k] = v;
          });
        }
      }
    } catch {
      // Config file doesn't exist
    }
    
    // Also show current env vars that affect prawl
    const envVars: Record<string, string | undefined> = {
      PRAWL_SESSION: process.env.PRAWL_SESSION,
      PRAWL_BACKEND: process.env.PRAWL_BACKEND,
      PRAWL_HEADED: process.env.PRAWL_HEADED,
      OPENAI_API_KEY: process.env.OPENAI_API_KEY ? "***" : undefined,
      OPENAI_BASE_URL: process.env.OPENAI_BASE_URL,
      PRAWL_MODEL: process.env.PRAWL_MODEL,
    };
    
    return { 
      config: { 
        ...userConfig,
        ...Object.fromEntries(Object.entries(envVars).filter(([_, v]) => v !== undefined))
      } 
    };
  },
});

cli.command("config.get", {
  description: "Get a specific configuration value",
  args: z.object({
    key: z.string().describe("Configuration key to retrieve"),
  }),
  options: globalOptions,
  output: z.object({ key: z.string(), value: z.any() }),
  async run(c) {
    const key = c.args.key;
    
    // Try to load from user config
    try {
      const home = process.env.HOME || process.env.USERPROFILE;
      if (home) {
        const userConfigPath = `${home}/.config/prawl.json`;
        const file = Bun.file(userConfigPath);
        if (file.size > 0) {
          const content = await file.json();
          if (content[key] !== undefined) {
            return { key, value: content[key] };
          }
        }
      }
    } catch {}
    
    // Check env vars
    const envMap: Record<string, string | undefined> = {
      session: process.env.PRAWL_SESSION,
      backend: process.env.PRAWL_BACKEND,
      headed: process.env.PRAWL_HEADED,
      apiKey: process.env.OPENAI_API_KEY ? "***" : undefined,
      baseUrl: process.env.OPENAI_BASE_URL,
      model: process.env.PRAWL_MODEL,
    };
    
    if (envMap[key] !== undefined) {
      return { key, value: envMap[key] };
    }
    
    return { key, value: null };
  },
});

// Explicitly run the CLI - this handles command execution AND starts the HTTP server
cli.serve();

// Export the fetch handler for HTTP API access, but don't trigger Bun's auto-serve
// We do this by NOT exporting cli directly (which has a fetch method that triggers auto-detection)
export const fetch = cli.fetch;
