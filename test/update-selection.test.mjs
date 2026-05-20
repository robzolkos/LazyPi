import test from "node:test";
import assert from "node:assert/strict";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const CLI_PATH = resolve("bin/lazypi.mjs");
const AUTH_ENV_VARS = [
	"ANTHROPIC_API_KEY",
	"OPENAI_API_KEY",
	"GOOGLE_API_KEY",
	"GEMINI_API_KEY",
	"OPENROUTER_API_KEY",
	"TOGETHER_API_KEY",
	"GROQ_API_KEY",
	"MISTRAL_API_KEY",
];

function createWorkspace() {
	const root = mkdtempSync(join(tmpdir(), "lazypi-update-"));
	const home = join(root, "home");
	const workspace = join(root, "workspace");
	const bin = join(root, "bin");
	mkdirSync(join(workspace, ".pi"), { recursive: true });
	mkdirSync(home, { recursive: true });
	mkdirSync(bin, { recursive: true });
	return { root, home, workspace, bin };
}

function writeFakePi(bin, callsPath) {
	const piPath = join(bin, "pi");
	writeFileSync(piPath, `#!/bin/sh\nprintf '%s\\n' "$*" >> "${callsPath}"\nexit 0\n`);
	chmodSync(piPath, 0o755);
}

function runCli(args, { cwd, home, bin } = {}) {
	const env = {
		...process.env,
		HOME: home,
		PATH: [bin, "/usr/bin", "/bin"].join(delimiter),
	};
	for (const key of AUTH_ENV_VARS) delete env[key];
	const result = spawnSync(process.execPath, [CLI_PATH, ...args], {
		cwd,
		env,
		encoding: "utf8",
		timeout: 60_000,
	});
	if (result.error) throw result.error;
	return result;
}

test("update delegates to pi update without installing the full catalog", () => {
	const { root, home, workspace, bin } = createWorkspace();
	const callsPath = join(root, "pi-calls.log");
	writeFakePi(bin, callsPath);
	mkdirSync(join(home, ".pi", "agent"), { recursive: true });
	writeFileSync(join(home, ".pi", "agent", "settings.json"), JSON.stringify({ packages: ["npm:pi-subagents"] }, null, 2) + "\n");

	const result = runCli(["update"], { cwd: workspace, home, bin });
	assert.equal(result.status, 0, `STDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`);
	assert.match(result.stdout, /pi update/);

	const calls = readFileSync(callsPath, "utf8").trim().split(/\r?\n/).filter(Boolean);
	assert.deepEqual(calls, ["update"]);
	assert.doesNotMatch(calls.join("\n"), /install|npm:pi-mcp-adapter|npm:pi-web-access|npm:@devkade\/pi-plan/);
});
