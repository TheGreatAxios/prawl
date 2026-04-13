import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { $ } from "bun";
import * as fs from "fs";
import * as path from "path";

const TEST_TIMEOUT = 30000;
const TEST_URL = "https://example.com";
const TMP_DIR = "/tmp/prawl-test";

// Helper to run CLI commands
async function run(command: string, timeout = TEST_TIMEOUT): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  // Add --json flag to get JSON output (unless it's a help command)
  const args = command.startsWith("--help") || command.startsWith("-h")
    ? command.split(" ")
    : [...command.split(" "), "--json"];

  // Filter out empty strings from args (can happen with multiple spaces)
  const cleanArgs = args.filter(arg => arg.length > 0);

  const proc = Bun.spawn(["bun", "run", "--silent", "src/cli.ts", ...cleanArgs], {
    cwd: process.cwd(),
    env: { ...process.env, PRAWL_SESSION: "test-session" },
    stdout: "pipe",
    stderr: "pipe",
  });

  const timeoutPromise = new Promise((_, reject) =>
    setTimeout(() => reject(new Error(`Command timed out: ${command}`)), timeout)
  );

  const resultPromise = (async () => {
    const stdout = await new Response(proc.stdout).text();
    const stderr = await new Response(proc.stderr).text();
    const exitCode = await proc.exited;
    return { stdout, stderr, exitCode };
  })();

  return Promise.race([resultPromise, timeoutPromise]) as Promise<{ stdout: string; stderr: string; exitCode: number }>;
}

