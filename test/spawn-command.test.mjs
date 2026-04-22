import test from "node:test";
import assert from "node:assert/strict";

import { buildSpawnOptions } from "../bin/lazypi.mjs";

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
