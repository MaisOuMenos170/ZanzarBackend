import assert from "node:assert/strict";
import test from "node:test";
import { formatProbeReport, reportLeaksPrivateData } from "./report.mjs";
import { runProbe } from "./probe-api.mjs";
import { updateProbeIssue } from "./update-issue.mjs";

const placesBody = [
  {
    name: "Parque Barigui",
    place_id: "ChIJsecret",
    geometry: { location: { lat: -25.4284, lng: -49.2733 } },
    photos: [{ photo_reference: "ref-should-stay-out-of-the-issue" }],
  },
];

test("the report names the probe and hides coordinates, emails, and ids", () => {
  const report = formatProbeReport({
    health: { ok: false, status: 503 },
    places: { ok: true, count: 2 },
    photo: { ok: false, status: 502 },
  });
  assert.match(report, /centro de Curitiba/);
  assert.match(report, /HTTP 503/);
  assert.match(report, /2 lugares na amostra/);
  assert.equal(reportLeaksPrivateData(report), false);
});

test("a recorded places payload does not leak into the report", async () => {
  const result = await runProbe("http://probe.test", async (url) => {
    const href = String(url);
    if (href.endsWith("/health")) {
      return jsonResponse({ status: "ok" });
    }
    if (href.includes("/places?")) {
      assert.equal(href.includes("lat="), true);
      return jsonResponse(placesBody);
    }
    assert.equal(String(url).includes("photo_reference"), false);
    assert.equal(String(url).includes("ref-should-stay-out-of-the-issue"), true);
    return {
      ok: true,
      status: 200,
      headers: { get: () => "image/jpeg" },
      json: async () => ({}),
    };
  });
  const report = formatProbeReport(result);
  assert.equal(result.ok, true);
  assert.equal(reportLeaksPrivateData(report), false);
  assert.doesNotMatch(report, /Parque Barigui|ChIJ|ref-should/);
});

test("a healthy run closes the open issue and a failure opens one", async () => {
  const calls = [];
  const run = async (args) => {
    calls.push(args);
    if (args[0] === "issue" && args[1] === "list") {
      return { stdout: calls.length === 1 ? "[]" : '[{"number":7}]' };
    }
    return { stdout: "" };
  };

  assert.equal(await updateProbeIssue("## Sonda da API\n\n- Health: falhou", "failure", run), "opened");
  assert.equal(await updateProbeIssue("## Sonda da API\n\n- Health: ok", "success", run), "closed");
  assert.equal(calls.some((args) => args.includes("user@example.com")), false);
});

function jsonResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => "application/json" },
    json: async () => body,
  };
}
