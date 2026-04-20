#!/usr/bin/env node
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir, platform } from "node:os";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";
import { argv, cwd, exit, stdout, stderr } from "node:process";
import {
	cancel as clackCancel,
	confirm as clackConfirm,
	groupMultiselect,
	intro,
	isCancel,
	log,
	note,
	outro,
	select,
} from "@clack/prompts";

// ---------------------------------------------------------------------------
// Catalog
// ---------------------------------------------------------------------------
// Categories. LazyPi installs every package by default — "lazy" means you get
// the whole thing without thinking. Use the interactive picker or --only /
// --except to narrow it.
const CATEGORIES = ["core", "ui", "research", "frameworks", "themes"];

const PACKAGES = [
	{ id: "subagents", category: "core", source: "npm:pi-subagents", description: "Sub-agent execution", hint: "Run isolated sub-agents for parallel work." },
	{ id: "mcp", category: "core", source: "npm:pi-mcp-adapter", description: "MCP server integration", hint: "Connect Pi to any MCP-compatible tool server." },
	{ id: "web-access", category: "core", source: "npm:pi-web-access", description: "Web search and page fetch", hint: "Built-in web search and URL fetching." },
	{ id: "memory", category: "core", source: "npm:pi-memory-md", description: "Markdown-backed memory", hint: "Persistent memory stored as Markdown files." },
	{ id: "diff-review", category: "core", source: "git:github.com/badlogic/pi-diff-review@1584211692c49780ecd0f490a82762b0823fd475", description: "Diff review command", hint: "Review diffs inside Pi before accepting changes." },
	{ id: "plan", category: "core", source: "npm:@devkade/pi-plan", description: "/plan command", hint: "Read-only planning mode with approval-based execution." },
	{ id: "simplify", category: "core", source: "npm:pi-simplify", description: "Code simplify review", hint: "Reviews recently changed code for clarity, consistency, and maintainability." },
	{ id: "add-dir", category: "core", source: "npm:pi-add-dir", description: "Add external directories", hint: "Load configs and skills from additional project directories in the same Pi session." },
	{ id: "plannotator", category: "ui", source: "npm:@plannotator/pi-extension", description: "Planning and annotation workflow", hint: "Plan + annotate large changes interactively." },
	{ id: "powerbar", category: "ui", source: "npm:@juanibiapina/pi-powerbar", description: "Powerbar UI", hint: "Status line for Pi with live context." },
	{ id: "extension-settings", category: "ui", source: "npm:@juanibiapina/pi-extension-settings", description: "Settings support for powerbar", hint: "Required by powerbar for its settings panel." },
	{ id: "usage", category: "ui", source: "npm:@tmustier/pi-usage-extension", description: "Usage and cost dashboard", hint: "Track token usage and API cost in-session." },
	{ id: "raw-paste", category: "ui", source: "npm:@tmustier/pi-raw-paste", description: "Raw paste command", hint: "Paste raw clipboard content without Pi re-interpreting it." },
	{ id: "todos", category: "ui", source: "git:github.com/tintinweb/pi-manage-todo-list@b75c449aa85ce328e9a8b632f62bf642aed40359", description: "Todo list management", hint: "Track multi-step work with live progress widget and session persistence." },
	{ id: "btw", category: "ui", source: "npm:pi-btw", description: "Side-chat popover", hint: "Ask quick questions without polluting your conversation history." },
	{ id: "autoresearch", category: "research", source: "git:github.com/davebcn87/pi-autoresearch@5a29db080131449edc6d25a6b351b12879063366", description: "Autonomous experiment loop", hint: "Long-running autonomous research loop." },
	{ id: "ralph-wiggum", category: "research", source: "npm:@tmustier/pi-ralph-wiggum", description: "Ralph Wiggum agent loop", hint: "Long-running iterative dev loops with goals, checklists, and optional self-reflection." },
	{ id: "compound", category: "frameworks", source: "npm:@every-env/compound-plugin", description: "Compound Engineering workflow", hint: "Structured multi-step engineering workflow." },
	{ id: "pi-themes", category: "themes", source: "npm:pi-themes", description: "Theme collection + picker", hint: "10 themes (Catppuccin, Dracula, Gruvbox, Nord, One Dark, Solarized, Tokyo Night) with a /themes picker command." },
	{ id: "hackerman", category: "themes", source: "git:github.com/javierportillo/pi-hackerman@63b0a3ef2c7b14985ffeb6cac44614ba59cd5693", description: "Hackerman theme", hint: "Neon hacker-style color theme ported from the VS Code Hackerman Theme." },
	{ id: "cyber-ui", category: "themes", source: "npm:pi-cyber-ui", description: "Cyber UI theme", hint: "Cyber-inspired dark theme with custom editor, compact footer, and working animation." },
	{ id: "curated-themes", category: "themes", source: "npm:@victor-software-house/pi-curated-themes", description: "65 curated dark themes", hint: "65 dark terminal themes adapted from iTerm2-Color-Schemes." },
	{ id: "terminal-theme", category: "themes", source: "npm:pi-terminal-theme", description: "Terminal ANSI theme", hint: "Maps Pi colors to ANSI 0–15 so Pi inherits your terminal's own color palette." },
];

