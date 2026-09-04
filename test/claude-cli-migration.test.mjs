import test from "node:test";
import assert from "node:assert/strict";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

import { isSupportedNodeVersion, MIN_NODE_VERSION, PACKAGES } from "../bin/lazypi.mjs";

const CLI_PATH = resolve("bin/lazypi.mjs");
const CURRENT_SOURCE = "npm:@saccolabs/pi-claude-cli@0.6.1";
const PREVIOUS_CURRENT_SOURCE = "npm:@saccolabs/pi-claude-cli@0.6.0";
const UNPINNED_CURRENT_SOURCE = "npm:@saccolabs/pi-claude-cli";
const LEGACY_SOURCE = "npm:pi-claude-cli";
const PINNED_LEGACY_SOURCE = "npm:pi-claude-cli@0.3.1";
const CURRENT_AUTORESEARCH_SOURCE = "git:github.com/davebcn87/pi-autoresearch";
const LEGACY_AUTORESEARCH_SOURCE = "git:github.com/davebcn87/pi-autoresearch@5a29db080131449edc6d25a6b351b12879063366";
const USER_PINNED_UNPINNED_CATALOG_SOURCE = "npm:pi-subagents@0.13.3";
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

function createWorkspace(t, packages = []) {
	const root = mkdtempSync(join(tmpdir(), "lazypi-claude-migration-"));
	t.after(() => rmSync(root, { recursive: true, force: true }));
	const home = join(root, "home");
	const workspace = join(root, "workspace");
	const bin = join(root, "bin");
	const settingsDir = join(home, ".pi", "agent");
	mkdirSync(settingsDir, { recursive: true });
	mkdirSync(workspace, { recursive: true });
	mkdirSync(bin, { recursive: true });
	writeFileSync(join(settingsDir, "settings.json"), JSON.stringify({ packages }, null, 2) + "\n");
	return { root, home, workspace, bin, settingsDir };
}

function writeFakePi(bin) {
	const driverPath = join(bin, "pi-driver.cjs");
	writeFileSync(driverPath, `
const { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } = require("node:fs");
const { dirname, join } = require("node:path");
const args = process.argv.slice(2);
const command = args[0];
if (command === "install" && args.includes("--help")) {
	if (process.env.PI_TEST_SUPPORTS_APPROVE !== "0") console.log("  --approve");
	process.exit(0);
}
if (command === "update" && args.includes("--help")) {
	if (process.env.PI_TEST_SUPPORTS_UPDATE_ALL !== "0") console.log("  --all");
	process.exit(0);
}
appendFileSync(process.env.PI_TEST_CALLS, args.join(" ") + "\\n");
const source = args.at(-1);
const failRemoveAfterMutation = command === "remove" && source === process.env.PI_TEST_FAIL_REMOVE_AFTER_MUTATION_SOURCE;
if (command === "install" && source === process.env.PI_TEST_FAIL_INSTALL_SOURCE) process.exit(41);
if (command === "remove" && source === process.env.PI_TEST_FAIL_REMOVE_SOURCE) process.exit(42);
if (command === "--version") {
	console.log("pi test");
	process.exit(0);
}
if (command !== "install" && command !== "remove") process.exit(0);

const local = args.includes("-l") || args.includes("--local");
const agentDir = process.env.PI_CODING_AGENT_DIR || join(process.env.HOME, ".pi", "agent");
const settingsPath = local ? join(process.cwd(), ".pi", "settings.json") : join(agentDir, "settings.json");
const settings = existsSync(settingsPath) ? JSON.parse(readFileSync(settingsPath, "utf8")) : {};
const packages = Array.isArray(settings.packages) ? settings.packages : [];
const entrySource = (entry) => typeof entry === "string" ? entry : entry.source;
const identity = (value) => {
	if (value.startsWith("npm:")) {
		const match = value.slice(4).match(/^(@?[^@]+(?:\\/[^@]+)?)(?:@(.+))?$/);
		return "npm:" + (match?.[1] || value.slice(4));
	}
	if (value.startsWith("git:")) {
		const body = value.slice(4);
		const refIndex = body.lastIndexOf("@");
		return "git:" + (refIndex > body.lastIndexOf("/") ? body.slice(0, refIndex) : body);
	}
	return value;
};
if (command === "install") {
	const index = packages.findIndex((entry) => identity(entrySource(entry)) === identity(source));
	if (index === -1) packages.push(source);
	else packages[index] = typeof packages[index] === "string" ? source : { ...packages[index], source };
} else {
	settings.packages = packages.filter((entry) => identity(entrySource(entry)) !== identity(source));
}
if (command === "install") settings.packages = packages;
mkdirSync(dirname(settingsPath), { recursive: true });
writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + "\\n");
if (failRemoveAfterMutation) process.exit(42);
`);
	if (process.platform === "win32") {
		writeFileSync(join(bin, "pi.cmd"), `@echo off\r\n"${process.execPath}" "${driverPath}" %*\r\n`);
		return;
	}
	const piPath = join(bin, "pi");
	writeFileSync(piPath, `#!/bin/sh\nexec "${process.execPath}" "${driverPath}" "$@"\n`);
	chmodSync(piPath, 0o755);
}

