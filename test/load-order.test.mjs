import test from "node:test";
import assert from "node:assert/strict";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

import { normalizePackageLoadOrderInSettings, PACKAGES } from "../bin/lazypi.mjs";

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

function createWorkspace() {
	const root = mkdtempSync(join(tmpdir(), "lazypi-load-order-"));
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

function packageSources(settings) {
	return settings.packages.map((entry) => typeof entry === "string" ? entry : entry.source);
}

test("catalog installs extension-settings before powerbar", () => {
	const extensionSettingsIndex = PACKAGES.findIndex((pkg) => pkg.id === "extension-settings");
	const powerbarIndex = PACKAGES.findIndex((pkg) => pkg.id === "powerbar");

	assert.notEqual(extensionSettingsIndex, -1);
	assert.notEqual(powerbarIndex, -1);
	assert.ok(extensionSettingsIndex < powerbarIndex);
});

test("normalizePackageLoadOrderInSettings moves extension-settings to the front", () => {
	const powerbarEntry = { source: POWERBAR_SOURCE, enabled: true };
	const settings = {
		packages: [
			"npm:pi-subagents",
			powerbarEntry,
			EXTENSION_SETTINGS_SOURCE,
			"npm:@tmustier/pi-usage-extension",
		],
	};

	assert.equal(normalizePackageLoadOrderInSettings(settings), true);
	assert.deepEqual(packageSources(settings), [
		EXTENSION_SETTINGS_SOURCE,
		"npm:pi-subagents",
		POWERBAR_SOURCE,
		"npm:@tmustier/pi-usage-extension",
	]);
	assert.equal(settings.packages[2], powerbarEntry);
	assert.equal(normalizePackageLoadOrderInSettings(settings), false);
});

test("install repairs load order for already-installed local packages", () => {
	const { root, home, workspace, bin } = createWorkspace();
	const callsPath = join(root, "pi-calls.log");
	writeFakePi(bin, callsPath);
	const settingsPath = join(workspace, ".pi", "settings.json");
	writeFileSync(settingsPath, JSON.stringify({ packages: [POWERBAR_SOURCE, EXTENSION_SETTINGS_SOURCE] }, null, 2) + "\n");

	const result = runCli(["--yes", "--only", "extension-settings,powerbar", "-l"], { cwd: workspace, home, bin });
	assert.equal(result.status, 0, `STDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`);
	assert.match(result.stdout, /Updated package load order/);

	const settings = JSON.parse(readFileSync(settingsPath, "utf8"));
	assert.deepEqual(settings.packages, [EXTENSION_SETTINGS_SOURCE, POWERBAR_SOURCE]);
	assert.equal(readdirSync(join(workspace, ".pi")).some((name) => name.endsWith(".bak")), true);
});

test("update repairs load order before delegating to pi update", () => {
	const { root, home, workspace, bin } = createWorkspace();
	const callsPath = join(root, "pi-calls.log");
	writeFakePi(bin, callsPath);
	const settingsPath = join(workspace, ".pi", "settings.json");
	writeFileSync(settingsPath, JSON.stringify({ packages: [POWERBAR_SOURCE, EXTENSION_SETTINGS_SOURCE] }, null, 2) + "\n");

	const result = runCli(["update", "-l"], { cwd: workspace, home, bin });
	assert.equal(result.status, 0, `STDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`);
	assert.match(result.stdout, /Updated package load order/);

	const settings = JSON.parse(readFileSync(settingsPath, "utf8"));
	assert.deepEqual(settings.packages, [EXTENSION_SETTINGS_SOURCE, POWERBAR_SOURCE]);
	const calls = readFileSync(callsPath, "utf8").trim().split(/\r?\n/).filter(Boolean);
	assert.deepEqual(calls, ["update --extensions"]);
});
