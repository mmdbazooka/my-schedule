import assert from "node:assert/strict";
import test from "node:test";
import { newPair, pairCode, parsePair, pull, push, verifyPrivate } from "../src/features/sync/vault";
import { defaults } from "../src/lib/defaults";

test("public repositories are refused before any planner data is uploaded", async (t) => {
  const requests: string[] = [];
  t.mock.method(globalThis, "fetch", async (_url: string, init: RequestInit) => {
    requests.push(init.method ?? "GET");
    return Response.json({ private: false });
  });
  await assert.rejects(verifyPrivate(newPair("example/planner"), "test-token"), /خصوصی/);
  assert.deepEqual(requests, ["GET"]);
});

test("independent links have independent keys and modified snapshots fail authentication", async (t) => {
  const first = newPair("example/private");
  const second = newPair("example/private");
  assert.notEqual(first.id, second.id);
  assert.notEqual(first.key, second.key);
  assert.deepEqual(parsePair(pairCode(first)), first);
  assert.throws(() => parsePair("invalid"));
  const data = defaults();
  const sha = "a".repeat(40);
  let content = "";
  t.mock.method(globalThis, "fetch", async (_url: string, init: RequestInit) => {
    if (init.method === "PUT") {
      content = JSON.parse(String(init.body)).content;
      return Response.json({ content: { sha } });
    }
    return Response.json({ encoding: "base64", content });
  });
  await push(first, "test-token", data);
  assert.deepEqual(await pull(first, "test-token", sha), data);
  await assert.rejects(pull(second, "test-token", sha), /رمزگشایی/);
  const original = content;
  await push(first, "test-token", data, sha);
  assert.notEqual(content, original);
  const altered = Buffer.from(content, "base64");
  altered[altered.length - 1] ^= 1;
  content = altered.toString("base64");
  await assert.rejects(pull(first, "test-token", sha), /رمزگشایی/);
});
