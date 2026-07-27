import test from "node:test";
import assert from "node:assert/strict";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, dirname, join, posix, resolve, win32 } from "node:path";
import { spawnSync } from "node:child_process";

import { resolveAgentConfigDir } from "../bin/lazypi.mjs";

const CLI_PATH = resolve("bin/lazypi.mjs");
const EXTENSION_SETTINGS_SOURCE = "npm:@juanibiapina/pi-extension-settings";
const POWERBAR_SOURCE = "npm:@juanibiapina/pi-powerbar";
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

function createWorkspace(t) {
	const root = mkdtempSync(join(tmpdir(), "lazypi-agent-dir-"));
	t.after(() => rmSync(root, { recursive: true, force: true }));
	const home = join(root, "home");
	const workspace = join(root, "workspace");
	const bin = join(root, "bin");
	mkdirSync(home, { recursive: true });
	mkdirSync(workspace, { recursive: true });
	mkdirSync(bin, { recursive: true });
	return { root, home, workspace, bin };
}

function writeSettings(path, packages) {
	mkdirSync(path, { recursive: true });
	writeFileSync(join(path, "settings.json"), JSON.stringify({ packages }, null, 2) + "\n");
}

function writeJson(path, value) {
	mkdirSync(dirname(path), { recursive: true });
	writeFileSync(path, JSON.stringify(value, null, 2) + "\n");
}

function writeFakePi(bin) {
	if (process.platform === "win32") {
		writeFileSync(join(bin, "pi.cmd"), "@echo off\r\nif \"%1\"==\"--version\" echo pi test\r\nif defined PI_TEST_CALLS echo %*>>\"%PI_TEST_CALLS%\"\r\nexit /b 0\r\n");
		return;
	}
	const piPath = join(bin, "pi");
	writeFileSync(piPath, "#!/bin/sh\nif [ \"$1\" = \"--version\" ]; then echo 'pi test'; fi\nif [ -n \"$PI_TEST_CALLS\" ]; then printf '%s\\n' \"$*\" >> \"$PI_TEST_CALLS\"; fi\nexit 0\n");
	chmodSync(piPath, 0o755);
}

