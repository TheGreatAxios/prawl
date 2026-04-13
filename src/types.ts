// Core types for prawl browser automation

export interface WebViewOptions {
  width?: number;
  height?: number;
  headless?: boolean;
  backend?: "webkit" | "chrome" | ChromeBackendConfig;
  sessionName?: string;
  privateSession?: boolean;
}

export interface ChromeBackendConfig {
  type: "chrome";
  path?: string;
  argv?: string[];
}

export interface SessionConfig {
  name: string;
  storagePath: string;
  isPrivate: boolean;
}

export interface CommandResult {
  success: boolean;
  data?: unknown;
  error?: string;
  warning?: string;
}

export interface SnapshotOptions {
  interactive?: boolean;
  compact?: boolean;
  depth?: number;
  selector?: string;
  includeUrls?: boolean;
}

export interface AccessibilityNode {
  role: string;
  name?: string;
  ref: string;
  level?: number;
  checked?: boolean;
  pressed?: boolean;
  expanded?: boolean;
  selected?: boolean;
  disabled?: boolean;
  required?: boolean;
  placeholder?: string;
  value?: string;
  url?: string;
  children: AccessibilityNode[];
  cursor?: string;
}

export interface ScreenshotOptions {
  format?: "png" | "jpeg" | "webp";
  quality?: number;
  fullPage?: boolean;
  selector?: string;
}

export interface WaitOptions {
  selector?: string;
  text?: string;
  url?: string;
  loadState?: "load" | "domcontentloaded" | "networkidle";
  fn?: string;
  state?: "visible" | "hidden";
  timeout?: number;
}

export type CommandAction =
  | "open"
  | "close"
  | "click"
  | "dblclick"
  | "fill"
  | "type"
  | "press"
  | "keyboard"
  | "hover"
  | "scroll"
  | "scrollTo"
  | "select"
  | "check"
  | "uncheck"
  | "snapshot"
  | "screenshot"
  | "evaluate"
  | "wait"
  | "get"
  | "is"
  | "goBack"
  | "goForward"
  | "reload"
  | "cookies"
  | "storage"
  | "batch";

export interface Command {
  id: string;
  action: CommandAction;
  selector?: string;
  args?: unknown[];
  options?: Record<string, unknown>;
}

export interface ElementRef {
  id: string;
  selector: string;
  element: unknown;
}

export type GetType = "text" | "html" | "value" | "attr" | "title" | "url" | "count" | "box" | "styles";
export type IsType = "visible" | "enabled" | "checked" | "disabled" | "hidden";