function runCli(t, args, { packages = [], projectPackages, failInstall, failRemove, failRemoveAfterMutation, supportsApprove = true, supportsUpdateAll = true } = {}) {
	const paths = createWorkspace(t, packages);
	const callsPath = join(paths.root, "pi-calls.log");
	writeFileSync(callsPath, "");
	writeFakePi(paths.bin);
	if (projectPackages !== undefined) {
		mkdirSync(join(paths.workspace, ".pi"), { recursive: true });
		writeFileSync(join(paths.workspace, ".pi", "settings.json"), JSON.stringify({ packages: projectPackages }, null, 2) + "\n");
	}
	const env = {
		...process.env,
		HOME: paths.home,
		USERPROFILE: paths.home,
		PATH: [paths.bin, process.env.PATH].filter(Boolean).join(delimiter),
		PI_CODING_AGENT_DIR: paths.settingsDir,
		PI_TEST_CALLS: callsPath,
		PI_TEST_SUPPORTS_APPROVE: supportsApprove ? "1" : "0",
		PI_TEST_SUPPORTS_UPDATE_ALL: supportsUpdateAll ? "1" : "0",
	};
	if (failInstall) env.PI_TEST_FAIL_INSTALL_SOURCE = failInstall;
	if (failRemove) env.PI_TEST_FAIL_REMOVE_SOURCE = failRemove;
	if (failRemoveAfterMutation) env.PI_TEST_FAIL_REMOVE_AFTER_MUTATION_SOURCE = failRemoveAfterMutation;
	for (const key of AUTH_ENV_VARS) delete env[key];
	const result = spawnSync(process.execPath, [CLI_PATH, ...args], {
		cwd: paths.workspace,
		env,
		encoding: "utf8",
		timeout: 60_000,
	});
	if (result.error) throw result.error;
	const calls = readFileSync(callsPath, "utf8").trim().split(/\r?\n/).filter(Boolean);
	const settings = JSON.parse(readFileSync(join(paths.settingsDir, "settings.json"), "utf8"));
	const projectSettingsPath = join(paths.workspace, ".pi", "settings.json");
	const projectSettings = projectPackages === undefined
		? null
		: JSON.parse(readFileSync(projectSettingsPath, "utf8"));
	return { result, calls, settings, projectSettings };
}

function assertSuccess(result) {
	assert.equal(result.status, 0, `STDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`);
}