function runCli(args, { cwd, home, agentDir, bin, callsPath } = {}) {
	const env = {
		...process.env,
		HOME: home,
		USERPROFILE: home,
		PI_CODING_AGENT_DIR: agentDir,
	};
	if (bin) env.PATH = [bin, process.env.PATH].filter(Boolean).join(delimiter);
	if (callsPath) env.PI_TEST_CALLS = callsPath;
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

test("resolveAgentConfigDir matches Pi path semantics", () => {
	const posixHome = "/home/tester";
	const windowsHome = "C:\\Users\\tester";
	const cases = [
		["unset", undefined, posixHome, "linux", posix.join(posixHome, ".pi", "agent")],
		["empty", "", posixHome, "linux", posix.join(posixHome, ".pi", "agent")],
		["absolute", "/opt/pi-agent", posixHome, "linux", "/opt/pi-agent"],
		["relative", ".config/pi-agent", posixHome, "linux", ".config/pi-agent"],
		["home", "~", posixHome, "linux", posixHome],
		["home child", "~/.pi/lazy", posixHome, "linux", posix.join(posixHome, ".pi", "lazy")],
		["Windows home child", "~\\.pi\\lazy", windowsHome, "win32", win32.join(windowsHome, ".pi", "lazy")],
		["Windows default", undefined, windowsHome, "win32", win32.join(windowsHome, ".pi", "agent")],
	];

	for (const [name, configured, home, platformName, expected] of cases) {
		assert.equal(resolveAgentConfigDir(configured, home, platformName), expected, name);
	}
});

test("status reads settings and Compound state from PI_CODING_AGENT_DIR", (t) => {
	const { home, workspace } = createWorkspace(t);
	const customAgentDir = join(home, ".pi", "lazy");
	writeSettings(join(home, ".pi", "agent"), ["npm:pi-mcp-adapter"]);
	writeSettings(customAgentDir, ["npm:pi-subagents"]);
	writeJson(join(customAgentDir, "compound-engineering", "install-manifest.json"), { files: ["AGENTS.md"] });

	const result = runCli(["status"], { cwd: workspace, home, agentDir: "~/.pi/lazy" });

	assert.equal(result.status, 0, `STDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`);
	assert.ok(result.stdout.includes(`Settings file: ${join(customAgentDir, "settings.json")}`));
	assert.match(result.stdout, /✓ \[core\] subagents/);
	assert.match(result.stdout, /✓ \[frameworks\] compound/);
	assert.doesNotMatch(result.stdout, /✓ \[core\] mcp/);
});

test("install reads auth and writes settings in PI_CODING_AGENT_DIR", (t) => {
	const { home, workspace, bin } = createWorkspace(t);
	const defaultAgentDir = join(home, ".pi", "agent");
	const customAgentDir = join(home, ".pi", "lazy");
	writeFakePi(bin);
	writeSettings(defaultAgentDir, ["npm:pi-mcp-adapter"]);
	writeSettings(customAgentDir, ["npm:pi-subagents"]);
	writeJson(join(defaultAgentDir, "auth.json"), { openai: { type: "api_key", key: "default" } });
	writeJson(join(customAgentDir, "auth.json"), { anthropic: { type: "api_key", key: "custom" } });

	const result = runCli(["--yes", "--only", "subagents"], { cwd: workspace, home, agentDir: customAgentDir, bin });

	assert.equal(result.status, 0, `STDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`);
	assert.match(result.stdout, /Pi credentials:\s+anthropic \(auth\.json\)/);
	const customSettings = JSON.parse(readFileSync(join(customAgentDir, "settings.json"), "utf8"));
	const defaultSettings = JSON.parse(readFileSync(join(defaultAgentDir, "settings.json"), "utf8"));
	assert.equal(customSettings.subagents.agentOverrides.reviewer.model, "");
	assert.equal(defaultSettings.subagents, undefined);
});

test("update and remove inspect the custom global settings", (t) => {
	const { root, home, workspace, bin } = createWorkspace(t);
	const callsPath = join(root, "pi-calls.log");
	const defaultAgentDir = join(home, ".pi", "agent");
	const customAgentDir = join(home, ".pi", "lazy");
	writeFakePi(bin);
	writeSettings(defaultAgentDir, ["npm:pi-subagents"]);
	writeSettings(customAgentDir, [POWERBAR_SOURCE, EXTENSION_SETTINGS_SOURCE, "npm:pi-memory-md"]);

	const updateResult = runCli(["update"], { cwd: workspace, home, agentDir: customAgentDir, bin, callsPath });
	assert.equal(updateResult.status, 0, `STDOUT:\n${updateResult.stdout}\nSTDERR:\n${updateResult.stderr}`);
	const customSettings = JSON.parse(readFileSync(join(customAgentDir, "settings.json"), "utf8"));
	assert.deepEqual(customSettings.packages, [EXTENSION_SETTINGS_SOURCE, POWERBAR_SOURCE, "npm:pi-memory-md"]);
	assert.deepEqual(JSON.parse(readFileSync(join(defaultAgentDir, "settings.json"), "utf8")).packages, ["npm:pi-subagents"]);

	const removeResult = runCli(["remove", "memory"], { cwd: workspace, home, agentDir: customAgentDir, bin, callsPath });
	assert.equal(removeResult.status, 0, `STDOUT:\n${removeResult.stdout}\nSTDERR:\n${removeResult.stderr}`);
	const calls = readFileSync(callsPath, "utf8").trim().split(/\r?\n/).filter(Boolean);
	assert.deepEqual(calls, ["update", "remove npm:pi-memory-md"]);
});

test("--local settings remain independent of PI_CODING_AGENT_DIR", (t) => {
	const { home, workspace } = createWorkspace(t);
	const customAgentDir = join(home, ".pi", "lazy");
	writeSettings(customAgentDir, ["npm:pi-subagents"]);
	writeSettings(join(workspace, ".pi"), ["npm:pi-mcp-adapter"]);

	const result = runCli(["status", "--local"], { cwd: workspace, home, agentDir: customAgentDir });

	assert.equal(result.status, 0, `STDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`);
	assert.ok(result.stdout.includes(`Settings file: ${join(workspace, ".pi", "settings.json")}`));
	assert.match(result.stdout, /✓ \[core\] mcp/);
	assert.doesNotMatch(result.stdout, /✓ \[core\] subagents/);
});
