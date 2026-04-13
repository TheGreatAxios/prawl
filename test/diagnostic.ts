#!/usr/bin/env bun
// Diagnostic script to check CLI output format

const TEST_URL = "https://example.com";

async function run(command: string, timeout = 30000) {
  const args = command.startsWith("--help") || command.startsWith("-h")
    ? command.split(" ")
    : [...command.split(" "), "--json"];

  console.log(`\nRunning: bun run src/cli.ts ${args.join(" ")}`);
  console.log("=" .repeat(60));

  const proc = Bun.spawn(["bun", "run", "--silent", "src/cli.ts", ...args], {
    cwd: process.cwd(),
    env: { ...process.env, PRAWL_SESSION: "test-session" },
    stdout: "pipe",
    stderr: "pipe",
  });

  const result = await Promise.race([
    (async () => {
      const stdout = await new Response(proc.stdout).text();
      const stderr = await new Response(proc.stderr).text();
      const exitCode = await proc.exited;
      return { stdout, stderr, exitCode };
    })(),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`Timeout`)), timeout)
    ),
  ]);

  console.log("Exit code:", (result as { exitCode: number }).exitCode);
  console.log("\n--- STDOUT ---");
  console.log((result as { stdout: string }).stdout);
  console.log("\n--- STDERR ---");
  console.log((result as { stderr: string }).stderr);
  console.log("--- JSON ATTEMPT ---");

  // Try to find JSON
  const lines = (result as { stdout: string; stderr: string }).stdout.split("\n")
    .concat((result as { stderr: string }).stderr.split("\n"));

  for (const line of lines) {
    const trimmed = line.trim();
    if ((trimmed.startsWith("{") || trimmed.startsWith("[")) && trimmed.length > 1) {
      try {
        const parsed = JSON.parse(trimmed);
        console.log("Found JSON:", JSON.stringify(parsed, null, 2));
        break;
      } catch {
        // Continue
      }
    }
  }

  return result;
}

async function main() {
  console.log("DIAGNOSTIC: Checking CLI output formats\n");

  // Test 1: open
  await run(`open ${TEST_URL}`);

  // Test 2: get title
  await run("get title");

  // Test 3: snapshot
  await run("snapshot");

  // Test 4: devices
  await run("devices");

  console.log("\n" + "=" .repeat(60));
  console.log("Diagnostic complete!");
  console.log("\nBased on the output above, we need to:");
  console.log("1. Check where JSON is actually output (stdout vs stderr)");
  console.log("2. Check the JSON format (plain JSON or wrapped in something)");
  console.log("3. Update parseJsonOutput() accordingly");
}

main().catch(console.error);