// ---------------------------------------------------------------------------
// Output helpers
// ---------------------------------------------------------------------------
const isTTY = Boolean(stdout.isTTY);
const c = (code) => (s) => (isTTY ? `\x1b[${code}m${s}\x1b[0m` : String(s));
const bold = c("1");
const dim = c("2");
const red = c("31");
const green = c("32");
const yellow = c("33");
const cyan = c("36");
const blue = c("94");
const white = c("1;97");

function printHeader(text) {
	console.log(`\n${bold(text)}`);
}

// ASCII "Pi" logo: capital P + lowercase i, with a blue "zzz" cascade
// rising from where the dot of the "i" would be. Letters in bold white,
// sleep trail in blue.
function renderLogo() {
	const Z = (s) => blue(s);
	const P = (s) => white(s);
	return [
		"",
		"                 " + Z("z Z z"),
		"                " + Z("z Z"),
		"               " + Z("z"),
		"        " + P("____   "),
		"       " + P("|  _ \\(_)"),
		"       " + P("| |_) | |"),
		"       " + P("|  __/| |"),
		"       " + P("|_|   |_|"),
		"",
	].join("\n");
}

// ---------------------------------------------------------------------------
// Arg parsing
// ---------------------------------------------------------------------------
const KNOWN_COMMANDS = new Set(["install", "status", "update", "doctor", "remove"]);

function parseArgs(args) {
	const flags = {
		command: "install",
		local: false,
		yes: false,
		help: false,
		only: null,
		except: null,
		targets: [],
	};

	let i = 0;
	if (args[0] && KNOWN_COMMANDS.has(args[0])) {
		flags.command = args[0];
		i = 1;
	}

	for (; i < args.length; i++) {
		const arg = args[i];
		if (arg === "-l" || arg === "--local") flags.local = true;
		else if (arg === "-y" || arg === "--yes") flags.yes = true;
		else if (arg === "-h" || arg === "--help") flags.help = true;
		else if (arg === "--only") flags.only = parseList(args[++i]);
		else if (arg.startsWith("--only=")) flags.only = parseList(arg.slice("--only=".length));
		else if (arg === "--except") flags.except = parseList(args[++i]);
		else if (arg.startsWith("--except=")) flags.except = parseList(arg.slice("--except=".length));
		else if (flags.command === "remove" && !arg.startsWith("-")) flags.targets.push(arg);
		else {
			console.error(red(`Unknown argument: ${arg}`));
			flags.help = true;
			break;
		}
	}

	return flags;
}

function parseList(value) {
	if (!value) return [];
	return value
		.split(",")
		.map((s) => s.trim())
		.filter(Boolean);
}

function validateSelectors(list, label) {
	const ids = new Set(PACKAGES.map((p) => p.id));
	const bad = list.filter((name) => !CATEGORIES.includes(name) && !ids.has(name));
	if (bad.length > 0) {
		console.error(red(`Unknown ${label}: ${bad.join(", ")}`));
		console.error(`Valid categories: ${CATEGORIES.join(", ")}`);
		console.error(`Valid package ids:  ${[...ids].join(", ")}`);
		exit(2);
	}
}

function matchesSelector(pkg, selectors) {
	return selectors.some((name) => name === pkg.category || name === pkg.id);
}

