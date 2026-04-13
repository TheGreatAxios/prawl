// WebView controller and session management - Enhanced with dialogs, forms, uploads, CDP

import type {
  WebViewOptions,
  SessionConfig,
  ChromeBackendConfig,
} from "../types";
import { randomUUID } from "crypto";
import { mkdir, rm, writeFile, readFile } from "fs/promises";
import { existsSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { homedir } from "os";

// Session data structure
interface SessionData {
  cookies: string;
  localStorage: Record<string, string>;
  sessionStorage: Record<string, string>;
}

// Dialog state
interface DialogState {
  type: "alert" | "confirm" | "prompt" | "beforeunload";
  message: string;
  defaultValue?: string;
  handled: boolean;
  accept?: boolean;
  value?: string;
}

// Console log entry
interface ConsoleEntry {
  type: "log" | "error" | "warn" | "info" | "debug";
  message: string;
  timestamp: number;
  url?: string;
  line?: number;
  column?: number;
}

// Device preset for mobile emulation
interface DevicePreset {
  width: number;
  height: number;
  deviceScaleFactor: number;
  userAgent: string;
  touch: boolean;
}

// Common device presets
export const DEVICE_PRESETS: Record<string, DevicePreset> = {
  "iPhone 14": {
    width: 390,
    height: 844,
    deviceScaleFactor: 3,
    userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1",
    touch: true,
  },
  "iPhone 14 Pro Max": {
    width: 430,
    height: 932,
    deviceScaleFactor: 3,
    userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1",
    touch: true,
  },
  "iPad Pro": {
    width: 1024,
    height: 1366,
    deviceScaleFactor: 2,
    userAgent: "Mozilla/5.0 (iPad; CPU OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1",
    touch: true,
  },
  "Pixel 7": {
    width: 412,
    height: 915,
    deviceScaleFactor: 2.625,
    userAgent: "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/112.0.0.0 Mobile Safari/537.36",
    touch: true,
  },
  "Galaxy S22": {
    width: 360,
    height: 800,
    deviceScaleFactor: 3,
    userAgent: "Mozilla/5.0 (Linux; Android 13; SM-S901B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/112.0.0.0 Mobile Safari/537.36",
    touch: true,
  },
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type BunWebViewInstance = any;

export class WebViewController {
  private view: BunWebViewInstance | null = null;
  private session: SessionConfig;
  private defaultTimeout = 25000;
  private pendingDialog: DialogState | null = null;
  private isChromeBackend = false;
  private consoleLogs: ConsoleEntry[] = [];

  constructor(options: WebViewOptions = {}) {
    this.session = this.initializeSession(options);
  }

  private initializeSession(options: WebViewOptions): SessionConfig {
    const isPrivate = options.privateSession || false;
    
    if (isPrivate) {
      return {
        name: `private-${randomUUID()}`,
        storagePath: join(tmpdir(), `prawl-${randomUUID()}`),
        isPrivate: true,
      };
    }

    const sessionName = options.sessionName || "default";
    const storagePath = join(homedir(), ".prawl", "sessions", sessionName);
    
    return {
      name: sessionName,
      storagePath,
      isPrivate: false,
    };
  }

  async connectToChrome(cdpUrl: string): Promise<void> {
    // Connect to existing Chrome instance via CDP WebSocket
    this.isChromeBackend = true;
    console.error(`Connecting to Chrome at ${cdpUrl}`);
    
    // Fetch version info to verify connection
    const response = await fetch(cdpUrl.replace("ws://", "http://").replace("/devtools/browser/", "/json/version"));
    if (!response.ok) {
      throw new Error(`Failed to connect to Chrome: ${response.statusText}`);
    }
    
    const version = await response.json() as { Browser?: string };
    console.error(`Connected to Chrome ${version.Browser || "unknown"}`);
    
    // Note: Full CDP WebSocket implementation would require more setup
    // This is a simplified version that verifies the connection
    this.view = null; // Mark as externally managed
  }

  async initialize(options: WebViewOptions = {}): Promise<void> {
    if (!this.session.isPrivate || !existsSync(this.session.storagePath)) {
      await mkdir(this.session.storagePath, { recursive: true });
    }

    let backend: WebViewOptions["backend"] = options.backend;
    
    if (!backend) {
      if (process.platform === "darwin") {
        backend = "webkit";
      } else {
        backend = "chrome";
      }
    }

    this.isChromeBackend = backend === "chrome" || (typeof backend === "object" && backend.type === "chrome");

    const webviewOptions: ConstructorParameters<typeof Bun.WebView>[0] = {
      width: options.width || 1280,
      height: options.height || 720,
      headless: options.headless !== false,
    };

    if (backend === "webkit") {
      webviewOptions.backend = "webkit";
    } else if (backend === "chrome") {
      webviewOptions.backend = "chrome";
    } else if (typeof backend === "object" && backend.type === "chrome") {
      webviewOptions.backend = backend;
    }

    // Add dialog handler
    // @ts-ignore - dialog option is supported by Bun.WebView but not in types
    webviewOptions.dialog = (type: string, message: string, defaultValue?: string) => {
      this.pendingDialog = {
        type: type as DialogState["type"],
        message,
        defaultValue,
        handled: false,
      };
      
      // Auto-accept alerts and beforeunload
      if (type === "alert" || type === "beforeunload") {
        this.pendingDialog.handled = true;
        this.pendingDialog.accept = true;
        return { accept: true };
      }
      
      // Confirm and prompt require explicit handling
      return undefined; // Block until handled
    };

    // @ts-ignore
    this.view = new Bun.WebView(webviewOptions);

    await this.loadSessionState();

    // Only log session info if not in quiet mode (for programmatic use)
    if (!process.env.PRAWL_QUIET) {
      console.error(`Session: ${this.session.name} (${this.session.isPrivate ? "private" : "persistent"})`);
      console.error(`Storage: ${this.session.storagePath}`);
      console.error(`Backend: ${this.isChromeBackend ? "Chrome" : "WebKit"}`);
    }
  }

  // ==================== CDP ACCESS (Chrome Backend Only) ====================
  
  async cdp<T>(method: string, params?: Record<string, unknown>): Promise<T> {
    if (!this.isChromeBackend) {
      throw new Error("CDP is only available with Chrome backend. Use --backend chrome");
    }
    
    const view = this.getView();
    // @ts-ignore - cdp method available on Chrome backend
    if (!view.cdp) {
      throw new Error("CDP method not available on this WebView instance");
    }
    
    // @ts-ignore
    return await view.cdp(method, params);
  }

  isChrome(): boolean {
    return this.isChromeBackend;
  }

  // ==================== DIALOG HANDLING ====================

  getPendingDialog(): DialogState | null {
    return this.pendingDialog;
  }

  acceptDialog(text?: string): void {
    if (!this.pendingDialog || this.pendingDialog.handled) {
      throw new Error("No pending dialog to accept");
    }
    
    this.pendingDialog.handled = true;
    this.pendingDialog.accept = true;
    this.pendingDialog.value = text;
    
    // Note: In actual implementation, we'd need to communicate back to WebView
    // This depends on Bun.WebView's dialog API specifics
  }

  dismissDialog(): void {
    if (!this.pendingDialog || this.pendingDialog.handled) {
      throw new Error("No pending dialog to dismiss");
    }
    
    this.pendingDialog.handled = true;
    this.pendingDialog.accept = false;
  }

  // ==================== FORM HANDLING ====================

  async submitForm(selector: string): Promise<void> {
    await this.evaluate(`
      (function() {
        const form = document.querySelector(${JSON.stringify(selector)});
        if (!form) throw new Error('Form not found: ${selector}');
        if (form.tagName !== 'FORM') throw new Error('Element is not a form');
        form.submit();
      })()
    `);
  }

  async setFormValues(selector: string, values: Record<string, string>): Promise<void> {
    await this.evaluate(`
      (function() {
        const form = document.querySelector(${JSON.stringify(selector)});
        if (!form) throw new Error('Form not found: ${selector}');
        const values = ${JSON.stringify(values)};
        for (const [name, value] of Object.entries(values)) {
          const input = form.querySelector('[name="' + name + '"]');
          if (input) {
            input.value = value;
            input.dispatchEvent(new Event('input', { bubbles: true }));
            input.dispatchEvent(new Event('change', { bubbles: true }));
          }
        }
      })()
    `);
  }

  // ==================== FILE UPLOAD ====================

  async uploadFile(selector: string, filePath: string): Promise<void> {
    // Read file and convert to base64
    const file = Bun.file(filePath);
    const exists = await file.exists();
    if (!exists) {
      throw new Error(`File not found: ${filePath}`);
    }
    
    const buffer = await file.arrayBuffer();
    const base64 = Buffer.from(buffer).toString("base64");
    const fileName = filePath.split("/").pop() || "file";
    const mimeType = file.type || "application/octet-stream";

    // Inject file into input via DataTransfer API
    await this.evaluate(`
      (function() {
        const input = document.querySelector(${JSON.stringify(selector)});
        if (!input) throw new Error('File input not found: ${selector}');
        if (input.type !== 'file') throw new Error('Element is not a file input');
        
        // Create a File object from base64
        const byteCharacters = atob(${JSON.stringify(base64)});
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
          byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        const file = new File([byteArray], ${JSON.stringify(fileName)}, { type: ${JSON.stringify(mimeType)} });
        
        // Create DataTransfer and set files
        const dataTransfer = new DataTransfer();
        dataTransfer.items.add(file);
        input.files = dataTransfer.files;
        
        // Dispatch events
        input.dispatchEvent(new Event('change', { bubbles: true }));
        input.dispatchEvent(new Event('input', { bubbles: true }));
        
        return true;
      })()
    `);
  }

  async uploadFiles(selector: string, filePaths: string[]): Promise<void> {
    if (filePaths.length === 0) {
      throw new Error("No files provided");
    }
    
    if (filePaths.length === 1) {
      return this.uploadFile(selector, filePaths[0]);
    }

    // Handle multiple files
    const files = await Promise.all(
      filePaths.map(async (filePath) => {
        const file = Bun.file(filePath);
        const exists = await file.exists();
        if (!exists) {
          throw new Error(`File not found: ${filePath}`);
        }
        const buffer = await file.arrayBuffer();
        return {
          name: filePath.split("/").pop() || "file",
          type: file.type || "application/octet-stream",
          base64: Buffer.from(buffer).toString("base64"),
        };
      })
    );

    await this.evaluate(`
      (function() {
        const input = document.querySelector(${JSON.stringify(selector)});
        if (!input) throw new Error('File input not found: ${selector}');
        if (input.type !== 'file') throw new Error('Element is not a file input');
        
        const files = ${JSON.stringify(files)};
        const dataTransfer = new DataTransfer();
        
        for (const fileData of files) {
          const byteCharacters = atob(fileData.base64);
          const byteNumbers = new Array(byteCharacters.length);
          for (let i = 0; i < byteCharacters.length; i++) {
            byteNumbers[i] = byteCharacters.charCodeAt(i);
          }
          const byteArray = new Uint8Array(byteNumbers);
          const file = new File([byteArray], fileData.name, { type: fileData.type });
          dataTransfer.items.add(file);
        }
        
        input.files = dataTransfer.files;
        input.dispatchEvent(new Event('change', { bubbles: true }));
        input.dispatchEvent(new Event('input', { bubbles: true }));
        
        return true;
      })()
    `);
  }

  // ==================== MOBILE EMULATION ====================

  async emulateDevice(deviceName: string): Promise<void> {
    const preset = DEVICE_PRESETS[deviceName];
    if (!preset) {
      const available = Object.keys(DEVICE_PRESETS).join(", ");
      throw new Error(`Unknown device: ${deviceName}. Available: ${available}`);
    }

    await this.setViewport(preset.width, preset.height, preset.deviceScaleFactor);
    
    // Set user agent via evaluate
    await this.evaluate(`
      Object.defineProperty(navigator, 'userAgent', {
        value: ${JSON.stringify(preset.userAgent)},
        configurable: true
      });
    `);
  }

  async setViewport(width: number, height: number, scale?: number): Promise<void> {
    const view = this.getView();
    // @ts-ignore - resize method
    if (view.resize) {
      // @ts-ignore
      await view.resize(width, height);
    } else {
      // Fallback: use evaluate to set viewport meta or window size
      await this.evaluate(`
        window.resizeTo(${width}, ${height});
        const viewport = document.querySelector('meta[name="viewport"]');
        if (viewport) {
          viewport.setAttribute('content', 'width=${width}, initial-scale=${scale || 1}');
        }
      `);
    }
  }

  getDevicePresets(): string[] {
    return Object.keys(DEVICE_PRESETS);
  }

  // ==================== NETWORK INTERCEPTION (Chrome Only) ====================

  async enableNetworkInterception(): Promise<void> {
    if (!this.isChromeBackend) {
      throw new Error("Network interception requires Chrome backend. Use --backend chrome");
    }
    
    await this.cdp("Network.enable");
    await this.cdp("Network.setRequestInterception", {
      patterns: [{ urlPattern: "*", interceptionStage: "Request" }],
    });
  }

  async interceptRequest(urlPattern: string, action: "abort" | "mock", mockResponse?: { body: string; status: number; headers?: Record<string, string> }): Promise<void> {
    if (!this.isChromeBackend) {
      throw new Error("Network interception requires Chrome backend");
    }
    
    // Note: This requires setting up CDP event listeners
    // In practice, we'd need to listen for Network.requestIntercepted events
    // and respond with Network.continueInterceptedRequest or Network.getResponseBodyForInterception
    
    // Simplified implementation:
    console.error(`Network interception setup for ${urlPattern}: ${action}`);
    console.error("Full implementation requires CDP event listener setup");
  }

  // ==================== PDF GENERATION (Chrome Only) ====================

  async printToPDF(options: {
    path: string;
    landscape?: boolean;
    displayHeaderFooter?: boolean;
    printBackground?: boolean;
    scale?: number;
    paperWidth?: number;
    paperHeight?: number;
    marginTop?: number;
    marginBottom?: number;
    marginLeft?: number;
    marginRight?: number;
    pageRanges?: string;
  }): Promise<string> {
    if (!this.isChromeBackend) {
      throw new Error("PDF generation requires Chrome backend. Use --backend chrome");
    }

    // Validate output path for security
    const allowedDirs = [
      process.cwd(),
      '/tmp',
      process.env.HOME || '/tmp',
      process.env.PRAWL_OUTPUT_DIR,
    ].filter((d): d is string => typeof d === "string");

    const pathModule = await import('path');
    const resolvedPath = pathModule.resolve(options.path);
    const isAllowed = allowedDirs.some(dir => resolvedPath.startsWith(dir));

    if (!isAllowed && !process.env.PRAWL_UNRESTRICTED) {
      throw new Error(`Path "${options.path}" is outside allowed directories (cwd, /tmp, or PRAWL_OUTPUT_DIR)`);
    }

    const result = await this.cdp<{ data: string }>("Page.printToPDF", {
      landscape: options.landscape || false,
      displayHeaderFooter: options.displayHeaderFooter || false,
      printBackground: options.printBackground !== false,
      scale: options.scale || 1,
      paperWidth: options.paperWidth || 8.5,
      paperHeight: options.paperHeight || 11,
      marginTop: options.marginTop || 0.4,
      marginBottom: options.marginBottom || 0.4,
      marginLeft: options.marginLeft || 0.4,
      marginRight: options.marginRight || 0.4,
      pageRanges: options.pageRanges,
    });

    const pdfBuffer = Buffer.from(result.data, "base64");
    await writeFile(options.path, pdfBuffer);
    
    return options.path;
  }

  // ==================== EXISTING METHODS ====================

  getView(): BunWebViewInstance {
    if (!this.view) {
      throw new Error("WebView not initialized. Call initialize() first.");
    }
    return this.view;
  }

  getSession(): SessionConfig {
    return this.session;
  }

  getDefaultTimeout(): number {
    return this.defaultTimeout;
  }

  async navigate(url: string): Promise<void> {
    const view = this.getView();
    const normalizedUrl = url.startsWith("http") ? url : `https://${url}`;
    await view.navigate(normalizedUrl);
    await this.waitForLoad();
  }

  async waitForLoad(timeout = 5000): Promise<void> {
    const view = this.getView();
    const startTime = Date.now();
    while (Date.now() - startTime < timeout) {
      // @ts-ignore
      if (!view.loading) return;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  async evaluate<T>(script: string): Promise<T> {
    const view = this.getView();
    // @ts-ignore
    return await view.evaluate(script);
  }

  async click(selector: string): Promise<void> {
    const view = this.getView();
    // @ts-ignore
    await view.click(selector);
  }

  async clickAt(x: number, y: number): Promise<void> {
    const view = this.getView();
    // @ts-ignore
    await view.click(x, y);
  }

  async type(text: string): Promise<void> {
    const view = this.getView();
    // @ts-ignore
    await view.type(text);
  }

  async press(key: string, modifiers?: string[]): Promise<void> {
    const view = this.getView();
    // @ts-ignore
    await view.press(key, { modifiers });
  }

  async keyDown(key: string, modifiers?: string[]): Promise<void> {
    const view = this.getView();
    // @ts-ignore
    await view.keydown?.(key, { modifiers });
    // Fallback: use CDP for Chrome
    if (!view.keydown && this.isChromeBackend) {
      await this.cdp("Input.dispatchKeyEvent", {
        type: "keyDown",
        key,
        modifiers: this.modifiersToCDP(modifiers),
      });
    }
  }

  async keyUp(key: string, modifiers?: string[]): Promise<void> {
    const view = this.getView();
    // @ts-ignore
    await view.keyup?.(key, { modifiers });
    // Fallback: use CDP for Chrome
    if (!view.keyup && this.isChromeBackend) {
      await this.cdp("Input.dispatchKeyEvent", {
        type: "keyUp",
        key,
        modifiers: this.modifiersToCDP(modifiers),
      });
    }
  }

  private modifiersToCDP(modifiers?: string[]): number {
    if (!modifiers) return 0;
    let mask = 0;
    if (modifiers.includes("Alt")) mask |= 1;
    if (modifiers.includes("Control")) mask |= 2;
    if (modifiers.includes("Meta")) mask |= 4;
    if (modifiers.includes("Shift")) mask |= 8;
    return mask;
  }

  async scroll(dx: number, dy: number): Promise<void> {
    const view = this.getView();
    // @ts-ignore
    await view.scroll(dx, dy);
  }

  async scrollTo(selector: string): Promise<void> {
    const view = this.getView();
    // @ts-ignore
    await view.scrollTo(selector);
  }

  async screenshot(options: { format?: string; quality?: number; encoding?: string; fullPage?: boolean } = {}): Promise<Buffer> {
    const view = this.getView();
    
    // For full page screenshots on Chrome, use CDP
    if (options.fullPage && this.isChromeBackend) {
      const result = await this.cdp<{ data: string }>("Page.captureScreenshot", {
        format: options.format === "jpeg" ? "jpeg" : "png",
        quality: options.quality,
        fromSurface: true,
        captureBeyondViewport: true,
      });
      return Buffer.from(result.data, "base64");
    }
    
    // For WebKit or non-fullpage, use regular screenshot
    // @ts-ignore
    const result = await view.screenshot({
      format: options.format || "png",
      quality: options.quality,
      encoding: options.encoding,
    });
    
    // Handle Blob or ArrayBuffer/Buffer
    if (result instanceof Blob) {
      const arrayBuffer = await result.arrayBuffer();
      return Buffer.from(arrayBuffer);
    }
    
    return Buffer.from(result);
  }

  async goBack(): Promise<void> {
    const view = this.getView();
    // @ts-ignore
    await view.goBack();
  }

  async goForward(): Promise<void> {
    const view = this.getView();
    // @ts-ignore
    await view.goForward();
  }

  async reload(): Promise<void> {
    const view = this.getView();
    // @ts-ignore
    await view.reload();
  }

  getUrl(): string {
    const view = this.getView();
    // @ts-ignore
    return view.url || "";
  }

  getTitle(): string {
    const view = this.getView();
    // @ts-ignore
    return view.title || "";
  }

  async saveSessionState(): Promise<void> {
    if (this.session.isPrivate) return;
    try {
      const data: SessionData = await this.evaluate(`
        ({
          cookies: document.cookie,
          localStorage: { ...localStorage },
          sessionStorage: { ...sessionStorage }
        })
      `);
      const statePath = join(this.session.storagePath, "state.json");
      await writeFile(statePath, JSON.stringify(data, null, 2));
    } catch (error) {
      console.error("Failed to save session state:", error);
    }
  }

  async loadSessionState(): Promise<void> {
    if (this.session.isPrivate) return;
    const statePath = join(this.session.storagePath, "state.json");
    if (!existsSync(statePath)) return;
    try {
      const data: SessionData = JSON.parse(await readFile(statePath, "utf-8"));
    } catch {
      // Ignore load errors
    }
  }

  // ==================== CONSOLE CAPTURE ====================

  async enableConsoleCapture(): Promise<void> {
    // Inject script to capture console methods
    await this.evaluate(`
      (function() {
        if (window.__prawlConsoleCapture) return;
        
        const originalLog = console.log;
        const originalError = console.error;
        const originalWarn = console.warn;
        const originalInfo = console.info;
        const originalDebug = console.debug;
        
        window.__prawlConsole = [];
        window.__prawlConsoleCapture = true;
        
        function capture(type, args) {
          const message = args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ');
          window.__prawlConsole.push({
            type: type,
            message: message,
            timestamp: Date.now()
          });
        }
        
        console.log = function(...args) { capture('log', args); originalLog.apply(console, args); };
        console.error = function(...args) { capture('error', args); originalError.apply(console, args); };
        console.warn = function(...args) { capture('warn', args); originalWarn.apply(console, args); };
        console.info = function(...args) { capture('info', args); originalInfo.apply(console, args); };
        console.debug = function(...args) { capture('debug', args); originalDebug.apply(console, args); };
      })();
    `);
  }

  async getConsoleLogs(clear: boolean = false): Promise<ConsoleEntry[]> {
    const logs = await this.evaluate<ConsoleEntry[]>(`
      window.__prawlConsole || []
    `);
    
    if (clear) {
      await this.evaluate(`window.__prawlConsole = []`);
    }
    
    return logs;
  }

  clearConsoleLogs(): void {
    this.consoleLogs = [];
  }

  // ==================== SESSION STATE ====================

  async saveState(path: string, password?: string): Promise<void> {
    const state = await this.evaluate<SessionData>(`
      ({
        cookies: document.cookie,
        localStorage: { ...localStorage },
        sessionStorage: { ...sessionStorage }
      })
    `);
    
    let dataToWrite: string;
    
    if (password) {
      // Encrypt with AES-256-GCM
      const { createCipheriv, randomBytes, scryptSync } = await import("crypto");
      const salt = randomBytes(16);
      const key = scryptSync(password, salt, 32);
      const iv = randomBytes(16);
      const cipher = createCipheriv("aes-256-gcm", key, iv);
      
      const plaintext = JSON.stringify(state);
      const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
      const authTag = cipher.getAuthTag();
      
      // Store: salt + iv + authTag + encrypted
      const payload = Buffer.concat([salt, iv, authTag, encrypted]);
      dataToWrite = JSON.stringify({ 
        encrypted: true, 
        data: payload.toString("base64"),
        version: 1 
      });
    } else {
      dataToWrite = JSON.stringify(state, null, 2);
    }
    
    await writeFile(path, dataToWrite);
  }

  async loadState(path: string, password?: string): Promise<void> {
    if (!existsSync(path)) throw new Error(`State file not found: ${path}`);
    const fileContent = await readFile(path, "utf-8");
    const parsed = JSON.parse(fileContent);
    
    let state: SessionData;
    
    if (parsed.encrypted) {
      if (!password) {
        throw new Error("State file is encrypted. Provide password to decrypt.");
      }
      
      // Decrypt with AES-256-GCM
      const { createDecipheriv, scryptSync } = await import("crypto");
      const payload = Buffer.from(parsed.data, "base64");
      
      // Extract: salt (16) + iv (16) + authTag (16) + encrypted
      const salt = payload.slice(0, 16);
      const iv = payload.slice(16, 32);
      const authTag = payload.slice(32, 48);
      const encrypted = payload.slice(48);
      
      const key = scryptSync(password, salt, 32);
      const decipher = createDecipheriv("aes-256-gcm", key, iv);
      decipher.setAuthTag(authTag);
      
      const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
      state = JSON.parse(decrypted.toString("utf8"));
    } else {
      state = parsed;
    }
    
    await this.evaluate(`
      document.cookie = ${JSON.stringify(state.cookies)};
      Object.entries(${JSON.stringify(state.localStorage)}).forEach(([k, v]) => localStorage.setItem(k, v));
      Object.entries(${JSON.stringify(state.sessionStorage)}).forEach(([k, v]) => sessionStorage.setItem(k, v));
    `);
  }

  async close(): Promise<void> {
    await this.saveSessionState();
    if (this.view) {
      // @ts-ignore
      this.view[Symbol.dispose]?.();
      this.view = null;
    }
    if (this.session.isPrivate && existsSync(this.session.storagePath)) {
      await rm(this.session.storagePath, { recursive: true, force: true });
    }
  }

  async clearSession(): Promise<void> {
    await this.saveSessionState();
    if (existsSync(this.session.storagePath)) {
      await rm(this.session.storagePath, { recursive: true, force: true });
      await mkdir(this.session.storagePath, { recursive: true });
    }
  }
}

// Global session registry
const sessions = new Map<string, WebViewController>();

export function getOrCreateSession(
  name: string,
  options: WebViewOptions = {}
): WebViewController {
  if (!sessions.has(name)) {
    const controller = new WebViewController({
      ...options,
      sessionName: name,
    });
    sessions.set(name, controller);
  }
  return sessions.get(name)!;
}

export function getSession(name: string): WebViewController | undefined {
  return sessions.get(name);
}

export function listSessions(): string[] {
  return Array.from(sessions.keys());
}

export async function closeAllSessions(): Promise<void> {
  for (const [name, controller] of sessions) {
    await controller.close();
    sessions.delete(name);
  }
}
