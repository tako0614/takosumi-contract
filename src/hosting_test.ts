import assert from "node:assert/strict";
import {
  assertHostingTargetId,
  assertTakosDistributionManifest,
  assertTakosServiceId,
  getHostingTargetSchema,
  HOSTING_TARGET_IDS,
  type HostingTargetId,
  type HostingTargetSchema,
  isHostingTargetId,
  isTakosDistributionManifest,
  isTakosServiceId,
  KNOWN_HOSTING_TARGET_IDS,
  listHostingTargetIds,
  missingTakosServiceIds,
  normalizeHostingTargetId,
  registerHostingTarget,
  TAKOS_DISTRIBUTION_MANIFEST_API_VERSION,
  TAKOS_DISTRIBUTION_MANIFEST_KIND,
  TAKOS_SERVICE_IDS,
  type TakosDistributionManifest,
  type TakosDistributionTarget,
  type TakosServiceRuntime,
  unregisterHostingTarget,
  validateTakosDistributionManifest,
} from "./hosting.ts";
import {
  assertTakosDistributionManifest as exportedAssertTakosDistributionManifest,
  type HostingTargetId as ExportedHostingTargetId,
  type TakosServiceId as ExportedTakosServiceId,
} from "./index.ts";

Deno.test("hosting target and service id helpers expose canonical ids", () => {
  assert.deepEqual([...HOSTING_TARGET_IDS], [
    "cloudflare",
    "aws",
    "gcp",
    "kubernetes",
    "selfhosted",
  ]);
  assert.deepEqual([...TAKOS_SERVICE_IDS], [
    "takos-app",
    "takos-paas",
    "takos-git",
    "takos-agent",
  ]);

  assert.equal(isHostingTargetId("cloudflare"), true);
  assert.equal(isHostingTargetId("k8s"), false);
  assert.equal(normalizeHostingTargetId("cf"), undefined);
  assert.equal(normalizeHostingTargetId("k8s"), undefined);
  assert.equal(normalizeHostingTargetId("azure"), undefined);
  assert.doesNotThrow(() => assertHostingTargetId("aws"));
  assert.throws(() => assertHostingTargetId("azure"), /HostingTargetId/);

  assert.equal(isTakosServiceId("takos-paas"), true);
  assert.equal(isTakosServiceId("takos-runtime"), false);
  assert.doesNotThrow(() => assertTakosServiceId("takos-agent"));
  assert.throws(() => assertTakosServiceId("takos-runtime"), /TakosServiceId/);
});

Deno.test("integrated distribution manifests validate all hosting targets", () => {
  const targets: readonly TakosDistributionTarget[] = [
    {
      id: "cloudflare",
      accountId: "cf-account",
      workerName: "takos-control",
      dispatchNamespace: "takos-dispatch",
    },
    {
      id: "aws",
      accountId: "123456789012",
      region: "ap-northeast-1",
      clusterName: "takos-eks",
    },
    {
      id: "gcp",
      projectId: "takos-production",
      region: "asia-northeast1",
      clusterName: "takos-gke",
    },
    {
      id: "kubernetes",
      namespace: "takos-system",
      ingressClass: "nginx",
    },
    {
      id: "selfhosted",
      host: "takos.example.internal",
      baseUrl: "https://takos.example.internal",
      reverseProxy: "caddy",
    },
  ];

  for (const target of targets) {
    const manifest = manifestFor(target);
    assert.deepEqual(validateTakosDistributionManifest(manifest), []);
    assert.deepEqual(
      validateTakosDistributionManifest(manifest, {
        mode: "official-template",
      }),
      [],
    );
    assert.equal(isTakosDistributionManifest(manifest), true);
    assert.doesNotThrow(() => assertTakosDistributionManifest(manifest));
    assert.doesNotThrow(() =>
      exportedAssertTakosDistributionManifest(manifest)
    );
  }
});

Deno.test("concrete release validation rejects placeholders and mutable latest images", () => {
  const manifest = {
    ...manifestFor({
      id: "aws",
      accountId: "123456789012",
      region: "ap-northeast-1",
    }),
    services: (() => {
      const baseServices = manifestFor({
        id: "aws",
        accountId: "123456789012",
        region: "ap-northeast-1",
      }).services ?? [];
      return [
        { ...baseServices[0], image: "ghcr.io/takos/takos-app:latest" },
        ...baseServices.slice(1),
      ];
    })(),
  };

  const messages = validateTakosDistributionManifest(manifest, {
    mode: "concrete-release",
  }).map((entry) => `${entry.path} ${entry.message}`).join("\n");

  assert.match(messages, /must not use the mutable latest tag/);
  assert.match(messages, /must not contain template placeholder value/);
});