function resolveSelection(flags) {
	if (flags.only) {
		validateSelectors(flags.only, "--only");
		return new Set(PACKAGES.filter((p) => matchesSelector(p, flags.only)).map((p) => p.id));
	}
	if (flags.except) {
		validateSelectors(flags.except, "--except");
		return new Set(PACKAGES.filter((p) => !matchesSelector(p, flags.except)).map((p) => p.id));
	}
	return new Set(PACKAGES.map((p) => p.id));
}

// ---------------------------------------------------------------------------
// Help
// ---------------------------------------------------------------------------
function printHelp() {
	console.log(`${bold("lazypi")} — opinionated installer for Pi extensions

${bold("Usage:")}
  npx @robzolkos/lazypi [command] [options]

${bold("Commands:")}
  install   Install the selected LazyPi catalog (default)
  remove    Remove a catalog package by id (or pass a raw pi source)
  status    Show which catalog packages are installed
  update    Re-reconcile the catalog and run \`pi update\`
  doctor    Check your environment for common problems

${bold("Install options:")}
  --only <list>       Install only the given categories or package ids
  --except <list>     Install everything except the given categories or ids
  -l, --local         Install into the current project (.pi/settings.json)
  -y, --yes           Skip the picker and any confirmation prompt
  -h, --help          Show this help

${bold("Default behaviour:")}
  - Every catalog package is installed (lazy on purpose).
  - On a TTY, an interactive picker appears with everything pre-ticked;
    untick categories or packages before confirming.
  - With --yes, --only, or --except the picker is skipped.

${bold("Categories:")}
  core         foundations: sub-agents, MCP, web access, memory, …
  ui           powerbar, usage dashboard, plan-notator, …
  research     autonomous research / experiment loops
  frameworks   structured engineering workflows

${bold("Examples:")}
  npx @robzolkos/lazypi                              # everything (interactive picker on a TTY)
  npx @robzolkos/lazypi --yes                        # everything, no prompt
  npx @robzolkos/lazypi --only core                  # just the core category
  npx @robzolkos/lazypi --only subagents,mcp         # individual package ids also work
  npx @robzolkos/lazypi --only core --local          # core into the current project
  npx @robzolkos/lazypi status
  npx @robzolkos/lazypi doctor`);
}

// ---------------------------------------------------------------------------
// Pi / settings plumbing
// ---------------------------------------------------------------------------
function hasCmd(name) {
	const probe = spawnSync(platform() === "win32" ? "where" : "which", [name], { stdio: "ignore" });
	return probe.status === 0;
}

function settingsPath(local) {
	return local ? join(cwd(), ".pi", "settings.json") : join(homedir(), ".pi", "agent", "settings.json");
}

// Builtin pi-subagents agents that hardcode a specific model — blank them out
// so they fall back to the user's active session model instead.
const SUBAGENT_BUILTIN_MODELS = ["context-builder", "planner", "researcher", "reviewer", "scout", "worker"];

function readSettings(local) {
	const path = settingsPath(local);
	if (!existsSync(path)) return { path, exists: false, parsed: null, error: null };
	try {
		return { path, exists: true, parsed: JSON.parse(readFileSync(path, "utf8")), error: null };
	} catch (err) {
		return { path, exists: true, parsed: null, error: err instanceof Error ? err.message : String(err) };
	}
}

function backupPath(path) {
	const timestamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
	return `${path}.lazypi.${timestamp}.bak`;
}

function writeSubagentOverrides(local) {
	const current = readSettings(local);
	if (current.error) return { ok: false, path: current.path, error: current.error };
	const settings = current.parsed ?? {};
	const overrides = {};
	for (const name of SUBAGENT_BUILTIN_MODELS) overrides[name] = { model: "" };
	settings.subagents = { ...(settings.subagents ?? {}), agentOverrides: { ...(settings.subagents?.agentOverrides ?? {}), ...overrides } };
	mkdirSync(dirname(current.path), { recursive: true });
	let backup = null;
	if (current.exists) {
		backup = backupPath(current.path);
		copyFileSync(current.path, backup);
	}
	writeFileSync(current.path, JSON.stringify(settings, null, 2) + "\n", "utf8");
	return { ok: true, path: current.path, backup };
}

