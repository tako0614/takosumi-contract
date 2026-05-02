import assert from "node:assert/strict";
import {
  canonicalInternalResponse,
  signInternalResponse,
  TAKOS_INTERNAL_REQUEST_ID_HEADER,
  TAKOS_INTERNAL_SIGNATURE_HEADER,
  TAKOS_INTERNAL_TIMESTAMP_HEADER,
  TAKOS_PAAS_INTERNAL_PATHS,
  verifySignedInternalResponseFromHeaders,
} from "./internal-api.ts";

Deno.test("signInternalResponse / verifySignedInternalResponseFromHeaders round trip", async () => {
  const body = '{"deployment":"dep_42","status":"applied"}';
  const path = TAKOS_PAAS_INTERNAL_PATHS.deploymentApply.replace(
    ":deploymentId",
    "dep_42",
  );
  const signed = await signInternalResponse({
    method: "POST",
    path,
    status: 201,
    body,
    timestamp: "2026-04-30T00:00:00.000Z",
    requestId: "req_response_round_trip",
    secret: "shared",
  });

  assert.match(
    signed.headers[TAKOS_INTERNAL_SIGNATURE_HEADER],
    /^[0-9a-f]{64}$/,
  );
  assert.equal(
    signed.headers[TAKOS_INTERNAL_REQUEST_ID_HEADER],
    "req_response_round_trip",
  );
  assert.equal(
    signed.headers[TAKOS_INTERNAL_TIMESTAMP_HEADER],
    "2026-04-30T00:00:00.000Z",
  );

  assert.equal(
    await verifySignedInternalResponseFromHeaders({
      method: "POST",
      path,
      status: 201,
      body,
      secret: "shared",
      headers: new Headers(signed.headers),
      now: () => new Date("2026-04-30T00:00:30.000Z"),
    }),
    true,
  );

  const tamperedBody = body.replace("applied", "rolled-back");
  assert.equal(
    await verifySignedInternalResponseFromHeaders({
      method: "POST",
      path,
      status: 201,
      body: tamperedBody,
      secret: "shared",
      headers: new Headers(signed.headers),
      now: () => new Date("2026-04-30T00:00:30.000Z"),
    }),
    false,
  );
});

Deno.test("canonicalInternalResponse binds method/path/status/body", () => {
  const path = TAKOS_PAAS_INTERNAL_PATHS.deploymentApply.replace(
    ":deploymentId",
    "dep_42",
  );
  const canonical = canonicalInternalResponse({
    method: "post",
    path,
    status: 201,
    body: '{"ok":true}',
    timestamp: "2026-04-30T00:00:00.000Z",
    requestId: "req_canon",
  });
  assert.equal(
    canonical,
    [
      "takos-internal-response-v1",
      "POST",
      path,
      "201",
      "2026-04-30T00:00:00.000Z",
      "req_canon",
      '{"ok":true}',
    ].join("\n"),
  );
});
