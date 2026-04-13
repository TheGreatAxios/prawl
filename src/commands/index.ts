// Command implementations registry

import type { Command, CommandResult, CommandAction, WebViewOptions } from "../types";
import { WebViewController, SnapshotEngine } from "../core";
import { navigate, close } from "./navigate";
import { click, fill, type as typeCommand, press, hover, scroll, scrollTo } from "./interact";
import { snapshot } from "./snapshot-cmd";
import { get, is } from "./query";
import { wait } from "./wait";
import { screenshot } from "./screenshot";
import { goBack, goForward, reload } from "./navigation";
import { batch } from "./batch";

// Command handler function type
type CommandHandler = (
  controller: WebViewController,
  snapshotEngine: SnapshotEngine,
  args: unknown[],
  options: Record<string, unknown>
) => Promise<CommandResult>;

// Command registry
const commandRegistry: Record<CommandAction, CommandHandler> = {
  open: async (controller, _engine, args) => {
    const url = args[0] as string;
    if (!url) {
      return { success: false, error: "URL required" };
    }
    return navigate(controller, url);
  },

  close: async (controller) => close(controller),

  click: async (controller, _engine, args, options) => {
    const selector = args[0] as string;
    if (!selector) {
      return { success: false, error: "Selector required" };
    }
    return click(controller, selector, options);
  },

  dblclick: async (controller, _engine, args, options) => {
    const selector = args[0] as string;
    if (!selector) {
      return { success: false, error: "Selector required" };
    }
    // Double click = 2 rapid clicks
    await click(controller, selector, options);
    await new Promise(r => setTimeout(r, 50));
    return click(controller, selector, options);
  },

  fill: async (controller, _engine, args, options) => {
    const selector = args[0] as string;
    const text = args[1] as string;
    if (!selector || text === undefined) {
      return { success: false, error: "Selector and text required" };
    }
    return fill(controller, selector, text, options);
  },

  type: async (controller, _engine, args, options) => {
    const selector = args[0] as string;
    const text = args[1] as string;
    if (!selector || text === undefined) {
      return { success: false, error: "Selector and text required" };
    }
    return typeCommand(controller, selector, text, options);
  },

  press: async (controller, _engine, args, options) => {
    const key = args[0] as string;
    if (!key) {
      return { success: false, error: "Key required" };
    }
    return press(controller, key, options);
  },

  keyboard: async (controller, _engine, args) => {
    const subcommand = args[0] as string;
    const text = args[1] as string;
    
    if (subcommand === "type" && text) {
      await controller.type(text);
      return { success: true, data: "Typed" };
    }
    
    if (subcommand === "inserttext" && text) {
      await controller.evaluate(`
        document.execCommand("insertText", false, ${JSON.stringify(text)})
      `);
      return { success: true, data: "Inserted" };
    }
    
    return { success: false, error: "Unknown keyboard command" };
  },

  hover: async (controller, _engine, args, options) => {
    const selector = args[0] as string;
    if (!selector) {
      return { success: false, error: "Selector required" };
    }
    return hover(controller, selector, options);
  },

  scroll: async (controller, _engine, args, options) => {
    const direction = args[0] as string;
    const amount = (args[1] as number) || 100;
    return scroll(controller, direction, amount, options);
  },

  scrollTo: async (controller, _engine, args) => {
    const selector = args[0] as string;
    if (!selector) {
      return { success: false, error: "Selector required" };
    }
    return scrollTo(controller, selector);
  },

  select: async (controller, _engine, args) => {
    const selector = args[0] as string;
    const value = args[1] as string;
    if (!selector || value === undefined) {
      return { success: false, error: "Selector and value required" };
    }
    
    await controller.evaluate(`
      const el = document.querySelector(${JSON.stringify(selector)});
      if (el) el.value = ${JSON.stringify(value)};
    `);
    return { success: true, data: `Selected ${value}` };
  },

  check: async (controller, _engine, args) => {
    const selector = args[0] as string;
    if (!selector) {
      return { success: false, error: "Selector required" };
    }
    
    await controller.evaluate(`
      const el = document.querySelector(${JSON.stringify(selector)});
      if (el && el.type === "checkbox") el.checked = true;
    `);
    return { success: true, data: "Checked" };
  },

  uncheck: async (controller, _engine, args) => {
    const selector = args[0] as string;
    if (!selector) {
      return { success: false, error: "Selector required" };
    }
    
    await controller.evaluate(`
      const el = document.querySelector(${JSON.stringify(selector)});
      if (el && el.type === "checkbox") el.checked = false;
    `);
    return { success: true, data: "Unchecked" };
  },

  snapshot: async (_controller, engine, _args, options) => {
    return snapshot(engine, options);
  },

  screenshot: async (controller, _engine, args, options) => {
    const path = args[0] as string | undefined;
    return screenshot(controller, path, options);
  },

  evaluate: async (controller, _engine, args) => {
    const script = args[0] as string;
    if (!script) {
      return { success: false, error: "JavaScript code required" };
    }
    
    try {
      const result = await controller.evaluate(script);
      return { success: true, data: result };
    } catch (error) {
      return { 
        success: false, 
        error: `Evaluation failed: ${error instanceof Error ? error.message : String(error)}` 
      };
    }
  },

  wait: async (controller, _engine, args, options) => {
    const arg = args[0];
    if (typeof arg === "number") {
      // Wait for time
      await new Promise(resolve => setTimeout(resolve, arg));
      return { success: true, data: `Waited ${arg}ms` };
    }
    if (typeof arg === "string") {
      // Wait for selector
      return wait(controller, arg, options);
    }
    return { success: false, error: "Invalid wait argument" };
  },

  get: async (controller, _engine, args) => {
    const type = args[0] as string;
    const selector = args[1] as string | undefined;
    
    if (!type) {
      return { success: false, error: "Get type required" };
    }
    
    return get(controller, type, selector, args.slice(2));
  },

  is: async (controller, _engine, args) => {
    const type = args[0] as string;
    const selector = args[1] as string;
    
    if (!type || !selector) {
      return { success: false, error: "Type and selector required" };
    }
    
    return is(controller, type, selector);
  },

  goBack: async (controller) => goBack(controller),
  goForward: async (controller) => goForward(controller),
  reload: async (controller) => reload(controller),

  cookies: async (controller, _engine, args) => {
    const action = args[0] as string | undefined;
    
    if (!action || action === "get") {
      const cookies = await controller.evaluate<string>("document.cookie");
      return { success: true, data: cookies };
    }
    
    if (action === "set") {
      const name = args[1] as string;
      const value = args[2] as string;
      if (!name) {
        return { success: false, error: "Cookie name required" };
      }
      
      await controller.evaluate(`
        document.cookie = ${JSON.stringify(`${name}=${value || ""}`)}
      `);
      return { success: true, data: `Set cookie ${name}` };
    }
    
    if (action === "clear") {
      await controller.evaluate(`
        document.cookie.split(";").forEach(c => {
          const [name] = c.split("=");
          document.cookie = name + "=; expires=Thu, 01 Jan 1970 00:00:00 UTC";
        })
      `);
      return { success: true, data: "Cleared cookies" };
    }
    
    return { success: false, error: "Unknown cookies action" };
  },

  storage: async (controller, _engine, args) => {
    const type = args[0] as string; // "local" or "session"
    const action = args[1] as string | undefined;
    const key = args[2] as string | undefined;
    const value = args[3] as string | undefined;
    
    const storage = type === "local" ? "localStorage" : "sessionStorage";
    
    if (!action || action === "get") {
      if (key) {
        const val = await controller.evaluate<string>(`
          ${storage}.getItem(${JSON.stringify(key)})
        `);
        return { success: true, data: val };
      }
      // Get all
      const all = await controller.evaluate<Record<string, string>>(`
        { ...${storage} }
      `);
      return { success: true, data: all };
    }
    
    if (action === "set" && key) {
      await controller.evaluate(`
        ${storage}.setItem(${JSON.stringify(key)}, ${JSON.stringify(value || "")})
      `);
      return { success: true, data: `Set ${storage}[${key}]` };
    }
    
    if (action === "clear") {
      await controller.evaluate(`${storage}.clear()`);
      return { success: true, data: `Cleared ${storage}` };
    }
    
    return { success: false, error: "Unknown storage action" };
  },

  batch: async (controller, engine, args, options) => {
    return batch(controller, engine, args, options);
  },
};

// Execute a single command
export async function executeCommand(
  controller: WebViewController,
  snapshotEngine: SnapshotEngine,
  command: Command
): Promise<CommandResult> {
  const handler = commandRegistry[command.action];
  
  if (!handler) {
    return { success: false, error: `Unknown command: ${command.action}` };
  }
  
  try {
    return await handler(controller, snapshotEngine, command.args || [], command.options || {});
  } catch (error) {
    return {
      success: false,
      error: `Command failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

// Check if action is valid
export function isValidAction(action: string): action is CommandAction {
  return action in commandRegistry;
}

// Get list of available commands
export function getAvailableCommands(): CommandAction[] {
  return Object.keys(commandRegistry) as CommandAction[];
}
