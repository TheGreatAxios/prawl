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
    selector: options.selector || options.s,
    includeUrls: options.urls === true || options.u === true,
  };
  
  return engine.takeSnapshot(snapshotOptions);
}
