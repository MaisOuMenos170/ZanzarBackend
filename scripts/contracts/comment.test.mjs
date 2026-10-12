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
