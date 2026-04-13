// Query commands (get, is)

import type { CommandResult, GetType, IsType } from "../types";
import { WebViewController } from "../core";
import { isRefSelector, getRefId } from "../utils/selectors";

export async function get(
  controller: WebViewController,
  type: string,
  selector: string | undefined,
  extraArgs: unknown[]
): Promise<CommandResult> {
  try {
    switch (type) {
      case "text": {
        if (!selector) {
          return { success: false, error: "Selector required for get text" };
        }
        const text = await controller.evaluate<string>(`
          document.querySelector(${JSON.stringify(selector)})?.textContent?.trim() || ""
        `);
        return { success: true, data: text };
      }
      
      case "html": {
        if (!selector) {
          return { success: false, error: "Selector required for get html" };
        }
        const html = await controller.evaluate<string>(`
          document.querySelector(${JSON.stringify(selector)})?.innerHTML || ""
        `);
        return { success: true, data: html };
      }
      
      case "value": {
        if (!selector) {
          return { success: false, error: "Selector required for get value" };
        }
        const value = await controller.evaluate<string>(`
          document.querySelector(${JSON.stringify(selector)})?.value || ""
        `);
        return { success: true, data: value };
      }
      
      case "attr": {
        if (!selector || !extraArgs[0]) {
          return { success: false, error: "Selector and attribute name required" };
        }
        const attr = extraArgs[0] as string;
        const value = await controller.evaluate<string>(`
          document.querySelector(${JSON.stringify(selector)})?.getAttribute(${JSON.stringify(attr)}) || ""
        `);
        return { success: true, data: value };
      }
      
      case "title": {
        const title = controller.getTitle();
        return { success: true, data: title };
      }
      
      case "url": {
        const url = controller.getUrl();
        return { success: true, data: url };
      }
      
      case "count": {
        if (!selector) {
          return { success: false, error: "Selector required for get count" };
        }
        const count = await controller.evaluate<number>(`
          document.querySelectorAll(${JSON.stringify(selector)}).length
        `);
        return { success: true, data: count };
      }
      
      case "box": {
        if (!selector) {
          return { success: false, error: "Selector required for get box" };
        }
        const box = await controller.evaluate<{
          x: number;
          y: number;
          width: number;
          height: number;
        } | null>(`
          const el = document.querySelector(${JSON.stringify(selector)});
          if (!el) return null;
          const rect = el.getBoundingClientRect();
          return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
        `);
        return { success: true, data: box };
      }
      
      case "styles": {
        if (!selector) {
          return { success: false, error: "Selector required for get styles" };
        }
        const styles = await controller.evaluate<Record<string, string>>(`
          const el = document.querySelector(${JSON.stringify(selector)});
          if (!el) return {};
          const computed = window.getComputedStyle(el);
          const result = {};
          for (let i = 0; i < computed.length; i++) {
            const prop = computed[i];
            result[prop] = computed.getPropertyValue(prop);
          }
          return result;
        `);
        return { success: true, data: styles };
      }
      
      default:
        return { success: false, error: `Unknown get type: ${type}` };
    }
  } catch (error) {
    return {
      success: false,
      error: `Get failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

export async function is(
  controller: WebViewController,
  type: string,
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
    
    switch (type) {
      case "visible": {
        const visible = await controller.evaluate<boolean>(`
          const el = document.querySelector(${JSON.stringify(selector)});
          if (!el) return false;
          return el.checkVisibility ? 
            el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }) :
            (el.offsetParent !== null);
        `);
        return { success: true, data: visible };
      }
      
      case "enabled": {
        const enabled = await controller.evaluate<boolean>(`
          const el = document.querySelector(${JSON.stringify(selector)});
          if (!el) return false;
          return !el.disabled;
        `);
        return { success: true, data: enabled };
      }
      
      case "disabled": {
        const disabled = await controller.evaluate<boolean>(`
          const el = document.querySelector(${JSON.stringify(selector)});
          if (!el) return false;
          return !!el.disabled;
        `);
        return { success: true, data: disabled };
      }
      
      case "checked": {
        const checked = await controller.evaluate<boolean>(`
          const el = document.querySelector(${JSON.stringify(selector)});
          if (!el) return false;
          return el.checked === true;
        `);
        return { success: true, data: checked };
      }
      
      case "hidden": {
        const hidden = await controller.evaluate<boolean>(`
          const el = document.querySelector(${JSON.stringify(selector)});
          if (!el) return true;
          return !el.checkVisibility || !el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true });
        `);
        return { success: true, data: hidden };
      }
      
      default:
        return { success: false, error: `Unknown is type: ${type}` };
    }
  } catch (error) {
    return {
      success: false,
      error: `Is check failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}
