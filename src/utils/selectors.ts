// Selector parsing utilities

import type { ElementRef } from "../types";

const REF_REGEX = /^@e(\d+)$/;

export function parseSelector(selector: string): { type: "ref" | "css"; value: string } {
  const match = selector.match(REF_REGEX);
  if (match) {
    return { type: "ref", value: match[1] };
  }
  return { type: "css", value: selector };
}

export function isRefSelector(selector: string): boolean {
  return REF_REGEX.test(selector);
}

export function getRefId(selector: string): string | null {
  const match = selector.match(REF_REGEX);
  return match ? match[1] : null;
}

// Element reference manager
export class RefManager {
  private refs = new Map<string, ElementRef>();
  private counter = 1;

  createRef(selector: string): string {
    const id = `e${this.counter++}`;
    this.refs.set(id, {
      id,
      selector,
      element: null, // Will be populated from page context
    });
    return id;
  }

  getRef(id: string): ElementRef | undefined {
    return this.refs.get(id.replace("@", ""));
  }

  getAllRefs(): ElementRef[] {
    return Array.from(this.refs.values());
  }

  clear(): void {
    this.refs.clear();
    this.counter = 1;
  }

  // Build a selector for a ref that can be used in evaluate()
  getSelectorForRef(id: string): string | null {
    const ref = this.getRef(id);
    if (!ref) return null;
    return ref.selector;
  }
}

// CSS selector validation
export function validateCssSelector(selector: string): boolean {
  try {
    // This will throw if selector is invalid
    // @ts-ignore - document is available in browser context via evaluate()
    document.querySelector(selector);
    return true;
  } catch {
    return false;
  }
}

// Safe CSS selector generator for an element
// @ts-ignore - Element and document are available in browser context via evaluate()
export function generateSelector(element: Element): string {
  // Try ID first
  if (element.id) {
    return `#${element.id}`;
  }

  // Try unique class
  if (element.className && typeof element.className === "string") {
    const classes = element.className.trim().split(/\s+/).filter(Boolean);
    for (const cls of classes) {
      const selector = `.${cls}`;
      // @ts-ignore - document is available in browser context
      if (document.querySelectorAll(selector).length === 1) {
        return selector;
      }
    }
  }

  // Build path
  const path: string[] = [];
  // @ts-ignore - Element type is available in browser context
  let current: Element | null = element;

  // @ts-ignore - document is available in browser context
  while (current && current !== document.body) {
    const tag = current.tagName.toLowerCase();
    const siblings = Array.from(current.parentElement?.children || []);
    // @ts-ignore - Element type is available in browser context
    const sameTagSiblings = siblings.filter((s) => s.tagName === current!.tagName);

    if (sameTagSiblings.length > 1) {
      const index = siblings.indexOf(current) + 1;
      path.unshift(`${tag}:nth-child(${index})`);
    } else {
      path.unshift(tag);
    }

    current = current.parentElement;
  }

  return path.join(" > ");
}