function readInstalledSources(local) {
	const current = readSettings(local);
	if (!current.exists) return { sources: new Set(), path: current.path, exists: false };
	if (current.error) return { sources: new Set(), path: current.path, exists: true, error: current.error };
	const sources = new Set();
	for (const entry of current.parsed?.packages ?? []) {
		if (typeof entry === "string") sources.add(entry);
		else if (entry && typeof entry === "object" && typeof entry.source === "string") sources.add(entry.source);
	}
	return { sources, path: current.path, exists: true };
}

const DIFF_REVIEW_RELATIVE_DIR = join("git", "github.com", "badlogic", "pi-diff-review");
const DIFF_REVIEW_GLIMPSE_FILE = join("node_modules", "glimpseui", "src", "chromium-backend.mjs");

function diffReviewInstallDirs(local) {
	return local
		? [
			join(cwd(), ".pi", DIFF_REVIEW_RELATIVE_DIR),
			join(cwd(), ".pi", "agent", DIFF_REVIEW_RELATIVE_DIR),
		]
		: [join(homedir(), ".pi", "agent", DIFF_REVIEW_RELATIVE_DIR)];
}

function findInstalledDiffReviewDir(local) {
	return diffReviewInstallDirs(local).find((dir) => existsSync(join(dir, "package.json"))) ?? null;
}

function diffReviewNeedsRepair(local) {
	const dir = findInstalledDiffReviewDir(local);
	if (dir == null) return { needsRepair: false, dir: null, reason: null };
	const chromiumBackend = join(dir, DIFF_REVIEW_GLIMPSE_FILE);
	if (existsSync(chromiumBackend)) return { needsRepair: false, dir, reason: null };
	const lockPath = join(dir, "package-lock.json");
	if (existsSync(lockPath)) {
		try {
			const lockText = readFileSync(lockPath, "utf8");
			if (lockText.includes("glimpseui-0.6.0.tgz")) {
				return { needsRepair: true, dir, reason: "package-lock pins broken glimpseui@0.6.0" };
			}
		} catch {}
	}
	return { needsRepair: true, dir, reason: `missing ${DIFF_REVIEW_GLIMPSE_FILE}` };
}

function repairDiffReview(local, interactive = false) {
	const state = diffReviewNeedsRepair(local);
	if (!state.needsRepair || state.dir == null) return 0;
	const prefix = interactive ? "" : "  ";
	console.log(`${prefix}${yellow(`Repairing diff-review (${state.reason})`)}`);
	const result = spawnSync("npm", ["install", "--no-save", "--ignore-scripts", "glimpseui@0.6.2"], {
		cwd: state.dir,
		stdio: "inherit",
	});
	if (result.status !== 0) return result.status ?? 1;
	return existsSync(join(state.dir, DIFF_REVIEW_GLIMPSE_FILE)) ? 0 : 1;
}

function runPi(args) {
	const result = spawnSync("pi", args, { stdio: "inherit" });
	return result.status ?? 1;
}

function isPackageInstalled(pkg, installedPiSources) {
	return installedPiSources.has(pkg.source);
}

// ---------------------------------------------------------------------------
// Pi / settings plumbing (shared helpers)
// ---------------------------------------------------------------------------
function readJsonSafe(path) {
	try {
		if (!existsSync(path)) return null;
		return JSON.parse(readFileSync(path, "utf8"));
	} catch {
		return null;
	}
}

// ---------------------------------------------------------------------------
// Auth detection (read-only)
// ---------------------------------------------------------------------------
// Pi reads credentials from ~/.pi/agent/auth.json and also honors provider
// env vars. LazyPi never writes credentials itself — we just report what's
// there so the user knows whether to run `pi /login` first.
const AUTH_ENV_VARS = [
	["ANTHROPIC_API_KEY", "anthropic"],
	["OPENAI_API_KEY", "openai"],
	["GOOGLE_API_KEY", "google"],
	["GEMINI_API_KEY", "google"],
	["OPENROUTER_API_KEY", "openrouter"],
	["TOGETHER_API_KEY", "together"],
	["GROQ_API_KEY", "groq"],
	["MISTRAL_API_KEY", "mistral"],
];

