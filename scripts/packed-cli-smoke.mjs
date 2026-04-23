import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

export function npmExecutable(platformName = process.platform) {
	return platformName === "win32" ? "npm.cmd" : "npm";
}

function run(command, args, options = {}) {
	const result = spawnSync(command, args, { encoding: "utf8", ...options });
	if (result.error) throw result.error;
	return result;
}

function resultSummary(result) {
	return `exit=${result.status ?? "null"}\nSTDOUT:\n${result.stdout ?? ""}\nSTDERR:\n${result.stderr ?? ""}`;
}

export function runPackedCliSmoke({ cwd = process.cwd() } = {}) {
	const npm = npmExecutable();
	const pack = run(npm, ["pack", "--silent"], { cwd });
	assert.equal(pack.status, 0, `npm pack failed\n${resultSummary(pack)}`);

	const tarballName = pack.stdout.trim().split(/\r?\n/).filter(Boolean).at(-1);
	assert.ok(tarballName, `npm pack did not print a tarball name\n${resultSummary(pack)}`);

	const tarballPath = resolve(cwd, tarballName);
	assert.equal(existsSync(tarballPath), true, `packed tarball was not created at ${tarballPath}`);

	try {
		const smoke = run(npm, ["exec", "--yes", `--package=${tarballPath}`, "--call", "lazypi --help"], { cwd });
		assert.equal(smoke.status, 0, `packed CLI smoke failed\n${resultSummary(smoke)}`);
		assert.match(smoke.stdout, /lazypi — opinionated installer for Pi extensions/);
		assert.match(smoke.stdout, /Usage:/);
		return { pack, smoke, tarballPath };
	} finally {
		rmSync(tarballPath, { force: true });
	}
}

const entrypoint = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : null;

if (entrypoint === import.meta.url) {
	const { smoke } = runPackedCliSmoke();
	process.stdout.write(smoke.stdout);
}
