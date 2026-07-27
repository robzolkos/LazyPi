import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const CLI_PATH = resolve("bin/lazypi.mjs");

function writeSettings(path, packages) {
	mkdirSync(path, { recursive: true });
	writeFileSync(join(path, "settings.json"), JSON.stringify({ packages }, null, 2) + "\n");
}

test("status honors PI_CODING_AGENT_DIR", (t) => {
	const root = mkdtempSync(join(tmpdir(), "lazypi-agent-dir-"));
	t.after(() => rmSync(root, { recursive: true, force: true }));
	const home = join(root, "home");
	const customAgentDir = join(home, ".pi", "lazy");
	writeSettings(join(home, ".pi", "agent"), ["npm:pi-mcp-adapter"]);
	writeSettings(customAgentDir, ["npm:pi-subagents"]);
	mkdirSync(join(customAgentDir, "compound-engineering"), { recursive: true });
	writeFileSync(join(customAgentDir, "compound-engineering", "install-manifest.json"), JSON.stringify({ files: ["AGENTS.md"] }, null, 2) + "\n");

	const result = spawnSync(process.execPath, [CLI_PATH, "status"], {
		env: {
			...process.env,
			HOME: home,
			PI_CODING_AGENT_DIR: "~/.pi/lazy",
		},
		encoding: "utf8",
	});

	assert.equal(result.status, 0, `STDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`);
	assert.match(result.stdout, new RegExp(`Settings file: ${customAgentDir.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/settings\\.json`));
	assert.match(result.stdout, /✓ \[core\] subagents/);
	assert.match(result.stdout, /✓ \[frameworks\] compound/);
	assert.doesNotMatch(result.stdout, /✓ \[core\] mcp/);
});
