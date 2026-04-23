#!/usr/bin/env node
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { PACKAGES } from "../bin/lazypi.mjs";

const COMPOUND_ID = "compound";

export function packageSourcesFromSettings(settings) {
	return new Set(
		(settings?.packages ?? [])
			.map((entry) => typeof entry === "string" ? entry : entry?.source)
			.filter(Boolean),
	);
}

export function expectedPackageSources({ except = [] } = {}) {
	const excluded = new Set(except);
	return PACKAGES
		.filter((pkg) => !excluded.has(pkg.id))
		.filter((pkg) => pkg.id !== COMPOUND_ID)
		.map((pkg) => pkg.source);
}

function parseArgs(args) {
	const flags = {
		except: [],
		checkStatus: false,
		settingsPath: join(homedir(), ".pi", "agent", "settings.json"),
	};

	for (let i = 0; i < args.length; i++) {
		const arg = args[i];
		if (arg === "--check-status") flags.checkStatus = true;
		else if (arg === "--except") flags.except = parseList(args[++i]);
		else if (arg.startsWith("--except=")) flags.except = parseList(arg.slice("--except=".length));
		else if (arg === "--settings") flags.settingsPath = args[++i];
		else if (arg.startsWith("--settings=")) flags.settingsPath = arg.slice("--settings=".length);
		else throw new Error(`Unknown argument: ${arg}`);
	}

	return flags;
}

function parseList(value) {
	if (!value) return [];
	return value.split(",").map((entry) => entry.trim()).filter(Boolean);
}

function assertStatusCount(expectedCount) {
	const statusOutput = execFileSync("node", ["bin/lazypi.mjs", "status"], {
		encoding: "utf8",
		stdio: ["ignore", "pipe", "pipe"],
	});
	const expectedLine = `Installed from LazyPi catalog (${expectedCount}/${PACKAGES.length}):`;
	assert.match(statusOutput, new RegExp(expectedLine.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
}

export function main() {
	const flags = parseArgs(process.argv.slice(2));
	if (!existsSync(flags.settingsPath)) {
		throw new Error(`settings.json was not created at ${flags.settingsPath}`);
	}

	const settings = JSON.parse(readFileSync(flags.settingsPath, "utf8"));
	const actualSources = packageSourcesFromSettings(settings);
	const expectedSources = expectedPackageSources({ except: flags.except });
	const expectedSourceSet = new Set(expectedSources);
	const missing = expectedSources.filter((source) => !actualSources.has(source));
	const unexpected = [...actualSources].filter((source) => !expectedSourceSet.has(source));

	assert.deepEqual(missing, [], `Missing package sources in settings.json: ${missing.join(", ")}`);
	assert.deepEqual(unexpected, [], `Unexpected package sources in settings.json: ${unexpected.join(", ")}`);

	if (flags.checkStatus) {
		const expectedCatalogCount = PACKAGES.filter((pkg) => !flags.except.includes(pkg.id)).length;
		assertStatusCount(expectedCatalogCount);
	}

	console.log(`Verified ${expectedSources.length} expected package source(s) in ${flags.settingsPath}.`);
}

const entrypoint = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : null;

if (entrypoint === import.meta.url) main();
