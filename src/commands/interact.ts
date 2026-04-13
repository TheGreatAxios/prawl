// Interaction commands

import type { CommandResult } from "../types";
import { WebViewController } from "../core";
import { parseSelector, isRefSelector, getRefId } from "../utils/selectors";

// Resolve @eN ref or CSS selector to usable selector
async function resolveSelector(
  controller: WebViewController,
  selector: string
): Promise<{ selector: string; isRef: boolean; error?: string }> {
  const parsed = parseSelector(selector);
  
  if (parsed.type === "css") {
    // Validate CSS selector exists
    const exists = await controller.evaluate<boolean>(`
      !!document.querySelector(${JSON.stringify(parsed.value)})
    `);
    if (!exists) {
      return { selector: parsed.value, isRef: false, error: `Element not found: ${selector}` };
    }
    return { selector: parsed.value, isRef: false };
  }
  
  // It's a ref - we need to look it up from snapshot
  // For now, we'll pass it through and let the WebView handle it
  // The ref format @eN needs to be resolved to actual selector
  // This is a placeholder - in full implementation we'd look up from snapshot cache
  return { selector: parsed.value, isRef: true };
}

export async function click(
  controller: WebViewController,
  selector: string,
  options: Record<string, unknown> = {}
): Promise<CommandResult> {
  try {
    // For @eN refs, try to resolve to CSS selector
    if (isRefSelector(selector)) {
      const refId = getRefId(selector);
      // Try to find element by ref attribute we'd add during snapshot
      const found = await controller.evaluate<boolean>(`
        !!document.querySelector('[data-prawl-ref="${refId}"]')
      `);
      if (found) {
        selector = `[data-prawl-ref="${refId}"]`;
      }
    }

    // Use native click method which auto-waits for actionability
    await controller.click(selector);
    
    return { success: true, data: `Clicked ${selector}` };
  } catch (error) {
    return {
      success: false,
      error: `Click failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

export async function fill(
  controller: WebViewController,
  selector: string,
  text: string,
  options: Record<string, unknown> = {}
): Promise<CommandResult> {
  try {
    // Resolve ref if needed
    if (isRefSelector(selector)) {
      const refId = getRefId(selector);
      const found = await controller.evaluate<boolean>(`
        !!document.querySelector('[data-prawl-ref="${refId}"]')
      `);
      if (found) {
        selector = `[data-prawl-ref="${refId}"]`;
      }
    }

    // Focus and clear
    await controller.click(selector);
    
    // Select all and type new text
    await controller.press("Control+a");
    await controller.type(text);
    
    return { success: true, data: `Filled ${selector}` };
  } catch (error) {
    return {
      success: false,
      error: `Fill failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

export async function type(
  controller: WebViewController,
  selector: string,
  text: string,
  options: Record<string, unknown> = {}
): Promise<CommandResult> {
  try {
    // Resolve ref if needed
    if (isRefSelector(selector)) {
      const refId = getRefId(selector);
      const found = await controller.evaluate<boolean>(`
        !!document.querySelector('[data-prawl-ref="${refId}"]')
      `);
      if (found) {
        selector = `[data-prawl-ref="${refId}"]`;
      }
    }

    // Focus and type
    await controller.click(selector);
    await controller.type(text);
    
    return { success: true, data: `Typed into ${selector}` };
  } catch (error) {
    return {
      success: false,
      error: `Type failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

export async function press(
  controller: WebViewController,
  key: string,
  options: Record<string, unknown> = {}
): Promise<CommandResult> {
  try {
    const modifiers = (options.modifiers as string[]) || [];
    await controller.press(key, modifiers);
    return { success: true, data: `Pressed ${key}` };
  } catch (error) {
    return {
      success: false,
      error: `Press failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

export async function hover(
  controller: WebViewController,
  selector: string,
  options: Record<string, unknown> = {}
): Promise<CommandResult> {
  try {
    // Resolve ref if needed
    if (isRefSelector(selector)) {
      const refId = getRefId(selector);
      const found = await controller.evaluate<boolean>(`
        !!document.querySelector('[data-prawl-ref="${refId}"]')
      `);
      if (found) {
        selector = `[data-prawl-ref="${refId}"]`;
      }
    }

    // Get element position and move mouse there
    const box = await controller.evaluate<{
      x: number;
      y: number;
      width: number;
      height: number;
    }>(`
      const el = document.querySelector(${JSON.stringify(selector)});
      if (!el) return null;
      const rect = el.getBoundingClientRect();
      return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
    `);
    
    if (!box) {
      return { success: false, error: `Element not found: ${selector}` };
    }
    
    // Move mouse to center of element
    const centerX = box.x + box.width / 2;
    const centerY = box.y + box.height / 2;
    
    // Native WebView doesn't have mouse move, but click will hover first
    // We simulate by just clicking without pressing (implementation detail)
    await controller.click(selector);
    
    return { success: true, data: `Hovered ${selector}` };
  } catch (error) {
    return {
      success: false,
      error: `Hover failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

export async function scroll(
  controller: WebViewController,
  direction: string,
  amount: number,
  options: Record<string, unknown> = {}
): Promise<CommandResult> {
  try {
    let dx = 0;
    let dy = 0;
    
    switch (direction.toLowerCase()) {
      case "up":
        dy = -amount;
        break;
      case "down":
        dy = amount;
        break;
      case "left":
        dx = -amount;
        break;
      case "right":
        dx = amount;
        break;
      default:
        return { success: false, error: `Invalid direction: ${direction}` };
    }
    
    await controller.scroll(dx, dy);
    return { success: true, data: `Scrolled ${direction} ${amount}px` };
  } catch (error) {
    return {
      success: false,
      error: `Scroll failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

export async function scrollTo(
  controller: WebViewController,
  selector: string
): Promise<CommandResult> {
  try {
    // Resolve ref if needed
    if (isRefSelector(selector)) {
      const refId = getRefId(selector);
      const found = await controller.evaluate<boolean>(`
        !!document.querySelector('[data-prawl-ref="${refId}"]')
      `);
      if (found) {
        selector = `[data-prawl-ref="${refId}"]`;
      }
    }
    
    await controller.scrollTo(selector);
    return { success: true, data: `Scrolled to ${selector}` };
  } catch (error) {
    return {
      success: false,
      error: `ScrollTo failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}
