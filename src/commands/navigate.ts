// Navigation commands

import type { CommandResult } from "../types";
import { WebViewController } from "../core";

export async function navigate(
  controller: WebViewController,
  url: string
): Promise<CommandResult> {
  try {
    await controller.navigate(url);
    return {
      success: true,
      data: `Opened ${controller.getUrl()}`,
    };
  } catch (error) {
    return {
      success: false,
      error: `Failed to open ${url}: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

export async function close(controller: WebViewController): Promise<CommandResult> {
  try {
    await controller.close();
    return { success: true, data: "Closed" };
  } catch (error) {
    return {
      success: false,
      error: `Failed to close: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}