function authJsonPath() {
	return join(homedir(), ".pi", "agent", "auth.json");
}

function detectAuth() {
	const envProviders = new Map(); // provider -> env var name
	for (const [name, provider] of AUTH_ENV_VARS) {
		if (process.env[name] && !envProviders.has(provider)) envProviders.set(provider, name);
	}
	const auth = readJsonSafe(authJsonPath()) ?? {};
	const fileProviders = Object.keys(auth);
	return {
		envProviders: [...envProviders.entries()].map(([provider, envVar]) => ({ provider, envVar })),
		fileProviders,
		path: authJsonPath(),
		authed: envProviders.size > 0 || fileProviders.length > 0,
	};
}

function formatAuthSummary(state) {
	const bits = [];
	for (const { provider, envVar } of state.envProviders) bits.push(`${provider} (${envVar})`);
	for (const provider of state.fileProviders) bits.push(`${provider} (auth.json)`);
	return bits.length > 0 ? bits.join(", ") : "none detected";
}

// ---------------------------------------------------------------------------
// Interactive prompts (powered by @clack/prompts)
// ---------------------------------------------------------------------------
function isInteractive() {
	return Boolean(process.stdin.isTTY && process.stdout.isTTY);
}

function abortIfCancelled(value) {
	if (isCancel(value)) {
		clackCancel("Aborted.");
		exit(0);
	}
	return value;
}

async function confirm(message, initial = false) {
	const answer = await clackConfirm({ message, initialValue: initial });
	return abortIfCancelled(answer);
}

async function askLazyOrPick(totalCount) {
	const options = [
		{ value: "lazy", label: `Install everything`, hint: `all ${totalCount} packages` },
		{ value: "pick", label: "Pick packages", hint: "open a checklist" },
	];

	const choice = await select({
		message: `Install all ${totalCount} Pi packages the lazy way, or pick them yourself?`,
		options,
		initialValue: "lazy",
	});
	return abortIfCancelled(choice);
}

async function runPicker(initialSelected) {
	const idWidth = Math.max(...PACKAGES.map((p) => p.id.length));
	const options = {};
	for (const cat of CATEGORIES) {
		const pkgs = PACKAGES.filter((p) => p.category === cat);
		if (pkgs.length === 0) continue;
		options[cat] = pkgs.map((pkg) => ({
			value: pkg.id,
			label: `${pkg.id.padEnd(idWidth + 2)}${pkg.description}`,
		}));
	}

	const picked = await groupMultiselect({
		message: "Pick packages to install",
		options,
		initialValues: [...initialSelected],
		required: false,
		selectableGroups: true,
	});
	abortIfCancelled(picked);
	return new Set(picked);
}

// ---------------------------------------------------------------------------
// Ensure Pi is present (offer to install)
// ---------------------------------------------------------------------------
async function ensurePi(flags) {
	if (hasCmd("pi")) return true;

	log.warn("Could not find the `pi` command on PATH.");
	const ok = flags.yes || (await confirm("Install Pi now with `npm install -g @mariozechner/pi-coding-agent`?", true));
	if (!ok) {
		log.error("Install Pi first, then re-run `npx @robzolkos/lazypi`.");
		return false;
	}

	log.step("Installing Pi via `npm install -g @mariozechner/pi-coding-agent`");
	const code = spawnSync("npm", ["install", "-g", "@mariozechner/pi-coding-agent"], { stdio: "inherit" }).status;
	if (code !== 0) {
		log.error("Failed to install Pi. On some systems a global npm install needs sudo:\n  sudo npm install -g @mariozechner/pi-coding-agent");
		return false;
	}

	if (!hasCmd("pi")) {
		log.error("Installed Pi, but `pi` is still not on PATH. Open a new shell and re-run `npx @robzolkos/lazypi`.");
		return false;
	}
	return true;
}

