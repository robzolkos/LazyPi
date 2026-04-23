import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { buildSpawnOptions, resolveEntrypointUrl } from "../bin/lazypi.mjs";

test("buildSpawnOptions enables shell on Windows by default", () => {
	assert.deepEqual(buildSpawnOptions({ stdio: "inherit" }, "win32"), {
		stdio: "inherit",
		shell: true,
	});
});

test("buildSpawnOptions preserves an explicit shell override on Windows", () => {
	assert.deepEqual(buildSpawnOptions({ stdio: "inherit", shell: false }, "win32"), {
		stdio: "inherit",
		shell: false,
	});
});

test("buildSpawnOptions leaves Unix options unchanged", () => {
	assert.deepEqual(buildSpawnOptions({ stdio: "inherit" }, "linux"), {
		stdio: "inherit",
	});
});

test("resolveEntrypointUrl resolves symlinked bin paths to the module url", () => {
	const tmp = mkdtempSync(join(tmpdir(), "lazypi-entrypoint-"));
	const targetPath = fileURLToPath(new URL("../bin/lazypi.mjs", import.meta.url));
	const symlinkPath = join(tmp, "lazypi");
	symlinkSync(targetPath, symlinkPath);

	assert.equal(resolveEntrypointUrl(targetPath), new URL("../bin/lazypi.mjs", import.meta.url).href);
	assert.equal(resolveEntrypointUrl(symlinkPath), new URL("../bin/lazypi.mjs", import.meta.url).href);
});

test("resolveEntrypointUrl falls back to a resolved path when realpath lookup fails", () => {
	const tmp = mkdtempSync(join(tmpdir(), "lazypi-entrypoint-fallback-"));
	const missingPath = join(tmp, "missing.mjs");
	assert.equal(resolveEntrypointUrl(missingPath), pathToFileURL(missingPath).href);
});
