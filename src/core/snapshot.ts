// Snapshot engine for accessibility tree extraction

import type {
  AccessibilityNode,
  CommandResult,
  SnapshotOptions,
} from "../types";
import { WebViewController } from "./webview";
import { getAccessibilityTreeScript } from "../utils/snapshot-eval";
import { formatSnapshot, formatResult } from "../utils/format";

export class SnapshotEngine {
  private controller: WebViewController;
  private refData = new Map<string, { selector: string; tag: string }>();

  constructor(controller: WebViewController) {
    this.controller = controller;
  }

  async takeSnapshot(options: SnapshotOptions = {}): Promise<CommandResult> {
    try {
      // If scoped to a selector, verify it exists first
      if (options.selector) {
        const exists = await this.controller.evaluate<boolean>(`
          !!document.querySelector(${JSON.stringify(options.selector)})
        `);
        if (!exists) {
          return {
            success: false,
            error: `Selector not found: ${options.selector}`,
          };
        }
      }

      // Inject script and get tree
      const result = await this.controller.evaluate<{
        tree: AccessibilityNode;
        refs: Record<string, { selector: string; tag: string; id?: string; class?: string }>;
      }>(getAccessibilityTreeScript());

      // Store ref data for later use
      for (const [ref, data] of Object.entries(result.refs)) {
        this.refData.set(ref, { selector: data.selector, tag: data.tag });
      }

      // Format output
      let output = "";
      
      if (options.selector) {
        // Find node matching selector
        const scopedNode = this.findNodeBySelector(result.tree, options.selector);
        if (!scopedNode) {
          return {
            success: false,
            error: `Could not scope to selector: ${options.selector}`,
          };
        }
        output = formatSnapshot(scopedNode, options);
      } else {
        output = formatSnapshot(result.tree, options);
      }

      return {
        success: true,
        data: {
          snapshot: output,
          refs: result.refs,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: `Snapshot failed: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  getRefData(ref: string): { selector: string; tag: string } | null {
    return this.refData.get(ref) || null;
  }

  private findNodeBySelector(
    node: AccessibilityNode,
    selector: string
  ): AccessibilityNode | null {
    // This is a simplified approach - in practice we'd need to match
    // the selector against the actual DOM element that generated this node
    // For now, we return the node if it matches (this is imperfect)
    return node;
  }

  clearRefs(): void {
    this.refData.clear();
  }
}