test("migration tests isolate custom agent directories from the ambient environment", { concurrency: false }, (t) => {
	const ambientRoot = mkdtempSync(join(tmpdir(), "lazypi-ambient-agent-dir-"));
	t.after(() => rmSync(ambientRoot, { recursive: true, force: true }));
	const ambientSettingsPath = join(ambientRoot, "settings.json");
	const sentinel = JSON.stringify({ sentinel: true, packages: [LEGACY_SOURCE] }, null, 2) + "\n";
	writeFileSync(ambientSettingsPath, sentinel);

	const previousAgentDir = process.env.PI_CODING_AGENT_DIR;
	process.env.PI_CODING_AGENT_DIR = ambientRoot;
	try {
		const { result } = runCli(t, ["install", "--yes", "--only", "claude-cli"]);
		assertSuccess(result);
	} finally {
		if (previousAgentDir === undefined) delete process.env.PI_CODING_AGENT_DIR;
		else process.env.PI_CODING_AGENT_DIR = previousAgentDir;
	}

	assert.equal(readFileSync(ambientSettingsPath, "utf8"), sentinel);
});

test("Claude CLI catalog uses the reviewed maintained fork release and recognizes the original source", () => {
	const pkg = PACKAGES.find(({ id }) => id === "claude-cli");
	assert.equal(pkg?.source, CURRENT_SOURCE);
	assert.deepEqual(pkg?.legacySources, [LEGACY_SOURCE]);
});