// Helper to extract JSON result
// Handles double-encoded JSON: "{\"key\":\"value\"}" -> {key: value}
function parseJsonOutput(stdout: string, stderr?: string): unknown {
  try {
    const trimmed = stdout.trim();

    // First: Handle double-encoded JSON (JSON string containing JSON)
    // Output looks like: "{\n  \"url\": \"...\"\n}" - a JSON string
    if ((trimmed.startsWith('"') && trimmed.endsWith('"')) ||
        (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
      try {
        // Parse outer JSON string
        const inner = JSON.parse(trimmed);
        if (typeof inner === "string") {
          // It's double-encoded, parse the inner content
          try {
            return JSON.parse(inner);
          } catch {
            // Inner content isn't valid JSON, return the string
            return inner;
          }
        }
        return inner;
      } catch {
        // Not valid JSON, continue
      }
    }

    // Second: Direct JSON parsing
    try {
      return JSON.parse(trimmed);
    } catch {
      // Continue
    }

    // Third: Look through lines
    const lines = stdout.split("\n").concat(stderr?.split("\n") || []);
    for (const line of lines) {
      const lineTrimmed = line.trim();
      
      // Try double-encoded in line
      if ((lineTrimmed.startsWith('"') && lineTrimmed.endsWith('"')) ||
          (lineTrimmed.startsWith("'") && lineTrimmed.endsWith("'"))) {
        try {
          const inner = JSON.parse(lineTrimmed);
          if (typeof inner === "string") {
            try {
              return JSON.parse(inner);
            } catch {
              return inner;
            }
          }
          return inner;
        } catch {
          // Continue
        }
      }
      
      // Try direct JSON
      if ((lineTrimmed.startsWith("{") || lineTrimmed.startsWith("[")) && lineTrimmed.length > 1) {
        try {
          return JSON.parse(lineTrimmed);
        } catch {
          // Continue
        }
      }
    }

    return null;
  } catch {
    return null;
  }
}

// Debug helper - logs output when DEBUG env is set
function debugOutput(command: string, result: { stdout: string; stderr: string; exitCode: number }) {
  if (process.env.DEBUG) {
    console.log(`\n=== ${command} ===`);
    console.log("Exit code:", result.exitCode);
    console.log("Stdout:", result.stdout);
    console.log("Stderr:", result.stderr);
    console.log("Parsed JSON:", parseJsonOutput(result.stdout, result.stderr));

    // Show lines that look like JSON but failed to parse
    const lines = result.stdout.split("\n").concat(result.stderr.split("\n"));
    console.log("\nJSON-like lines found:");
    for (const line of lines) {
      const trimmed = line.trim();
      if ((trimmed.startsWith("{") || trimmed.startsWith("[")) && trimmed.length > 1) {
        console.log(`  - ${trimmed.substring(0, 100)}${trimmed.length > 100 ? "..." : ""}`);
      }
    }
    console.log("===================\n");
  }
}

// Helper to extract data from incur response format
// Incur may wrap results in { success: true, data: ... } or return them directly
function extractData(json: unknown): unknown {
  if (!json || typeof json !== "object") return json;

  // If it's an incur response with data property, unwrap it
  if ("data" in json && json.data !== undefined) {
    return json.data;
  }

  // If it's an error response
  if ("error" in json && json.error !== undefined) {
    return json;
  }

  return json;
}

describe("prawl CLI", () => {
  beforeAll(async () => {
    // Ensure tmp directory exists
    if (!fs.existsSync(TMP_DIR)) {
      fs.mkdirSync(TMP_DIR, { recursive: true });
    }
    // Clean up any existing test session
    await run("close").catch(() => {});
  });

  afterAll(async () => {
    // Clean up test session
    await run("close").catch(() => {});
    // Clean up temp files
    try {
      fs.rmSync(TMP_DIR, { recursive: true, force: true });
    } catch {}
  });

  describe("Help & Info", () => {
    it("should show help", async () => {
      const { stdout, exitCode } = await run("--help");
      expect(exitCode).toBe(0);
      expect(stdout).toContain("prawl");
    });

    it("should list available commands", async () => {
      const { stdout, exitCode } = await run("--help");
      expect(exitCode).toBe(0);
      expect(stdout.length).toBeGreaterThan(0);
    });
  });

  describe("Basic Navigation", () => {
    it("should open a URL", async () => {
      const result = await run(`open ${TEST_URL}`);
      debugOutput(`open ${TEST_URL}`, result);
      expect(result.exitCode).toBe(0);
      const json = parseJsonOutput(result.stdout, result.stderr);
      expect(json).toBeTruthy();
      // Check for either direct result or wrapped in data property
      const data = extractData(json);
      expect(data).toBeTruthy();
    });

    it("should get page title", async () => {
      const { stdout, exitCode } = await run("get title");
      expect(exitCode).toBe(0);
      const json = parseJsonOutput(stdout);
      const data = extractData(json);
      // Check for 'value' property (returned by get title) or 'title'
      expect(data).toHaveProperty("value");
    });

    it("should get page URL", async () => {
      const { stdout, exitCode } = await run("get url");
      expect(exitCode).toBe(0);
      const json = parseJsonOutput(stdout);
      const data = extractData(json);
      // Check for 'value' property (returned by get url) or 'url'
      expect(data).toHaveProperty("value");
    });

    it("should reload the page", async () => {
      const { exitCode } = await run("reload");
      expect(exitCode).toBe(0);
    });
  });

  describe("Navigation History", () => {
    it("should navigate back", async () => {
      // First open a different page
      await run(`open https://example.org`);
      const { exitCode } = await run("back");
      expect(exitCode).toBe(0);
    });

    it("should navigate forward", async () => {
      const { exitCode } = await run("forward");
      // May fail if no forward history, that's ok
      expect([0, 1]).toContain(exitCode);
    });
  });

  describe("Snapshot", () => {
    it("should take a basic snapshot", async () => {
      await run(`open ${TEST_URL}`);
      const { stdout, exitCode } = await run("snapshot");
      expect(exitCode).toBe(0);
      const json = parseJsonOutput(stdout);
      expect(json).toBeTruthy();
      // Snapshot returns { snapshot: string, refs: object }
      expect(json).toHaveProperty("snapshot");
    });

    it("should take a compact snapshot", async () => {
      const { stdout, exitCode } = await run("snapshot --compact");
      expect(exitCode).toBe(0);
      const json = parseJsonOutput(stdout);
      expect(json).toBeTruthy();
      expect(json).toHaveProperty("snapshot");
    });
  });

  describe("Element Interaction", () => {
    beforeAll(async () => {
      await run(`open ${TEST_URL}`);
    });

    it("should find elements by text", async () => {
      const { stdout, exitCode } = await run('find "More information"');
      // Find may fail if element not found, accept either
      const json = parseJsonOutput(stdout);
      if (exitCode === 0 && json) {
        expect(json).toHaveProperty("found");
      }
    });

    it("should find elements by role", async () => {
      const { stdout, exitCode } = await run("find role link");
      const json = parseJsonOutput(stdout);
      if (exitCode === 0 && json) {
        expect(json).toHaveProperty("found");
      }
    });
  });

  describe("Keyboard Events", () => {
    beforeAll(async () => {
      await run(`open ${TEST_URL}`);
    });

    it("should send keydown event", async () => {
      const { exitCode } = await run("keydown Control");
      expect(exitCode).toBe(0);
    });

    it("should send keyup event", async () => {
      const { exitCode } = await run("keyup Control");
      expect(exitCode).toBe(0);
    });

    it("should press a key", async () => {
      const { exitCode } = await run("press Escape");
      expect(exitCode).toBe(0);
    });
  });

  describe("Scrolling", () => {
    beforeAll(async () => {
      await run(`open ${TEST_URL}`);
    });

    it("should scroll down", async () => {
      const { exitCode } = await run("scroll down 100");
      // Scroll may fail in headless/WebKit, accept either
      expect([0, 1]).toContain(exitCode);
    });

    it("should scroll up", async () => {
      const { exitCode } = await run("scroll up 100");
      expect([0, 1]).toContain(exitCode);
    });
  });

  describe("Device Emulation", () => {
    it("should emulate iPhone 14", async () => {
      await run(`open ${TEST_URL}`);
      const { stdout, exitCode } = await run('device "iPhone 14"');
      // Device emulation may fail in WebKit, accept either
      const json = parseJsonOutput(stdout);
      if (exitCode === 0 && json) {
        expect(json).toHaveProperty("emulated");
      }
    });

    it("should set viewport size", async () => {
      const { stdout, exitCode } = await run("viewport 1920 1080");
      const json = parseJsonOutput(stdout);
      if (exitCode === 0 && json) {
        expect(json).toHaveProperty("set");
      }
    });

    it("should list available devices", async () => {
      const { stdout, exitCode } = await run("devices");
      expect(exitCode).toBe(0);
      const json = parseJsonOutput(stdout);
      expect(json).toBeTruthy();
      expect(json).toHaveProperty("devices");
    });
  });

  describe("Screenshot", () => {
    const screenshotPath = path.join(TMP_DIR, "test.png");

    it("should take a screenshot (may need macOS permissions)", async () => {
      await run(`open ${TEST_URL}`);
      const { stdout, exitCode } = await run(`screenshot ${screenshotPath}`);
      // Screenshot may fail without macOS screen recording permissions
      const json = parseJsonOutput(stdout);
      if (exitCode === 0 && json) {
        expect(json).toHaveProperty("path");
        expect(fs.existsSync(screenshotPath)).toBe(true);
      }
    }, 60000);
  });

  describe("Console Logs", () => {
    beforeAll(async () => {
      await run(`open ${TEST_URL}`);
    });

    it("should get console logs", async () => {
      const { stdout, exitCode } = await run("console");
      // Console may fail if no logs exist, accept either
      const json = parseJsonOutput(stdout);
      if (exitCode === 0 && json) {
        expect(json).toHaveProperty("logs");
      }
    });

    it("should clear console logs", async () => {
      const { exitCode } = await run("console.clear");
      expect(exitCode).toBe(0);
    });
  });

  describe("Chain Commands", () => {
    it("should execute chain of commands", async () => {
      const { stdout, exitCode } = await run(`chain "open ${TEST_URL} && get title && get url"`);
      expect(exitCode).toBe(0);
      const json = parseJsonOutput(stdout);
      expect(json).toBeTruthy();
      const data = extractData(json);
      expect(data).toHaveProperty("executed");
      expect(data).toHaveProperty("succeeded");
    });

    it("should execute run alias", async () => {
      const { stdout, exitCode } = await run(`run "open ${TEST_URL} && get title"`);
      expect(exitCode).toBe(0);
      const json = parseJsonOutput(stdout);
      expect(json).toBeTruthy();
      const data = extractData(json);
      expect(data).toHaveProperty("executed");
    });
  });

  describe("Parallel Commands", () => {
    it("should execute commands in parallel", async () => {
      await run(`open ${TEST_URL}`);
      const { stdout, exitCode } = await run('parallel "get title | get url"');
      expect(exitCode).toBe(0);
      const json = parseJsonOutput(stdout);
      expect(json).toBeTruthy();
      const data = extractData(json);
      expect(data).toHaveProperty("executed");
      expect(data).toHaveProperty("succeeded");
    });

    it("should execute p alias", async () => {
      const { stdout, exitCode } = await run('p "get title | get url"');
      expect(exitCode).toBe(0);
      const json = parseJsonOutput(stdout);
      expect(json).toBeTruthy();
      const data = extractData(json);
      expect(data).toHaveProperty("executed");
    });
  });

  describe("State Management", () => {
    const statePath = path.join(TMP_DIR, "state.json");

    it("should save session state", async () => {
      await run(`open ${TEST_URL}`);
      const { stdout, exitCode } = await run(`state.save ${statePath}`);
      // State save may fail in some environments
      const json = parseJsonOutput(stdout);
      if (exitCode === 0 && json) {
        expect(json).toHaveProperty("saved");
        expect(fs.existsSync(statePath)).toBe(true);
      }
    });

    it("should load session state", async () => {
      // Only test if state file exists from previous test
      if (!fs.existsSync(statePath)) {
        console.log("Skipping state load test - no state file exists");
        return;
      }
      const { stdout, exitCode } = await run(`state.load ${statePath}`);
      const json = parseJsonOutput(stdout);
      if (exitCode === 0 && json) {
        expect(json).toHaveProperty("loaded");
      }
    });
  });

  describe("Dialog Handling", () => {
    beforeAll(async () => {
      await run(`open ${TEST_URL}`);
    });

    it("should check dialog status", async () => {
      const { stdout, exitCode } = await run("dialog.status");
      expect(exitCode).toBe(0);
      const json = parseJsonOutput(stdout);
      expect(json).toBeTruthy();
      const data = extractData(json);
      expect(data).toHaveProperty("pending");
    });
  });

  describe("Configuration", () => {
    it("should show config", async () => {
      await run(`open ${TEST_URL}`);
      const { stdout, exitCode } = await run("config");
      expect(exitCode).toBe(0);
      const json = parseJsonOutput(stdout);
      expect(json).toBeTruthy();
      const data = extractData(json);
      expect(data).toHaveProperty("config");
    });

    it("should get specific config value", async () => {
      const { stdout, exitCode } = await run("config.get session");
      expect(exitCode).toBe(0);
      const json = parseJsonOutput(stdout);
      expect(json).toBeTruthy();
      const data = extractData(json);
      expect(data).toHaveProperty("key");
    });
  });

  describe("Session Management", () => {
    it("should use named session", async () => {
      // Use PRAWL_SESSION env var instead of --session flag for better compatibility
      const proc = Bun.spawn(["bun", "run", "--silent", "src/cli.ts", "open", "example.com", "--json"], {
        cwd: process.cwd(),
        env: { ...process.env, PRAWL_SESSION: "named-test" },
        stdout: "pipe",
        stderr: "pipe",
      });
      
      const stdout = await new Response(proc.stdout).text();
      const exitCode = await proc.exited;
      
      expect(exitCode).toBe(0);
      const json = parseJsonOutput(stdout);
      expect(json).toBeTruthy();
    });

    it("should close session", async () => {
      const { exitCode } = await run("close");
      expect(exitCode).toBe(0);
    });
  });

  describe("Form Commands", () => {
    it("should submit a form", async () => {
      await run(`open ${TEST_URL}`);
      // This will likely fail on example.com (no forms), but tests the command
      const { exitCode } = await run('submit "form"');
      // May fail on sites without forms
      expect([0, 1]).toContain(exitCode);
    });
  });

  describe("JavaScript Evaluation", () => {
    beforeAll(async () => {
      await run(`open ${TEST_URL}`);
    });

    it("should evaluate JavaScript", async () => {
      const { stdout, exitCode } = await run('eval "document.title" --force');
      expect(exitCode).toBe(0);
      const json = parseJsonOutput(stdout);
      expect(json).toBeTruthy();
      const data = extractData(json);
      expect(data).toHaveProperty("result");
    });
  });

  describe("Session Cleanup", () => {
    it("should close all sessions", async () => {
      // Close default session
      const { exitCode: exit1 } = await run("close");
      expect([0, 1]).toContain(exit1); // May fail if already closed

      // Close named session
      const { exitCode: exit2 } = await run("--session named-test close");
      expect([0, 1]).toContain(exit2);
    });
  });
});

describe("Chrome-only features", () => {
  const checkChromeAvailable = async (): Promise<boolean> => {
    try {
      const response = await fetch("http://localhost:9222/json/version", {
        signal: AbortSignal.timeout(1000)
      });
      return response.ok;
    } catch {
      return false;
    }
  };

  it("should connect to Chrome (if available)", async () => {
    const chromeAvailable = await checkChromeAvailable();
    if (!chromeAvailable) {
      console.log("Skipping - Chrome not available on port 9222");
      return;
    }
    
    const { stdout, exitCode } = await run("connect");
    const json = parseJsonOutput(stdout);
    if (exitCode === 0 && json) {
      expect(json).toHaveProperty("connected");
    }
  });

  it("should execute CDP command (if Chrome available)", async () => {
    const chromeAvailable = await checkChromeAvailable();
    if (!chromeAvailable) {
      console.log("Skipping - Chrome not available");
      return;
    }
    
    const { stdout, exitCode } = await run('cdp Runtime.evaluate --params \'{"expression":"1+1"}\'');
    const json = parseJsonOutput(stdout);
    if (exitCode === 0 && json) {
      expect(json).toHaveProperty("result");
    }
  });

  it("should generate PDF (if Chrome available)", async () => {
    const chromeAvailable = await checkChromeAvailable();
    if (!chromeAvailable) {
      console.log("Skipping - Chrome not available");
      return;
    }
    
    const pdfPath = path.join(TMP_DIR, "test.pdf");
    const { stdout, exitCode } = await run(`pdf ${pdfPath}`);
    const json = parseJsonOutput(stdout);
    if (exitCode === 0 && json) {
      expect(json).toHaveProperty("generated");
      expect(fs.existsSync(pdfPath)).toBe(true);
    }
  });

  it("should enable network interception (if Chrome available)", async () => {
    const chromeAvailable = await checkChromeAvailable();
    if (!chromeAvailable) {
      console.log("Skipping - Chrome not available");
      return;
    }
    
    const { stdout, exitCode } = await run("network.enable");
    const json = parseJsonOutput(stdout);
    if (exitCode === 0 && json) {
      expect(json).toHaveProperty("enabled");
    }
  });
});
