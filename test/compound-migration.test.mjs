import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
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

function requireCommand(name) {
	const probe = spawnSync("bash", ["-lc", `command -v ${name}`], { encoding: "utf8" });
	assert.equal(probe.status, 0, `${name} must be available to run the real integration tests`);
}

function createWorkspace() {
	const root = mkdtempSync(join(tmpdir(), "lazypi-real-"));
	const home = join(root, "home");
	const workspace = join(root, "workspace");
	mkdirSync(home, { recursive: true });
	mkdirSync(workspace, { recursive: true });
	return { root, home, workspace };
}

function testEnv(home) {
	const env = { ...process.env, HOME: home };
	for (const key of AUTH_ENV_VARS) delete env[key];
	return env;
}

function runCli(args, { cwd, home, timeout = 600_000 } = {}) {
	const result = spawnSync(process.execPath, [CLI_PATH, ...args], {
		cwd,
		env: testEnv(home),
		encoding: "utf8",
		timeout,
	});
	if (result.error) throw result.error;
	return result;
}

function readJson(path) {
	return JSON.parse(readFileSync(path, "utf8"));
}

function readSettings(workspace) {
	return readJson(join(workspace, ".pi", "settings.json"));
}

function assertSuccess(result, message = "command should succeed") {
	assert.equal(result.status, 0, `${message}\nSTDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`);
}

requireCommand("pi");
requireCommand("bun");

const upstreamVersion = spawnSync("bash", ["-lc", "bunx @every-env/compound-plugin@3.0.0 --help | sed -n '1p'"], { encoding: "utf8", timeout: 180_000 });
assert.equal(upstreamVersion.status, 0, upstreamVersion.stderr || upstreamVersion.stdout);
assert.match(upstreamVersion.stdout, /v3\.0\.0/);

test("fresh CE3 install uses real upstream v3 and reports healthy status", { timeout: 600_000 }, () => {
	const { workspace, home } = createWorkspace();
	const installResult = runCli(["--yes", "--only", "compound", "-l"], { cwd: workspace, home });
	assertSuccess(installResult, "fresh compound install failed");
	assert.match(installResult.stdout, /@every-env\/compound-plugin@3\.0\.0/);

	const manifestPath = join(workspace, ".pi", "compound-engineering", "install-manifest.json");
	assert.equal(existsSync(manifestPath), true);
	assert.equal(existsSync(join(workspace, ".pi", "agents")), true);
	assert.equal(existsSync(join(workspace, ".pi", "skills", "ce-plan", "SKILL.md")), true);
	assert.equal(existsSync(join(workspace, ".pi", "extensions", "compound-engineering-compat.ts")), false);
	assert.equal(existsSync(join(workspace, ".pi", "AGENTS.md")), true);

	const manifest = readJson(manifestPath);
	assert.equal(manifest.pluginName, "compound-engineering");
	assert.ok(Array.isArray(manifest.skills) && manifest.skills.includes("ce-plan"));
	assert.ok(Array.isArray(manifest.agents) && manifest.agents.includes("ce-repo-research-analyst.md"));

	const settings = readSettings(workspace);
	const sources = new Set((settings.packages ?? []).map((entry) => typeof entry === "string" ? entry : entry.source));
	assert.equal(sources.has("npm:pi-subagents"), true);
	assert.equal(sources.has("npm:pi-ask-user"), true);
	assert.equal(sources.has("npm:@every-env/compound-plugin"), false);

	const statusResult = runCli(["status", "-l"], { cwd: workspace, home });
	assertSuccess(statusResult, "status failed after fresh install");
	assert.match(statusResult.stdout, /Installed from LazyPi catalog/);
	assert.match(statusResult.stdout, /compound/);
	assert.doesNotMatch(statusResult.stdout, /legacy LazyPi state detected/);

	const doctorResult = runCli(["doctor", "-l"], { cwd: workspace, home });
	assertSuccess(doctorResult, "doctor failed after fresh install");
	assert.match(doctorResult.stdout, /Compound Engineering manifest found/);
	assert.match(doctorResult.stdout, /Compound Engineering skills directory exists/);
	assert.match(doctorResult.stdout, /Compound Engineering agents directory exists/);
	assert.match(doctorResult.stdout, /pi-subagents installed/);
	assert.match(doctorResult.stdout, /pi-ask-user installed/);
	assert.match(doctorResult.stdout, /No credentials detected/);
	assert.doesNotMatch(doctorResult.stdout, /ce_subagent|compat extension/);
});

test("legacy LazyPi state migrates to CE3 on real update flow", { timeout: 600_000 }, () => {
	const { workspace, home } = createWorkspace();
	mkdirSync(join(workspace, ".pi", ".lazypi"), { recursive: true });
	mkdirSync(join(workspace, ".pi", "extensions"), { recursive: true });
	writeFileSync(join(workspace, ".pi", ".lazypi", "compound-engineering.json"), JSON.stringify({ createdFiles: ["extensions/compound-engineering-compat.ts"] }, null, 2) + "\n");
	writeFileSync(join(workspace, ".pi", "extensions", "compound-engineering-compat.ts"), "legacy compat\n");

	const updateResult = runCli(["update", "-l", "--only", "compound"], { cwd: workspace, home });
	assertSuccess(updateResult, "migration update failed");
	assert.match(updateResult.stdout, /Step 1\/2: reconcile LazyPi catalog/);
	assert.match(updateResult.stdout, /Step 2\/2: pi update/);
	assert.match(updateResult.stdout, /@every-env\/compound-plugin@3\.0\.0/);

	assert.equal(existsSync(join(workspace, ".pi", "compound-engineering", "install-manifest.json")), true);
	assert.equal(existsSync(join(workspace, ".pi", ".lazypi", "compound-engineering.json")), false);
	assert.equal(existsSync(join(workspace, ".pi", "extensions", "compound-engineering-compat.ts")), false);
	assert.equal(existsSync(join(workspace, ".pi", "compound-engineering", "legacy-backup")), true);
});

test("remove compound deletes real CE3 artifacts and backup directory", { timeout: 600_000 }, () => {
	const { workspace, home } = createWorkspace();
	assertSuccess(runCli(["--yes", "--only", "compound", "-l"], { cwd: workspace, home }), "fresh install for removal test failed");
	assert.equal(existsSync(join(workspace, ".pi", "compound-engineering", "install-manifest.json")), true);

	const removeResult = runCli(["remove", "compound", "-l"], { cwd: workspace, home });
	assertSuccess(removeResult, "compound removal failed");

	assert.equal(existsSync(join(workspace, ".pi", "compound-engineering")), false);
	assert.equal(existsSync(join(workspace, ".pi", "agents")), false);
	assert.equal(existsSync(join(workspace, ".pi", "skills", "ce-plan")), false);
	assert.equal(existsSync(join(workspace, ".pi", "AGENTS.md")), false);
	assert.equal(existsSync(join(workspace, ".pi", ".lazypi", "compound-engineering.json")), false);
	assert.equal(existsSync(join(workspace, ".pi", "settings.json")), true);
	assert.equal(existsSync(join(workspace, ".pi", "npm")), true);
});