test("Claude CLI docs describe the observer-mode tool boundary consistently", () => {
	const docs = readFileSync("docs/docs/packages/claude-cli.html", "utf8");
	assert.doesNotMatch(docs, /Pi's native tools[^.]*in charge/);
	assert.match(docs, /Claude Code owns its built-in tool loop/);
	assert.match(docs, /These calls run outside Pi tool-call hooks/);
});

test("user-facing docs describe migration and full update behavior", () => {
	for (const path of ["README.md", "docs/docs/index.html", "docs/docs/first-steps.html", "docs/docs/updating.html", "docs/faq.html"]) {
		const content = readFileSync(path, "utf8");
		assert.match(content, /migrat/i, `${path} should describe catalog migration`);
		assert.match(content, /update Pi|Pi itself/i, `${path} should describe updating Pi itself`);
	}
	const help = spawnSync(process.execPath, [CLI_PATH, "--help"], { encoding: "utf8" });
	assertSuccess(help);
	assert.match(help.stdout, /update\s+Migrate catalog sources and update Pi plus installed packages/);
});

test("supported Node version matches current Pi's runtime floor", () => {
	assert.equal(MIN_NODE_VERSION, "22.19.0");
	assert.equal(isSupportedNodeVersion("22.18.9"), false);
	assert.equal(isSupportedNodeVersion("22.19.0-rc.1"), false);
	assert.equal(isSupportedNodeVersion("v22.19.0"), true);
	assert.equal(isSupportedNodeVersion("22.19.1-rc.1"), true);
	assert.equal(isSupportedNodeVersion("22.19.1"), true);
	assert.equal(isSupportedNodeVersion("23.0.0"), true);
	assert.equal(isSupportedNodeVersion("invalid"), false);
});

test("status reports the original package as legacy with an update path", (t) => {
	const { result } = runCli(t, ["status"], { packages: [LEGACY_SOURCE] });
	assertSuccess(result);
	assert.match(result.stdout, /Installed with legacy catalog sources \(1\)/);
	assert.match(result.stdout, /claude-cli\s+npm:pi-claude-cli — run `lazypi update` to migrate/);
	assert.doesNotMatch(result.stdout, new RegExp(`Other Pi packages outside the LazyPi catalog \\(1\\)`));
});

test("maintained-package version variants are reported as requiring migration", (t) => {
	for (const source of [PREVIOUS_CURRENT_SOURCE, UNPINNED_CURRENT_SOURCE]) {
		const { result } = runCli(t, ["status"], { packages: [source] });
		assertSuccess(result);
		assert.match(result.stdout, /Installed with legacy catalog sources \(1\)/);
		assert.match(result.stdout, /claude-cli\s+/);
		assert.ok(result.stdout.includes(`${source} — run \`lazypi update\` to migrate`));
		assert.doesNotMatch(result.stdout, /Other Pi packages outside the LazyPi catalog \(1\)/);
	}
});

test("update reconciles maintained-package variants to the reviewed pin", (t) => {
	const previousEntry = { source: PREVIOUS_CURRENT_SOURCE, autoload: false, extensions: [] };
	const previous = runCli(t, ["update", "--only", "claude-cli"], { packages: [previousEntry] });
	assertSuccess(previous.result);
	assert.deepEqual(previous.calls, [`install ${CURRENT_SOURCE}`, "update --all"]);
	assert.deepEqual(previous.settings.packages, [{ ...previousEntry, source: CURRENT_SOURCE }]);

	const unpinned = runCli(t, ["update", "--only", "claude-cli"], { packages: [UNPINNED_CURRENT_SOURCE] });
	assertSuccess(unpinned.result);
	assert.deepEqual(unpinned.calls, [`install ${CURRENT_SOURCE}`, "update --all"]);
	assert.deepEqual(unpinned.settings.packages, [CURRENT_SOURCE]);
});

test("reviewed-pin reconciliation does not overwrite user pins for unpinned catalog packages", (t) => {
	const status = runCli(t, ["status"], { packages: [USER_PINNED_UNPINNED_CATALOG_SOURCE] });
	assertSuccess(status.result);
	assert.match(status.result.stdout, /Installed with legacy catalog sources \(0\)/);
	assert.match(status.result.stdout, /Other Pi packages outside the LazyPi catalog \(1\)/);

	const update = runCli(t, ["update", "--only", "subagents"], { packages: [USER_PINNED_UNPINNED_CATALOG_SOURCE] });
	assertSuccess(update.result);
	assert.deepEqual(update.calls, ["update --all"]);
	assert.deepEqual(update.settings.packages, [USER_PINNED_UNPINNED_CATALOG_SOURCE]);
});

test("versioned original sources are recognized, migrated, and removable", (t) => {
	const status = runCli(t, ["status"], { packages: [PINNED_LEGACY_SOURCE] });
	assertSuccess(status.result);
	assert.match(status.result.stdout, /Installed with legacy catalog sources \(1\)/);
	assert.doesNotMatch(status.result.stdout, /Other Pi packages outside the LazyPi catalog \(1\)/);

	const update = runCli(t, ["update", "--only", "claude-cli"], { packages: [PINNED_LEGACY_SOURCE] });
	assertSuccess(update.result);
	assert.deepEqual(update.calls, [
		`install ${CURRENT_SOURCE}`,
		`remove ${PINNED_LEGACY_SOURCE}`,
		"update --all",
	]);
	assert.deepEqual(update.settings.packages, [CURRENT_SOURCE]);

	const remove = runCli(t, ["remove", "claude-cli"], { packages: [PINNED_LEGACY_SOURCE] });
	assertSuccess(remove.result);
	assert.deepEqual(remove.calls, [`remove ${PINNED_LEGACY_SOURCE}`]);
	assert.deepEqual(remove.settings.packages, []);
});

test("fresh install uses the maintained fork", (t) => {
	const { result, calls } = runCli(t, ["install", "--yes", "--only", "claude-cli"]);
	assertSuccess(result);
	assert.deepEqual(calls, [`install ${CURRENT_SOURCE}`]);
});

test("install migrates only after the replacement installs successfully", (t) => {
	const { result, calls } = runCli(t, ["install", "--yes", "--only", "claude-cli"], { packages: [LEGACY_SOURCE] });
	assertSuccess(result);
	assert.deepEqual(calls, [
		`install ${CURRENT_SOURCE}`,
		`remove ${LEGACY_SOURCE}`,
	]);
});

test("migration preserves package filters on the replacement", (t) => {
	const legacyEntry = {
		source: LEGACY_SOURCE,
		autoload: false,
		extensions: [],
		themes: ["+themes/custom.json"],
	};
	const { result, settings } = runCli(t, ["install", "--yes", "--only", "claude-cli"], {
		packages: ["./before", legacyEntry, "./after"],
	});
	assertSuccess(result);
	assert.deepEqual(settings.packages, ["./before", { ...legacyEntry, source: CURRENT_SOURCE }, "./after"]);
});

test("migration preserves configured legacy filters when the replacement already exists", (t) => {
	const legacyEntry = {
		source: LEGACY_SOURCE,
		autoload: false,
		extensions: [],
		themes: ["+themes/custom.json"],
	};
	const { result, settings } = runCli(t, ["install", "--yes", "--only", "claude-cli"], {
		packages: [CURRENT_SOURCE, legacyEntry],
	});
	assertSuccess(result);
	assert.deepEqual(settings.packages, [{ ...legacyEntry, source: CURRENT_SOURCE }]);
});

test("migration keeps replacement filters when both sources are configured", (t) => {
	const currentEntry = { source: CURRENT_SOURCE, autoload: false, extensions: ["+index.ts"] };
	const legacyEntry = { source: LEGACY_SOURCE, themes: ["+themes/legacy.json"] };
	const { result, settings } = runCli(t, ["install", "--yes", "--only", "claude-cli"], {
		packages: [legacyEntry, currentEntry],
	});
	assertSuccess(result);
	assert.deepEqual(settings.packages, [currentEntry]);
});

test("identity-changing migration refuses mixed global and project legacy entries", (t) => {
	const projectOverride = { source: LEGACY_SOURCE, autoload: false, extensions: [] };
	const globalMigration = runCli(t, ["update", "--only", "claude-cli"], {
		packages: [LEGACY_SOURCE],
		projectPackages: [projectOverride],
	});
	assert.equal(globalMigration.result.status, 1);
	assert.deepEqual(globalMigration.calls, []);
	assert.deepEqual(globalMigration.settings.packages, [LEGACY_SOURCE]);
	assert.deepEqual(globalMigration.projectSettings.packages, [projectOverride]);
	assert.match(globalMigration.result.stderr, /also configured in project settings/);

	const localMigration = runCli(t, ["update", "--local", "--only", "claude-cli"], {
		packages: [LEGACY_SOURCE],
		projectPackages: [projectOverride],
	});
	assert.equal(localMigration.result.status, 1);
	assert.deepEqual(localMigration.calls, []);
	assert.deepEqual(localMigration.settings.packages, [LEGACY_SOURCE]);
	assert.deepEqual(localMigration.projectSettings.packages, [projectOverride]);
	assert.match(localMigration.result.stderr, /also configured in global settings/);
});

test("same-repository git migration does not remove the replacement", (t) => {
	const { result, calls, settings } = runCli(t, ["install", "--yes", "--only", "autoresearch"], {
		packages: [LEGACY_AUTORESEARCH_SOURCE],
	});
	assertSuccess(result);
	assert.deepEqual(calls, [`install ${CURRENT_AUTORESEARCH_SOURCE}`]);
	assert.deepEqual(settings.packages, [CURRENT_AUTORESEARCH_SOURCE]);
});

test("same-identity current and legacy git entries clean up without uninstalling the replacement", (t) => {
	const legacyEntry = { source: LEGACY_AUTORESEARCH_SOURCE, autoload: false, extensions: [] };
	const migration = runCli(t, ["install", "--yes", "--only", "autoresearch"], {
		packages: ["./before", legacyEntry, CURRENT_AUTORESEARCH_SOURCE, "./after"],
	});
	assertSuccess(migration.result);
	assert.deepEqual(migration.calls, []);
	assert.deepEqual(migration.settings.packages, [
		"./before",
		{ ...legacyEntry, source: CURRENT_AUTORESEARCH_SOURCE },
		"./after",
	]);

	const removal = runCli(t, ["remove", "autoresearch"], {
		packages: [CURRENT_AUTORESEARCH_SOURCE, LEGACY_AUTORESEARCH_SOURCE],
	});
	assertSuccess(removal.result);
	assert.deepEqual(removal.calls, [`remove ${CURRENT_AUTORESEARCH_SOURCE}`]);
	assert.deepEqual(removal.settings.packages, []);
});

test("same-identity cleanup preserves configured entries regardless of order", (t) => {
	const legacyEntry = { source: LEGACY_AUTORESEARCH_SOURCE, autoload: false, extensions: [] };
	const migration = runCli(t, ["install", "--yes", "--only", "autoresearch"], {
		packages: [CURRENT_AUTORESEARCH_SOURCE, legacyEntry],
	});
	assertSuccess(migration.result);
	assert.deepEqual(migration.calls, []);
	assert.deepEqual(migration.settings.packages, [{ ...legacyEntry, source: CURRENT_AUTORESEARCH_SOURCE }]);
});

test("same-identity cleanup keeps current-source filters when duplicate entries conflict", (t) => {
	const currentEntry = { source: CURRENT_AUTORESEARCH_SOURCE, extensions: ["+index.ts"] };
	const legacyEntry = { source: LEGACY_AUTORESEARCH_SOURCE, autoload: false, extensions: [] };
	const migration = runCli(t, ["install", "--yes", "--only", "autoresearch"], {
		packages: [legacyEntry, currentEntry],
	});
	assertSuccess(migration.result);
	assert.deepEqual(migration.settings.packages, [currentEntry]);
});

test("duplicate spellings of one legacy npm package require one removal", (t) => {
	const { result, calls, settings } = runCli(t, ["install", "--yes", "--only", "claude-cli"], {
		packages: [LEGACY_SOURCE, PINNED_LEGACY_SOURCE],
	});
	assertSuccess(result);
	assert.deepEqual(calls, [
		`install ${CURRENT_SOURCE}`,
		`remove ${LEGACY_SOURCE}`,
	]);
	assert.deepEqual(settings.packages, [CURRENT_SOURCE]);
});

test("install cleans up legacy source when replacement already exists", (t) => {
	const { result, calls } = runCli(t, ["install", "--yes", "--only", "claude-cli"], { packages: [CURRENT_SOURCE, LEGACY_SOURCE] });
	assertSuccess(result);
	assert.deepEqual(calls, [`remove ${LEGACY_SOURCE}`]);
});

test("failed replacement install leaves the legacy source untouched", (t) => {
	const { result, calls } = runCli(t, ["install", "--yes", "--only", "claude-cli"], {
		packages: [LEGACY_SOURCE],
		failInstall: CURRENT_SOURCE,
	});
	assert.equal(result.status, 1);
	assert.deepEqual(calls, [`install ${CURRENT_SOURCE}`]);
	assert.match(result.stderr, /failed to install claude-cli/);
});

test("failed legacy removal keeps the replacement available", (t) => {
	const { result, calls, settings } = runCli(t, ["install", "--yes", "--only", "claude-cli"], {
		packages: [LEGACY_SOURCE],
		failRemove: LEGACY_SOURCE,
	});
	assert.equal(result.status, 1);
	assert.deepEqual(calls, [
		`install ${CURRENT_SOURCE}`,
		`remove ${LEGACY_SOURCE}`,
	]);
	assert.deepEqual(settings.packages, [LEGACY_SOURCE, CURRENT_SOURCE]);
	assert.match(result.stderr, /failed to migrate claude-cli/);
});

test("partial legacy removal failure keeps the replacement available", (t) => {
	const { result, calls, settings } = runCli(t, ["install", "--yes", "--only", "claude-cli"], {
		packages: [LEGACY_SOURCE],
		failRemoveAfterMutation: LEGACY_SOURCE,
	});
	assert.equal(result.status, 1);
	assert.deepEqual(calls, [
		`install ${CURRENT_SOURCE}`,
		`remove ${LEGACY_SOURCE}`,
	]);
	assert.deepEqual(settings.packages, [CURRENT_SOURCE]);
	assert.match(result.stderr, /failed to migrate claude-cli/);
});

test("update migrates the original source before updating Pi and extensions", (t) => {
	const { result, calls } = runCli(t, ["update", "--only", "claude-cli"], { packages: [LEGACY_SOURCE] });
	assertSuccess(result);
	assert.deepEqual(calls, [
		`install ${CURRENT_SOURCE}`,
		`remove ${LEGACY_SOURCE}`,
		"update --all",
	]);
});

test("update remains compatible with Pi versions before the all flag", (t) => {
	const { result, calls } = runCli(t, ["update", "--only", "claude-cli"], {
		packages: [CURRENT_SOURCE],
		supportsUpdateAll: false,
	});
	assertSuccess(result);
	assert.deepEqual(calls, ["update"]);
});

test("update stops safely when the replacement cannot be installed", (t) => {
	const { result, calls } = runCli(t, ["update", "--only", "claude-cli"], {
		packages: [LEGACY_SOURCE],
		failInstall: CURRENT_SOURCE,
	});
	assert.equal(result.status, 1);
	assert.deepEqual(calls, [`install ${CURRENT_SOURCE}`]);
	assert.match(result.stderr, /failed to migrate claude-cli/);
});

test("remove by catalog id still removes the installed legacy source", (t) => {
	const { result, calls } = runCli(t, ["remove", "claude-cli"], { packages: [LEGACY_SOURCE] });
	assertSuccess(result);
	assert.deepEqual(calls, [`remove ${LEGACY_SOURCE}`]);
});

function runLocalMigration(t, supportsApprove) {
	const paths = createWorkspace(t);
	const callsPath = join(paths.root, "pi-calls.log");
	writeFileSync(callsPath, "");
	writeFakePi(paths.bin);
	mkdirSync(join(paths.workspace, ".pi"), { recursive: true });
	writeFileSync(join(paths.workspace, ".pi", "settings.json"), JSON.stringify({ packages: [LEGACY_SOURCE] }, null, 2) + "\n");
	const env = {
		...process.env,
		HOME: paths.home,
		USERPROFILE: paths.home,
		PATH: [paths.bin, process.env.PATH].filter(Boolean).join(delimiter),
		PI_CODING_AGENT_DIR: paths.settingsDir,
		PI_TEST_CALLS: callsPath,
		PI_TEST_SUPPORTS_APPROVE: supportsApprove ? "1" : "0",
	};
	for (const key of AUTH_ENV_VARS) delete env[key];
	const result = spawnSync(process.execPath, [CLI_PATH, "update", "--local", "--only", "claude-cli"], {
		cwd: paths.workspace,
		env,
		encoding: "utf8",
		timeout: 60_000,
	});
	if (result.error) throw result.error;
	const calls = readFileSync(callsPath, "utf8").trim().split(/\r?\n/).filter(Boolean);
	return { result, calls };
}

test("local update approves migrations when Pi supports the approval flag", (t) => {
	const { result, calls } = runLocalMigration(t, true);
	assertSuccess(result);
	assert.deepEqual(calls, [
		`install -l --approve ${CURRENT_SOURCE}`,
		`remove -l --approve ${LEGACY_SOURCE}`,
		"update --extensions --approve",
	]);
});

test("local update remains compatible with Pi versions before the approval flag", (t) => {
	const { result, calls } = runLocalMigration(t, false);
	assertSuccess(result);
	assert.deepEqual(calls, [
		`install -l ${CURRENT_SOURCE}`,
		`remove -l ${LEGACY_SOURCE}`,
		"update --extensions",
	]);
});
