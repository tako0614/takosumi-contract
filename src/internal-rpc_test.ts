import assert from "node:assert/strict";
import {
  canonicalTakosInternalRequest,
  encodeActorContext,
  EnvTakosServiceDirectory,
  signTakosInternalRequest,
  TAKOS_INTERNAL_AUDIENCE_HEADER,
  TAKOS_INTERNAL_BODY_DIGEST_HEADER,
  TAKOS_INTERNAL_CALLER_HEADER,
  TAKOS_INTERNAL_CAPABILITIES_HEADER,
  TAKOS_INTERNAL_NONCE_HEADER,
  TAKOS_INTERNAL_PROTOCOL_HEADER,
  TAKOS_INTERNAL_REQUEST_ID_HEADER,
  TAKOS_INTERNAL_RPC_VERSION,
  TAKOS_INTERNAL_SIGNATURE_HEADER,
  type TakosActorContext,
  TakosInternalClient,
  verifyTakosInternalRequestFromHeaders,
} from "./internal-rpc.ts";

const actor: TakosActorContext = {
  actorAccountId: "acct_owner",
  roles: ["owner"],
  requestId: "req_internal",
  principalKind: "account",
  spaceId: "space_1",
};

Deno.test("signTakosInternalRequest emits canonical internal envelope headers", async () => {
  const body = '{"repositoryId":"repo_1"}';
  const signed = await signTakosInternalRequest({
    method: "post",
    path: "/internal/source/resolve",
    query: "?trace=1",
    body,
    timestamp: "2026-05-01T00:00:00.000Z",
    requestId: "req_internal",
    nonce: "nonce_1",
    caller: "takos-app",
    audience: "takos-git",
    capabilities: ["git.repo.read", "git.repo.read"],
    actor,
    secret: "test-secret",
  });

  assert.equal(
    signed.headers[TAKOS_INTERNAL_PROTOCOL_HEADER],
    TAKOS_INTERNAL_RPC_VERSION,
  );
  assert.equal(
    signed.headers[TAKOS_INTERNAL_REQUEST_ID_HEADER],
    "req_internal",
  );
  assert.equal(signed.headers[TAKOS_INTERNAL_NONCE_HEADER], "nonce_1");
  assert.equal(signed.headers[TAKOS_INTERNAL_CALLER_HEADER], "takos-app");
  assert.equal(signed.headers[TAKOS_INTERNAL_AUDIENCE_HEADER], "takos-git");
  assert.equal(
    signed.headers[TAKOS_INTERNAL_CAPABILITIES_HEADER],
    "git.repo.read",
  );
  assert.match(
    signed.headers[TAKOS_INTERNAL_BODY_DIGEST_HEADER],
    /^[0-9a-f]{64}$/,
  );
  assert.match(
    signed.headers[TAKOS_INTERNAL_SIGNATURE_HEADER],
    /^[0-9a-f]{64}$/,
  );
  assert.equal(
    signed.headers["x-takos-actor-context"],
    encodeActorContext(actor),
  );

  const verified = await verifyTakosInternalRequestFromHeaders({
    method: "POST",
    path: "/internal/source/resolve",
    query: "?trace=1",
    body,
    secret: "test-secret",
    headers: new Headers(signed.headers),
    expectedCaller: "takos-app",
    expectedAudience: "takos-git",
    requiredCapabilities: ["git.repo.read"],
    now: () => new Date("2026-05-01T00:01:00.000Z"),
  });

  assert.equal(verified?.actor.actorAccountId, "acct_owner");
  assert.equal(verified?.caller, "takos-app");
  assert.deepEqual(verified?.capabilities, ["git.repo.read"]);
});

Deno.test("verifyTakosInternalRequestFromHeaders rejects tamper and policy mismatch", async () => {
  const signed = await signTakosInternalRequest({
    method: "GET",
    path: "/internal/repositories",
    body: "",
    timestamp: "2026-05-01T00:00:00.000Z",
    caller: "takos-app",
    audience: "takos-git",
    capabilities: ["git.repo.read"],
    actor,
    secret: "test-secret",
  });

  assert.equal(
    await verifyTakosInternalRequestFromHeaders({
      method: "GET",
      path: "/internal/repositories",
      body: "tampered",
      secret: "test-secret",
      headers: new Headers(signed.headers),
      now: () => new Date("2026-05-01T00:01:00.000Z"),
    }),
    undefined,
  );
  assert.equal(
    await verifyTakosInternalRequestFromHeaders({
      method: "GET",
      path: "/internal/repositories",
      body: "",
      secret: "test-secret",
      headers: new Headers(signed.headers),
      expectedAudience: "takos-paas",
      now: () => new Date("2026-05-01T00:01:00.000Z"),
    }),
    undefined,
  );
  assert.equal(
    await verifyTakosInternalRequestFromHeaders({
      method: "GET",
      path: "/internal/repositories",
      body: "",
      secret: "test-secret",
      headers: new Headers(signed.headers),
      requiredCapabilities: ["git.repo.write"],
      now: () => new Date("2026-05-01T00:01:00.000Z"),
    }),
    undefined,
  );
  assert.equal(
    await verifyTakosInternalRequestFromHeaders({
      method: "GET",
      path: "/internal/repositories",
      body: "",
      secret: "test-secret",
      headers: new Headers(signed.headers),
      now: () => new Date("2026-05-01T00:06:00.000Z"),
    }),
    undefined,
  );
});

