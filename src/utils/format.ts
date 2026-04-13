// Output formatting utilities

import type { AccessibilityNode, CommandResult, SnapshotOptions } from "../types";

export function formatSnapshot(
  node: AccessibilityNode,
  options: SnapshotOptions = {},
  depth = 0
): string {
  const lines: string[] = [];
  const indent = "  ".repeat(depth);

  // Skip non-interactive nodes if interactive-only mode
  if (options.interactive && !node.ref) {
    // Still include if it has interactive children
    const hasInteractiveChildren = node.children.some(
      child => child.ref || child.children.some(c => c.ref)
    );
    if (!hasInteractiveChildren) return "";
  }

  // Skip if beyond max depth
  if (options.depth && depth > options.depth) return "";

  // Build node line
  let line = `${indent}- ${node.role}`;

  if (node.name) {
    line += ` "${node.name}"`;
  }

  // Build attributes
  const attrs: string[] = [];

  if (node.ref) {
    attrs.push(`ref=${node.ref}`);
  }

  if (node.level) {
    attrs.push(`level=${node.level}`);
  }

  if (node.checked !== undefined) {
    attrs.push(`checked=${node.checked}`);
  }

  if (node.disabled) {
    attrs.push("disabled");
  }

  if (node.required) {
    attrs.push("required");
  }

  if (node.placeholder) {
    attrs.push(`placeholder="${node.placeholder}"`);
  }

  if (options.includeUrls && node.url) {
    attrs.push(`url=${node.url}`);
  }

  if (attrs.length > 0) {
    line += ` [${attrs.join(", ")}]`;
  }

  // Add cursor info
  if (node.cursor) {
    line += `\n${indent}  ${node.cursor} [cursor=${node.cursor}]`;
  }

  lines.push(line);

  // Process children (compact mode: remove empty structural nodes)
  for (const child of node.children) {
    const childOutput = formatSnapshot(child, options, depth + 1);
    if (childOutput) {
      lines.push(childOutput);
    }
  }

  return lines.join("\n");
}

export function formatResult(result: CommandResult, json = false): string {
  if (json) {
    return JSON.stringify(result, null, 2);
  }

  if (!result.success) {
    return `Error: ${result.error || "Unknown error"}`;
  }

  if (result.warning) {
    return `${result.data}\nWarning: ${result.warning}`;
  }

  if (result.data !== undefined) {
    if (typeof result.data === "string") {
      return result.data;
    }
    return JSON.stringify(result.data, null, 2);
  }

  return "OK";
}

export function formatError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === "string") {
    return error;
  }
  return String(error);
}

// Pretty print for CLI
export function printSuccess(message: string): void {
  console.log(message);
}

export function printError(message: string): void {
  console.error(message);
}

export function printWarning(message: string): void {
  console.warn(`Warning: ${message}`);
}
