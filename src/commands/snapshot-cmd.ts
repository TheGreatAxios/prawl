// Snapshot command wrapper

import type { CommandResult, SnapshotOptions } from "../types";
import { SnapshotEngine } from "../core";

export async function snapshot(
  engine: SnapshotEngine,
  options: Record<string, unknown> = {}
): Promise<CommandResult> {
  const snapshotOptions: SnapshotOptions = {
    interactive: options.interactive === true || options.i === true,
    compact: options.compact === true || options.c === true,
    depth: options.depth ? Number(options.depth) : undefined,
    selector: typeof options.selector === "string" ? options.selector : typeof options.s === "string" ? options.s : undefined,
    includeUrls: options.urls === true || options.u === true,
  };
  
  return engine.takeSnapshot(snapshotOptions);
}