// ---------------------------------------------------------------------------
// install
// ---------------------------------------------------------------------------
async function cmdInstall(flags) {
	let selectedIds = resolveSelection(flags);

	const usedSelectionFlag = Boolean(flags.only || flags.except);
	const interactive = !flags.yes && !usedSelectionFlag && isInteractive();

	if (interactive) {
		console.log(renderLogo());
		intro(bold("LazyPi"));
	}
	if (!(await ensurePi(flags))) return 127;

	if (interactive) {
		const choice = await askLazyOrPick(PACKAGES.length);
		if (choice === "pick") {
			selectedIds = await runPicker(selectedIds);
		}
	}

	const selected = PACKAGES.filter((p) => selectedIds.has(p.id));
	if (selected.length === 0) {
		if (interactive) outro("Nothing selected — nothing to install.");
		else console.log(yellow("Nothing selected — nothing to install."));
		return 0;
	}

	const { sources: installedSources, error: settingsError } = readInstalledSources(flags.local);
	if (settingsError) log.warn(`Could not parse ${settingsPath(flags.local)} — ${settingsError}`);

	const toInstall = selected.filter((p) => !isPackageInstalled(p, installedSources));
	const alreadyInstalled = selected.filter((p) => isPackageInstalled(p, installedSources));
	const scope = flags.local ? "project (.pi/settings.json)" : "global (~/.pi/agent/settings.json)";

	const preInstallAuth = detectAuth();
	const summary = [
		`Target:            ${scope}`,
		`Selected:          ${selected.length}/${PACKAGES.length}`,
		`Already installed: ${alreadyInstalled.length}`,
		`Will install:      ${toInstall.length}`,
		`Pi credentials:    ${formatAuthSummary(preInstallAuth)}`,
	].join("\n");
	if (interactive) note(summary, "Plan");
	else console.log(summary);

	if (selected.some((p) => p.id === "subagents")) {
		const overrideResult = writeSubagentOverrides(flags.local);
		if (!overrideResult.ok) {
			const message = `Refusing to update ${overrideResult.path} because it is not valid JSON (${overrideResult.error}). Fix the file first, then rerun lazypi.`;
			if (interactive) {
				log.error(message);
				outro(red("Aborted."));
			} else {
				console.error(red(message));
			}
			return 2;
		}
	}

	if (toInstall.length === 0) {
		printCheatsheet(selected, interactive);
		const done = "Nothing to do — every selected package is already installed.";
		if (interactive) log.success(green(done));
		else console.log(green(done));
		const authState = detectAuth();
		printNextSteps(authState, 0, interactive);
		return 0;
	}

	const piArgs = flags.local ? ["install", "-l"] : ["install"];
	const failed = [];

	for (const pkg of toInstall) {
		const action = `pi install ${pkg.source}`;
		if (interactive) log.step(action);
		else console.log(`\n→ ${action}`);
		const env = pkg.source.startsWith("git:")
			? { ...process.env, npm_config_ignore_scripts: "true" }
			: process.env;
		const installStatus = spawnSync("pi", [...piArgs, pkg.source], { stdio: "inherit", env }).status;
		const repairStatus = installStatus === 0 && pkg.id === "diff-review"
			? repairDiffReview(flags.local, interactive)
			: 0;
		const status = installStatus === 0 ? repairStatus : installStatus;
		if (status !== 0) {
			failed.push(pkg);
			if (interactive) log.error(`failed to install ${pkg.id}`);
			else console.error(red(`  ✗ failed to install ${pkg.id}`));
		}
	}

	if (failed.length === 0) {
		printCheatsheet(selected, interactive);
		const authState = detectAuth();
		printNextSteps(authState, toInstall.length, interactive);
		return 0;
	}

	const failureList = failed.map((p) => `- ${p.id} (${p.source})`).join("\n");
	if (interactive) {
		note(failureList, "Failures");
		outro(red(`Finished with ${failed.length} failure(s).`));
	} else {
		console.error(red(`\nLazyPi finished with ${failed.length} failure(s):`));
		console.error(failureList);
	}
	return 1;
}

function printNextSteps(state, installedCount, interactive) {
	const lines = [];
	if (state.authed) {
		lines.push(`Pi credentials: ${formatAuthSummary(state)}`);
		lines.push("");
		lines.push("You're all set. Run `pi` to get started.");
	} else {
		lines.push("Pi credentials: none detected.");
		lines.push("");
		lines.push("Run `pi`, then type `/login` inside Pi to sign in with a");
		lines.push("subscription (Claude Pro/Max, ChatGPT Plus/Pro, Copilot, Gemini)");
		lines.push("or set a provider env var (ANTHROPIC_API_KEY, OPENAI_API_KEY, …)");
		lines.push("before launching pi.");
	}

	const title = installedCount > 0
		? `Installed ${installedCount} package(s) — next steps`
		: "Next steps";
	const body = lines.join("\n");
	if (interactive) {
		note(body, title);
		outro(green("Done."));
	} else {
		printHeader(title + ":");
		console.log(body);
	}
}

