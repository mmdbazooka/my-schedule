import assert from "node:assert/strict";
import test from "node:test";
import { validateData } from "../src/features/backup/schema";
import { mergePlanner } from "../src/features/sync/merge";
import { defaults } from "../src/lib/defaults";
import type { Note } from "../src/types/planner";

const note = (id: string, body = id): Note => ({
  id, title: id, body, updatedAt: "2026-11-26T10:00:00Z",
});

test("merges independent changes and applies a deletion only if the other device kept the common version", () => {
  const initial = { ...defaults(), notes: [note("removed"), note("shared")] };
  const remote = structuredClone(initial);
  const local = structuredClone(initial);
  local.notes = [note("shared"), note("local")];
  remote.notes = [note("removed"), note("shared", "changed"), note("remote")];
  remote.settings.theme = "dark";
  local.settings.buffer = 15;
  const result = mergePlanner(local, remote, initial);
  assert.deepEqual(result.conflicts, []);
  assert.deepEqual(result.data.notes.map(({ id }) => id).sort(), ["local", "remote", "shared"]);
  assert.equal(result.data.notes[0].body, "changed");
  assert.equal(result.data.settings.theme, "dark");
  assert.equal(result.data.settings.buffer, 15);
  validateData(result.data);
});

test("merges a separate title and body edit and asks about competing text or delete-versus-edit", () => {
  const initial = { ...defaults(), notes: [note("shared"), note("deleted")] };
  const local = { ...initial, notes: [{ ...note("shared"), title: "Local title" }] };
  const remote = { ...initial, notes: [note("shared", "Remote body"), note("deleted", "Edited")] };
  const first = mergePlanner(local, remote, initial);
  assert.deepEqual(first.data.notes[0], { ...note("shared", "Remote body"), title: "Local title" });
  assert.deepEqual(first.conflicts.map(({ key }) => key), ["notes:deleted"]);
  const changed = { ...local, notes: [note("shared", "Local body")] };
  const second = mergePlanner(changed, remote, initial, {
    "notes:deleted": { side: "remote" },
    "notes:shared": { side: "both", copyId: "copy" },
  });
  assert.deepEqual(second.data.notes.map(({ id, body }) => [id, body]), [
    ["shared", "Local body"], ["deleted", "Edited"], ["copy", "Remote body"],
  ]);
  validateData(second.data);
});

test("a missing shared version conservatively keeps entries present on only one device", () => {
  const local = { ...defaults(), notes: [note("local"), note("shared", "one")] };
  const remote = { ...defaults(), notes: [note("remote"), note("shared", "two")] };
  const result = mergePlanner(local, remote, null);
  assert.deepEqual(result.data.notes.map(({ id }) => id).sort(), ["local", "remote", "shared"]);
  assert.deepEqual(result.conflicts.map(({ key }) => key), ["notes:shared"]);
});
