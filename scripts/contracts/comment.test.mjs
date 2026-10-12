import assert from "node:assert/strict";
import test from "node:test";
import { commentForChangedFiles } from "./comment.mjs";

const clients = {
  "src/schemas/place.ts": ["PlaceAPIResponse in LocationMap.swift"],
};

test("a place schema change names the Swift client and nothing private", () => {
  const comment = commentForChangedFiles(
    ["src/schemas/place.ts", "README.md"],
    clients,
  );
  assert.match(comment, /PlaceAPIResponse/);
  assert.doesNotMatch(comment, /@|-25\.|userId/);
});

test("an unmapped schema is called out", () => {
  const comment = commentForChangedFiles(["src/schemas/stamp-id.ts"], clients);
  assert.match(comment, /sem cliente Swift mapeado/);
});

test("the fixture and its test point at the place schema, not at themselves", () => {
  const comment = commentForChangedFiles(
    [
      "src/schemas/fixtures/place-nearby.json",
      "src/schemas/place.fixture.vitest.ts",
    ],
    clients,
  );
  assert.match(comment, /src\/schemas\/place\.ts/);
  assert.match(comment, /PlaceAPIResponse/);
  assert.doesNotMatch(comment, /sem cliente Swift mapeado/);
  assert.doesNotMatch(comment, /place-nearby\.json` →/);
});