function printCheatsheet(selected, interactive) {
	if (selected.length === 0) return;
	const lines = selected.map((p) => `${p.id.padEnd(20)} ${p.hint}`);
	if (interactive) note(lines.join("\n"), "What you've got");
	else {
		printHeader("What you've got:");
		for (const line of lines) console.log(`  ${line}`);
		console.log(dim("\nRemove pi packages with `pi remove <source>`."));
	}
}

// ---------------------------------------------------------------------------
// status
// ---------------------------------------------------------------------------
function cmdStatus(flags) {
	const { sources, path, exists, error } = readInstalledSources(flags.local);
	console.log(`Settings file: ${bold(path)}`);
	if (!exists) {
		console.log(yellow("  (not found — Pi has not written settings yet)"));
	} else if (error) {
		console.error(red(`  could not parse: ${error}`));
		return 1;
	}

	const piCatalogSources = new Set(PACKAGES.map((p) => p.source));
	const installed = PACKAGES.filter((p) => isPackageInstalled(p, sources));
	const missing = PACKAGES.filter((p) => !isPackageInstalled(p, sources));
	const others = [...sources].filter((src) => !piCatalogSources.has(src));

	printHeader(`Installed from LazyPi catalog (${installed.length}/${PACKAGES.length}):`);
	if (installed.length === 0) console.log(dim("  none"));
	for (const pkg of installed) {
		console.log(`  ${green("✓")} [${pkg.category}] ${pkg.id.padEnd(20)} ${dim(pkg.source)}`);
	}

	printHeader(`Missing from LazyPi catalog (${missing.length}):`);
	if (missing.length === 0) console.log(dim("  none — full catalog is installed"));
	for (const pkg of missing) {
		console.log(`  ${dim("·")} [${pkg.category}] ${pkg.id.padEnd(20)} ${dim(pkg.source)}`);
	}

	printHeader(`Other Pi packages outside the LazyPi catalog (${others.length}):`);
	if (others.length === 0) console.log(dim("  none"));
	for (const src of others) console.log(`  ${cyan("·")} ${src}`);

	return 0;
}

// ---------------------------------------------------------------------------
// update
// ---------------------------------------------------------------------------
async function cmdUpdate(flags) {
	if (!(await ensurePi(flags))) return 127;

	console.log(bold("Step 1/2: reconcile LazyPi catalog"));
	const installCode = await cmdInstall({ ...flags, command: "install", yes: true });
	if (installCode !== 0) return installCode;

	console.log(bold("\nStep 2/2: pi update"));
	const piUpdateCode = runPi(flags.local ? ["update", "-l"] : ["update"]);
	return piUpdateCode === 0 ? repairDiffReview(flags.local, false) : piUpdateCode;
}