Deno.test("distribution manifest rejects unsupported target and missing target fields", () => {
  const unsupported = {
    ...manifestFor({
      id: "cloudflare",
      accountId: "cf-account",
      workerName: "takos-control",
    }),
    target: { id: "azure", region: "japaneast" },
  };

  assert.match(
    validateTakosDistributionManifest(unsupported).map((entry) => entry.message)
      .join("\n"),
    /target id is not registered: azure/,
  );

  const missingAwsRegion = manifestFor({
    id: "aws",
    accountId: "123456789012",
    region: "",
  });
  assert.match(
    validateTakosDistributionManifest(missingAwsRegion).map((entry) =>
      `${entry.path} ${entry.message}`
    ).join("\n"),
    /\$\.target\.region must be a non-empty string/,
  );
});

Deno.test("distribution manifest rejects partial or duplicated service set", () => {
  const valid = manifestFor({
    id: "kubernetes",
    namespace: "takos-system",
  });
  const services = valid.services ?? [];
  const partial = {
    ...valid,
    services: services.filter((service) => service.serviceId !== "takos-agent"),
  };

  assert.deepEqual(missingTakosServiceIds(partial.services), ["takos-agent"]);
  assert.match(
    validateTakosDistributionManifest(partial).map((entry) => entry.message)
      .join("\n"),
    /missing service takos-agent/,
  );
  assert.deepEqual(
    validateTakosDistributionManifest(partial, { requireAllServices: false }),
    [],
  );

  const duplicate = {
    ...valid,
    services: [
      ...services,
      { ...services[0] },
    ],
  };
  assert.match(
    validateTakosDistributionManifest(duplicate).map((entry) => entry.message)
      .join("\n"),
    /service id is duplicated/,
  );
});

Deno.test("distribution manifest rejects invalid urls, env, and metadata", () => {
  const invalid: unknown = {
    ...manifestFor({
      id: "selfhosted",
      host: "takos.example.internal",
    }),
    routing: {
      publicBaseUrl: "not a url",
      metadata: { ok: true },
    },
    services: [
      {
        serviceId: "takos-app",
        runtime: "container",
        publicUrl: "http://app.internal",
        env: { PORT: 8080 },
      },
      {
        serviceId: "takos-paas",
        runtime: "process",
        hostingTargetId: "k8s",
      },
      {
        serviceId: "takos-git",
        runtime: "process",
        metadata: { invalid: undefined },
      },
      {
        serviceId: "takos-agent",
        runtime: "daemon",
      },
    ],
  };

  const messages = validateTakosDistributionManifest(invalid).map((entry) =>
    `${entry.path} ${entry.message}`
  ).join("\n");
  assert.match(messages, /\$\.routing\.publicBaseUrl must be a valid URL/);
  assert.match(messages, /\$\.services\[0\]\.env env must be a string record/);
  assert.match(
    messages,
    /\$\.services\[1\]\.hostingTargetId hosting target id is not supported/,
  );
  assert.match(
    messages,
    /\$\.services\[2\]\.metadata metadata must be a JSON object/,
  );
  assert.match(messages, /\$\.services\[3\]\.runtime runtime is not supported/);
  assert.throws(
    () => assertTakosDistributionManifest(invalid),
    /Invalid TakosDistributionManifest/,
  );
});

Deno.test("hosting contract type exports are available from package index", () => {
  const targetId: ExportedHostingTargetId = "cloudflare";
  const serviceId: ExportedTakosServiceId = "takos-paas";
  assert.equal(targetId, "cloudflare");
  assert.equal(serviceId, "takos-paas");
});

Deno.test("HOSTING_TARGET_IDS legacy alias mirrors KNOWN_HOSTING_TARGET_IDS", () => {
  assert.deepEqual([...HOSTING_TARGET_IDS], [...KNOWN_HOSTING_TARGET_IDS]);
});

Deno.test("plugin can register a 3rd-party hosting target via registry", () => {
  assert.equal(isHostingTargetId("azure"), false);
  const azureSchema: HostingTargetSchema = {
    id: "azure",
    allowedRuntimes: ["container", "managed"],
    validateTargetFields(value, issues) {
      if (typeof value.subscriptionId !== "string" || !value.subscriptionId) {
        issues.push({
          path: "$.target.subscriptionId",
          message: "must be a non-empty string",
        });
      }
      if (typeof value.region !== "string" || !value.region) {
        issues.push({
          path: "$.target.region",
          message: "must be a non-empty string",
        });
      }
    },
  };
  const previous = registerHostingTarget(azureSchema);
  assert.equal(previous, undefined);
  try {
    assert.equal(isHostingTargetId("azure"), true);
    assert.equal(getHostingTargetSchema("azure"), azureSchema);
    assert.ok(listHostingTargetIds().includes("azure"));
    assert.doesNotThrow(() => assertHostingTargetId("azure"));

    const validAzure = manifestFor({
      id: "azure" as HostingTargetId,
      // deno-lint-ignore no-explicit-any
      subscriptionId: "00000000-0000-0000-0000-000000000000",
      // deno-lint-ignore no-explicit-any
      region: "japaneast",
    } as unknown as TakosDistributionTarget);
    assert.deepEqual(validateTakosDistributionManifest(validAzure), []);

    const invalidAzure = manifestFor({
      id: "azure" as HostingTargetId,
    } as unknown as TakosDistributionTarget);
    const messages = validateTakosDistributionManifest(invalidAzure)
      .map((entry) => `${entry.path} ${entry.message}`).join("\n");
    assert.match(messages, /\$\.target\.subscriptionId must be a non-empty string/);
    assert.match(messages, /\$\.target\.region must be a non-empty string/);
  } finally {
    assert.equal(unregisterHostingTarget("azure"), true);
    assert.equal(isHostingTargetId("azure"), false);
  }
});