Deno.test("internal RPC signing verifies binary request bodies", async () => {
  const body = new Uint8Array([0, 255, 1, 2, 128, 10]);
  const signed = await signTakosInternalRequest({
    method: "POST",
    path: "/repo.git/git-receive-pack",
    body,
    timestamp: "2026-05-01T00:00:00.000Z",
    caller: "takos-app",
    audience: "takos-git",
    capabilities: ["git.repo.write"],
    actor,
    secret: "test-secret",
  });

  const verified = await verifyTakosInternalRequestFromHeaders({
    method: "POST",
    path: "/repo.git/git-receive-pack",
    body,
    secret: "test-secret",
    headers: new Headers(signed.headers),
    expectedAudience: "takos-git",
    requiredCapabilities: ["git.repo.write"],
    now: () => new Date("2026-05-01T00:01:00.000Z"),
  });
  assert.equal(verified?.caller, "takos-app");

  const tampered = new Uint8Array(body);
  tampered[1] = 254;
  assert.equal(
    await verifyTakosInternalRequestFromHeaders({
      method: "POST",
      path: "/repo.git/git-receive-pack",
      body: tampered,
      secret: "test-secret",
      headers: new Headers(signed.headers),
      now: () => new Date("2026-05-01T00:01:00.000Z"),
    }),
    undefined,
  );
});

Deno.test("TakosInternalClient signs routed service requests", async () => {
  const calls: Request[] = [];
  const client = new TakosInternalClient({
    caller: "takos-app",
    audience: "takos-git",
    baseUrl: "https://git.internal",
    secret: "test-secret",
    clock: () => new Date("2026-05-01T00:00:00.000Z"),
    fetch: async (input, init) => {
      calls.push(new Request(input, init));
      return Response.json({ ok: true });
    },
  });

  const response = await client.request({
    method: "POST",
    path: "/internal/source/resolve",
    search: "trace=1",
    body: "{}",
    actor,
    capabilities: ["git.ref.resolve"],
  });

  assert.equal(response.status, 200);
  assert.equal(
    calls[0].url,
    "https://git.internal/internal/source/resolve?trace=1",
  );
  assert.equal(calls[0].headers.get(TAKOS_INTERNAL_CALLER_HEADER), "takos-app");
  assert.equal(
    calls[0].headers.get(TAKOS_INTERNAL_AUDIENCE_HEADER),
    "takos-git",
  );
  assert.equal(
    calls[0].headers.get(TAKOS_INTERNAL_CAPABILITIES_HEADER),
    "git.ref.resolve",
  );
});

Deno.test("EnvTakosServiceDirectory resolves canonical local service URLs", () => {
  const directory = new EnvTakosServiceDirectory({
    TAKOS_PAAS_INTERNAL_URL: "https://paas.internal",
    TAKOS_APP_INTERNAL_URL: "https://app.internal",
    TAKOS_GIT_INTERNAL_URL: "https://git.internal",
    TAKOS_AGENT_INTERNAL_URL: "https://agent.internal",
  });

  assert.deepEqual(directory.resolve("takos-paas"), {
    serviceId: "takos-paas",
    audience: "takos-paas",
    url: "https://paas.internal",
  });
  assert.deepEqual(directory.resolve("takos-app"), {
    serviceId: "takos-app",
    audience: "takos-app",
    url: "https://app.internal",
  });
  assert.deepEqual(directory.resolve("takos-git"), {
    serviceId: "takos-git",
    audience: "takos-git",
    url: "https://git.internal",
  });
  assert.equal(directory.resolve("takos-runtime"), undefined);
});

Deno.test("canonicalTakosInternalRequest binds query and digest", () => {
  const canonical = canonicalTakosInternalRequest({
    method: "get",
    path: "/internal/repositories",
    query: "?spaceId=space_1",
    bodyDigest: "digest",
    actorContextHeader: "actor",
    caller: "takos-app",
    audience: "takos-git",
    capabilities: ["git.repo.read"],
    requestId: "req",
    nonce: "nonce",
    timestamp: "2026-05-01T00:00:00.000Z",
  });

  assert.equal(
    canonical,
    [
      TAKOS_INTERNAL_RPC_VERSION,
      "GET",
      "/internal/repositories?spaceId=space_1",
      "2026-05-01T00:00:00.000Z",
      "req",
      "nonce",
      "takos-app",
      "takos-git",
      "git.repo.read",
      "digest",
      "actor",
    ].join("\n"),
  );
});