// ---------------------------------------------------------------------------
// doctor
// ---------------------------------------------------------------------------
function cmdDoctor(flags) {
	let problems = 0;
	const pass = (msg) => console.log(`  ${green("✓")} ${msg}`);
	const warn = (msg) => {
		console.log(`  ${yellow("!")} ${msg}`);
		problems++;
	};
	const fail = (msg) => {
		console.log(`  ${red("✗")} ${msg}`);
		problems++;
	};

	printHeader("Environment");
	const nodeMajor = Number(process.versions.node.split(".")[0]);
	if (Number.isFinite(nodeMajor) && nodeMajor >= 18) pass(`Node ${process.versions.node}`);
	else fail(`Node ${process.versions.node} — LazyPi requires Node >= 18`);

	if (hasCmd("npm")) pass("npm is on PATH");
	else fail("npm is not on PATH — LazyPi can't install Pi for you");

	if (hasCmd("git")) pass("git is on PATH");
	else warn("git is not on PATH — required by git-based catalog packages");

	printHeader("Pi");
	if (hasCmd("pi")) {
		pass("`pi` is on PATH");
		const v = spawnSync("pi", ["--version"], { encoding: "utf8" });
		const vout = (v.stdout ?? "").trim() || (v.stderr ?? "").trim();
		if (vout) pass(`pi --version: ${vout}`);
		else warn("Could not read `pi --version` output");
	} else {
		fail("`pi` is not on PATH — run `npx @robzolkos/lazypi` to install it");
	}

	printHeader("Settings");
	const { sources, path, exists, error } = readInstalledSources(flags.local);
	if (!exists) warn(`${path} does not exist yet (Pi has not been run)`);
	else if (error) fail(`${path} is not valid JSON — ${error}`);
	else pass(`${path} is readable`);

	printHeader("Catalog package health");
	if (sources.has(PACKAGES.find((p) => p.id === "diff-review")?.source)) {
		const diffReview = diffReviewNeedsRepair(flags.local);
		if (diffReview.needsRepair && diffReview.dir) {
			fail(`diff-review is installed but broken in ${diffReview.dir} — ${diffReview.reason}`);
			console.log(`    fix: rerun ${bold("npx @robzolkos/lazypi update")} or ${bold(`(cd \"${diffReview.dir}\" && npm install --no-save --ignore-scripts glimpseui@0.6.2)`)}`);
		} else {
			pass("diff-review runtime dependency looks healthy");
		}
	} else {
		console.log(`  ${dim("·")} diff-review not installed`);
	}

	printHeader("Auth");
	const auth = detectAuth();
	for (const { provider, envVar } of auth.envProviders) pass(`env var ${envVar} → ${provider}`);
	if (auth.fileProviders.length > 0) pass(`${auth.path} → ${auth.fileProviders.join(", ")}`);
	if (!auth.authed) warn("No credentials detected — run `pi` then `/login`, or export a provider API key");

	console.log("");
	if (problems === 0) {
		console.log(green("All checks passed."));
		return 0;
	}
	console.log(yellow(`${problems} problem(s) found.`));
	return 1;
}

// ---------------------------------------------------------------------------
// remove
// ---------------------------------------------------------------------------
async function cmdRemove(flags, targets) {
	if (targets.length === 0) {
		if (!isInteractive()) {
			console.error(red("Usage: npx @robzolkos/lazypi remove <id|source> [...]"));
			return 2;
		}
		const { sources } = readInstalledSources(flags.local);
		const installedPkgs = PACKAGES.filter((p) => isPackageInstalled(p, sources));
		if (installedPkgs.length === 0) {
			console.log(yellow("No catalog packages are installed."));
			return 0;
		}
		const idWidth = Math.max(...installedPkgs.map((p) => p.id.length));
		const { multiselect } = await import("@clack/prompts");
		const picked = await multiselect({
			message: "Select packages to remove",
			options: installedPkgs.map((p) => ({
				value: p.id,
				label: `${p.id.padEnd(idWidth + 2)}${p.description}`,
			})),
			required: false,
		});
		abortIfCancelled(picked);
		if (!picked.length) {
			console.log(yellow("Nothing selected."));
			return 0;
		}
		targets = picked;
	}

	let exitCode = 0;
	for (const target of targets) {
		// Resolve a catalog id to its source string, or pass through raw sources
		const pkg = PACKAGES.find((p) => p.id === target);
		const source = pkg ? pkg.source : target;

		const piArgs = flags.local ? ["remove", "-l", source] : ["remove", source];
		const result = spawnSync("pi", piArgs, { stdio: "inherit" });
		if (result.status !== 0) {
			console.error(red(`Failed to remove ${target}`));
			exitCode = 1;
		}
	}
	return exitCode;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
	const flags = parseArgs(argv.slice(2));
	if (flags.help) {
		printHelp();
		return 0;
	}
	switch (flags.command) {
		case "install":
			return cmdInstall(flags);
		case "status":
			return cmdStatus(flags);
		case "update":
			return cmdUpdate(flags);
		case "doctor":
			return cmdDoctor(flags);
		case "remove":
			return cmdRemove(flags, flags.targets);
		default:
			printHelp();
			return 2;
	}
}

main().then((code) => exit(code ?? 0)).catch((err) => {
	stderr.write(`${err?.stack || err}\n`);
	exit(1);
});