function manifestFor(
  target: TakosDistributionTarget,
): TakosDistributionManifest {
  const targetId: HostingTargetId = target.id;
  const services = TAKOS_SERVICE_IDS.map((serviceId) => ({
    serviceId,
    runtime: runtimeFor(targetId),
    hostingTargetId: targetId,
    artifactRef: `template:${serviceId}`,
    internalUrl: `https://${serviceId}.internal.takos.example`,
    smoke: {
      healthPath: "/health",
      expectedStatus: 200,
      expectedJson: { service: serviceId },
    },
    env: {
      TAKOS_SERVICE_ID: serviceId,
    },
  }));

  return {
    apiVersion: TAKOS_DISTRIBUTION_MANIFEST_API_VERSION,
    kind: TAKOS_DISTRIBUTION_MANIFEST_KIND,
    target,
    services,
    profile: `${targetId}.example.json`,
    providerProfile: {
      bundle: "@takos/takosumi",
      profileId: `operator.takosumi.${targetId}`,
      pluginIds: [`operator.takosumi.${targetId}`],
    },
    artifacts: [{ kind: "operator", ref: `deploy/${targetId}` }],
    providerProof: {
      readOnlySmokeTask: `deno task live-smoke:${targetId}`,
      provisioningSmokeTask: `deno task live-provisioning-smoke:${targetId}`,
      cleanupTask: `deno task live-provisioning-cleanup:${targetId}`,
      fixturePath: `fixtures/${targetId}-smoke-desired-state.json`,
    },
    requiredBindings: [{ kind: "operator-config", name: targetId }],
    environment: "production",
    routing: {
      publicBaseUrl: "https://takos.example.com",
      adminBaseUrl: "https://admin.takos.example.com",
      wildcardDomain: "*.app.takos.example.com",
      dnsProvider: targetId,
    },
    metadata: {
      source: "hosting_test",
    },
  };
}

function runtimeFor(targetId: HostingTargetId): TakosServiceRuntime {
  if (targetId === "cloudflare") return "worker";
  if (targetId === "kubernetes") return "kubernetes-deployment";
  if (targetId === "selfhosted") return "process";
  return "container";
}

Deno.test("distribution manifest accepts shape-model resources without target/services", () => {
  const manifest = {
    apiVersion: TAKOS_DISTRIBUTION_MANIFEST_API_VERSION,
    kind: TAKOS_DISTRIBUTION_MANIFEST_KIND,
    resources: [
      {
        shape: "web-service@v1",
        name: "api",
        provider: "docker-compose",
        spec: { image: "oci://example/api:latest", port: 8080 },
      },
      {
        shape: "object-store@v1",
        name: "assets",
        provider: "filesystem",
        spec: { name: "assets" },
      },
    ],
  };
  const issues = validateTakosDistributionManifest(manifest, {
    requireAllServices: false,
  });
  assert.deepEqual([...issues], []);
});

Deno.test("distribution manifest accepts template invocation", () => {
  const manifest = {
    apiVersion: TAKOS_DISTRIBUTION_MANIFEST_API_VERSION,
    kind: TAKOS_DISTRIBUTION_MANIFEST_KIND,
    template: {
      template: "selfhosted-single-vm@v1",
      inputs: { domain: "example.com" },
    },
  };
  const issues = validateTakosDistributionManifest(manifest, {
    requireAllServices: false,
  });
  assert.deepEqual([...issues], []);
});

Deno.test("distribution manifest rejects when neither target nor resources nor template provided", () => {
  const manifest = {
    apiVersion: TAKOS_DISTRIBUTION_MANIFEST_API_VERSION,
    kind: TAKOS_DISTRIBUTION_MANIFEST_KIND,
  };
  const messages = validateTakosDistributionManifest(manifest)
    .map((entry) => entry.message)
    .join("\n");
  assert.match(messages, /resources\/template/);
});

Deno.test("distribution manifest rejects malformed resource entry", () => {
  const manifest = {
    apiVersion: TAKOS_DISTRIBUTION_MANIFEST_API_VERSION,
    kind: TAKOS_DISTRIBUTION_MANIFEST_KIND,
    resources: [
      { shape: "", name: "x", provider: "p", spec: {} },
      { shape: "x@v1", name: "x", provider: "p" },
    ],
  };
  const messages = validateTakosDistributionManifest(manifest, {
    requireAllServices: false,
  })
    .map((entry) => `${entry.path} ${entry.message}`)
    .join("\n");
  assert.match(messages, /\$\.resources\[0\]\.shape/);
  assert.match(messages, /\$\.resources\[1\]\.spec/);
});
