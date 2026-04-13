import { describe, it, expect } from "bun:test";

const TEST_URL = "https://example.com";

async function run(command: string, timeout = 30000): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const args = command.startsWith("--help") || command.startsWith("-h")
    ? command.split(" ")
    : [...command.split(" "), "--json"];

  const proc = Bun.spawn(["bun", "run", "--silent", "src/cli.ts", ...args], {
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

describe("Diagnostic - Check CLI Output Format", () => {
  it("should show raw output from open command", async () => {
    const result = await run(`open ${TEST_URL}`);

    console.log("\n========== OPEN COMMAND OUTPUT ==========");
    console.log("Exit code:", result.exitCode);
    console.log("\n--- STDOUT ---");
    console.log(JSON.stringify(result.stdout));
    console.log("\n--- STDERR ---");
    console.log(JSON.stringify(result.stderr));
    console.log("=========================================\n");

    // Just verify the command runs, don't assert on parsing
    expect(result.exitCode).toBe(0);
  });

  it("should show raw output from get title", async () => {
    const result = await run("get title");

    console.log("\n========== GET TITLE OUTPUT ==========");
    console.log("Exit code:", result.exitCode);
    console.log("\n--- STDOUT ---");
    console.log(JSON.stringify(result.stdout));
    console.log("\n--- STDERR ---");
    console.log(JSON.stringify(result.stderr));
    console.log("=======================================\n");

    expect([0, 1]).toContain(result.exitCode);
  });

  it("should show raw output from snapshot", async () => {
    const result = await run("snapshot");

    console.log("\n========== SNAPSHOT OUTPUT ==========");
    console.log("Exit code:", result.exitCode);
    console.log("\n--- STDOUT ---");
    console.log(JSON.stringify(result.stdout));
    console.log("\n--- STDERR ---");
    console.log(JSON.stringify(result.stderr));
    console.log("======================================\n");

    expect([0, 1]).toContain(result.exitCode);
  });

  it("should show raw output from devices command", async () => {
    const result = await run("devices");

    console.log("\n========== DEVICES OUTPUT ==========");
    console.log("Exit code:", result.exitCode);
    console.log("\n--- STDOUT ---");
    console.log(JSON.stringify(result.stdout));
    console.log("\n--- STDERR ---");
    console.log(JSON.stringify(result.stderr));
    console.log("====================================\n");

    expect([0, 1]).toContain(result.exitCode);
  });
});
