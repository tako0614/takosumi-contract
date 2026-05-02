import type { JsonObject } from "./types.ts";
import type {
  ManifestResource,
  ManifestTemplateInvocation,
} from "./manifest-resource.ts";

export const TAKOS_DISTRIBUTION_MANIFEST_API_VERSION = "takos.dev/hosting/v1";
export const TAKOS_DISTRIBUTION_MANIFEST_KIND = "TakosDistribution";

/**
 * Hosting target ids known to the contract at compile time. Plugins may
 * register additional target ids at runtime via {@link registerHostingTarget};
 * `HostingTargetId` is therefore the union of `KnownHostingTargetId` and any
 * plugin-registered string. `HOSTING_TARGET_IDS` is retained as the legacy
 * alias for the known list.
 */
export const KNOWN_HOSTING_TARGET_IDS = [
  "cloudflare",
  "aws",
  "gcp",
  "kubernetes",
  "selfhosted",
] as const;

export type KnownHostingTargetId = typeof KNOWN_HOSTING_TARGET_IDS[number];

/** Legacy alias retained for backward compatibility. */
export const HOSTING_TARGET_IDS = KNOWN_HOSTING_TARGET_IDS;

/**
 * Open enum: any string a plugin has registered through
 * {@link registerHostingTarget}, plus the known compile-time ids. The
 * `string & Record<PropertyKey, never>` intersection keeps IntelliSense for
 * the known ids while accepting any plugin-registered id at runtime.
 * Pre-existing code that pinned `HostingTargetId` to the closed five-target
 * list should migrate to {@link KnownHostingTargetId}.
 */
export type HostingTargetId =
  | KnownHostingTargetId
  | (string & Record<PropertyKey, never>);

export const TAKOS_SERVICE_IDS = [
  "takos-app",
  "takos-paas",
  "takos-git",
  "takos-agent",
] as const;

export type TakosServiceId = typeof TAKOS_SERVICE_IDS[number];

export interface CloudflareDistributionTarget {
  readonly id: "cloudflare";
  readonly accountId: string;
  readonly workerName: string;
  readonly dispatchNamespace?: string;
  readonly zoneId?: string;
  readonly metadata?: JsonObject;
}

export interface AwsDistributionTarget {
  readonly id: "aws";
  readonly accountId: string;
  readonly region: string;
  readonly clusterName?: string;
  readonly loadBalancerName?: string;
  readonly route53ZoneId?: string;
  readonly metadata?: JsonObject;
}

export interface GcpDistributionTarget {
  readonly id: "gcp";
  readonly projectId: string;
  readonly region: string;
  readonly clusterName?: string;
  readonly loadBalancerName?: string;
  readonly cloudDnsZone?: string;
  readonly metadata?: JsonObject;
}

export interface KubernetesDistributionTarget {
  readonly id: "kubernetes";
  readonly namespace: string;
  readonly clusterName?: string;
  readonly context?: string;
  readonly ingressClass?: string;
  readonly metadata?: JsonObject;
}

export interface SelfHostedDistributionTarget {
  readonly id: "selfhosted";
  readonly host: string;
  readonly baseUrl?: string;
  readonly composeProject?: string;
  readonly reverseProxy?: "caddy" | "nginx" | "traefik" | "external" | string;
  readonly metadata?: JsonObject;
}

export type TakosDistributionTarget =
  | CloudflareDistributionTarget
  | AwsDistributionTarget
  | GcpDistributionTarget
  | KubernetesDistributionTarget
  | SelfHostedDistributionTarget;

export type TakosServiceRuntime =
  | "worker"
  | "container"
  | "kubernetes-deployment"
  | "process"
  | "managed";

export interface TakosServiceSmokeProbe {
  readonly healthPath: string;
  readonly expectedStatus?: number;
  readonly expectedJson?: JsonObject;
}

export interface TakosDistributedService {
  readonly serviceId: TakosServiceId;
  readonly runtime: TakosServiceRuntime;
  readonly hostingTargetId?: HostingTargetId;
  readonly image?: string;
  readonly artifactRef?: string;
  readonly internalUrl?: string;
  readonly publicUrl?: string;
  readonly smoke?: TakosServiceSmokeProbe;
  readonly env?: Readonly<Record<string, string>>;
  readonly metadata?: JsonObject;
}

export interface TakosDistributionRouting {
  readonly publicBaseUrl?: string;
  readonly adminBaseUrl?: string;
  readonly wildcardDomain?: string;
  readonly dnsProvider?: HostingTargetId | "external" | string;
  readonly metadata?: JsonObject;
}

export interface TakosDistributionProviderProfile {
  readonly bundle: string;
  readonly profileId: string;
  readonly pluginIds: readonly string[];
  readonly version?: string;
}

export type TakosDistributionArtifactKind =
  | "helm"
  | "terraform"
  | "compose"
  | "wrangler"
  | "image"
  | "operator";

export interface TakosDistributionArtifact {
  readonly kind: TakosDistributionArtifactKind;
  readonly ref: string;
  readonly digest?: string;
}

export interface TakosDistributionProviderProof {
  readonly readOnlySmokeTask?: string;
  readonly provisioningSmokeTask: string;
  readonly cleanupTask?: string;
  readonly fixturePath: string;
  readonly liveEnvPrefix?: string;
}

export interface TakosDistributionRequiredBinding {
  readonly kind: string;
  readonly name: string;
  readonly required?: boolean;
}

export interface TakosDistributionManifest {
  readonly apiVersion: typeof TAKOS_DISTRIBUTION_MANIFEST_API_VERSION;
  readonly kind: typeof TAKOS_DISTRIBUTION_MANIFEST_KIND;
  readonly target?: TakosDistributionTarget;
  readonly services?: readonly TakosDistributedService[];
  readonly resources?: readonly ManifestResource[];
  readonly template?: ManifestTemplateInvocation;
  readonly profile?: string;
  readonly providerProfile?: TakosDistributionProviderProfile;
  readonly artifacts?: readonly TakosDistributionArtifact[];
  readonly providerProof?: TakosDistributionProviderProof;
  readonly requiredBindings?: readonly TakosDistributionRequiredBinding[];
  readonly environment?: "development" | "staging" | "production" | string;
  readonly routing?: TakosDistributionRouting;
  readonly metadata?: JsonObject;
}

export interface HostingManifestValidationIssue {
  readonly path: string;
  readonly message: string;
}

export type TakosDistributionValidationMode =
  | "base"
  | "official-template"
  | "concrete-release";

export interface HostingManifestValidationOptions {
  readonly mode?: TakosDistributionValidationMode;
  readonly requireAllServices?: boolean;
  readonly requireSmokeForAllServices?: boolean;
  readonly requireServiceTargetMatch?: boolean;
  readonly requireRouting?: boolean;
  readonly requireArtifacts?: boolean;
  readonly requireProviderProfile?: boolean;
  readonly requireProviderProof?: boolean;
  readonly forbidLatestImages?: boolean;
  readonly forbidTemplatePlaceholders?: boolean;
}

const TAKOS_SERVICE_ID_SET: ReadonlySet<string> = new Set(TAKOS_SERVICE_IDS);

// ---------------------------------------------------------------------------
// HostingTarget plugin registry
// ---------------------------------------------------------------------------

/**
 * Validation hook a plugin supplies when it registers a new hosting target.
 * The runtime calls `validateTargetFields` during distribution-manifest
 * validation; the schema therefore owns target-id-specific field rules. The
 * `allowedRuntimes` array is consulted when manifests pin a runtime to a
 * specific target id.
 */
export interface HostingTargetSchema {
  readonly id: string;
  readonly allowedRuntimes: readonly TakosServiceRuntime[];
  validateTargetFields(
    value: Record<string, unknown>,
    issues: HostingManifestValidationIssue[],
  ): void;
}

const HOSTING_TARGET_REGISTRY = new Map<string, HostingTargetSchema>();

/**
 * Register (or replace) a hosting target schema. Plugins call this from their
 * `createAdapters` factory to make their target id valid in distribution
 * manifests. Returns the previously registered schema, if any.
 */
export function registerHostingTarget(
  schema: HostingTargetSchema,
): HostingTargetSchema | undefined {
  const previous = HOSTING_TARGET_REGISTRY.get(schema.id);
  HOSTING_TARGET_REGISTRY.set(schema.id, schema);
  return previous;
}

/** Unregister a previously registered hosting target. Returns true on hit. */
export function unregisterHostingTarget(id: string): boolean {
  return HOSTING_TARGET_REGISTRY.delete(id);
}

/** Look up a registered hosting target schema, if any. */
export function getHostingTargetSchema(
  id: string,
): HostingTargetSchema | undefined {
  return HOSTING_TARGET_REGISTRY.get(id);
}

/** List all registered hosting target ids in registration order. */
export function listHostingTargetIds(): readonly string[] {
  return Array.from(HOSTING_TARGET_REGISTRY.keys());
}

export function isHostingTargetId(value: unknown): value is HostingTargetId {
  return typeof value === "string" && HOSTING_TARGET_REGISTRY.has(value);
}

export function assertHostingTargetId(
  value: unknown,
): asserts value is HostingTargetId {
  if (!isHostingTargetId(value)) {
    throw new TypeError(`Invalid HostingTargetId: ${String(value)}`);
  }
}

export function normalizeHostingTargetId(
  value: string,
): HostingTargetId | undefined {
  if (isHostingTargetId(value)) return value;
  return undefined;
}

export function isTakosServiceId(value: unknown): value is TakosServiceId {
  return typeof value === "string" && TAKOS_SERVICE_ID_SET.has(value);
}

export function assertTakosServiceId(
  value: unknown,
): asserts value is TakosServiceId {
  if (!isTakosServiceId(value)) {
    throw new TypeError(`Invalid TakosServiceId: ${String(value)}`);
  }
}

export function validateTakosDistributionManifest(
  value: unknown,
  options: HostingManifestValidationOptions = {},
): readonly HostingManifestValidationIssue[] {
  const issues: HostingManifestValidationIssue[] = [];
  const resolvedOptions = resolveValidationOptions(options);

  if (!isRecord(value)) {
    return issue("$", "TakosDistributionManifest must be an object");
  }

  if (value.apiVersion !== TAKOS_DISTRIBUTION_MANIFEST_API_VERSION) {
    issues.push(issueAt("$.apiVersion", "unsupported apiVersion"));
  }
  if (value.kind !== TAKOS_DISTRIBUTION_MANIFEST_KIND) {
    issues.push(issueAt("$.kind", "unsupported kind"));
  }

  const usesShapeModel = value.resources !== undefined ||
    value.template !== undefined;

  if (value.target !== undefined) {
    validateTarget(value.target, issues);
  } else if (!usesShapeModel) {
    issues.push(issueAt(
      "$.target",
      "manifest must declare target+services or resources/template",
    ));
  }
  const targetId = isRecord(value.target) && isHostingTargetId(value.target.id)
    ? value.target.id
    : undefined;
  if (value.services !== undefined) {
    validateServices(value.services, issues, resolvedOptions, targetId);
  } else if (!usesShapeModel) {
    issues.push(issueAt("$.services", "services are required"));
  }
  if (value.resources !== undefined) {
    validateManifestResources(value.resources, issues);
  }
  if (value.template !== undefined) {
    validateManifestTemplate(value.template, issues);
  }

  if (value.profile !== undefined && !isNonEmptyString(value.profile)) {
    issues.push(issueAt("$.profile", "profile must be a non-empty string"));
  }
  if (value.providerProfile !== undefined) {
    validateProviderProfile(value.providerProfile, issues);
  } else if (resolvedOptions.requireProviderProfile) {
    issues.push(
      issueAt("$.providerProfile", "providerProfile is required"),
    );
  }
  if (value.artifacts !== undefined) {
    validateArtifacts(value.artifacts, issues);
  } else if (resolvedOptions.requireArtifacts) {
    issues.push(issueAt("$.artifacts", "artifacts are required"));
  }
  if (value.providerProof !== undefined) {
    validateProviderProof(value.providerProof, issues);
  } else if (resolvedOptions.requireProviderProof) {
    issues.push(issueAt("$.providerProof", "providerProof is required"));
  }
  if (value.requiredBindings !== undefined) {
    validateRequiredBindings(value.requiredBindings, issues);
  }
  if (
    value.environment !== undefined && !isNonEmptyString(value.environment)
  ) {
    issues.push(
      issueAt("$.environment", "environment must be a non-empty string"),
    );
  }
  if (value.routing !== undefined) {
    validateRouting(value.routing, issues);
  } else if (resolvedOptions.requireRouting) {
    issues.push(issueAt("$.routing", "routing is required"));
  }
  if (value.metadata !== undefined && !isJsonObject(value.metadata)) {
    issues.push(issueAt("$.metadata", "metadata must be a JSON object"));
  }
  if (resolvedOptions.forbidTemplatePlaceholders) {
    validateNoTemplatePlaceholders(value, "$", issues);
  }

  return issues;
}

export function isTakosDistributionManifest(
  value: unknown,
): value is TakosDistributionManifest {
  return validateTakosDistributionManifest(value).length === 0;
}

export function assertTakosDistributionManifest(
  value: unknown,
  options?: HostingManifestValidationOptions,
): asserts value is TakosDistributionManifest {
  const issues = validateTakosDistributionManifest(value, options);
  if (issues.length > 0) {
    throw new TypeError(
      `Invalid TakosDistributionManifest: ${
        issues.map((entry) => `${entry.path} ${entry.message}`).join("; ")
      }`,
    );
  }
}

export function missingTakosServiceIds(
  services: readonly Pick<TakosDistributedService, "serviceId">[],
): readonly TakosServiceId[] {
  const present = new Set(services.map((service) => service.serviceId));
  return TAKOS_SERVICE_IDS.filter((serviceId) => !present.has(serviceId));
}

function validateTarget(
  value: unknown,
  issues: HostingManifestValidationIssue[],
): void {
  if (!isRecord(value)) {
    issues.push(issueAt("$.target", "target must be an object"));
    return;
  }
  if (typeof value.id !== "string" || value.id.length === 0) {
    issues.push(issueAt("$.target.id", "target id is required"));
    return;
  }
  const schema = HOSTING_TARGET_REGISTRY.get(value.id);
  if (!schema) {
    issues.push(
      issueAt(
        "$.target.id",
        `target id is not registered: ${value.id}`,
      ),
    );
    return;
  }
  schema.validateTargetFields(value, issues);
  if (value.metadata !== undefined && !isJsonObject(value.metadata)) {
    issues.push(issueAt("$.target.metadata", "metadata must be a JSON object"));
  }
}

// ---------------------------------------------------------------------------
// Built-in hosting target schemas (registered at module load time).
// Plugins may register additional schemas via {@link registerHostingTarget}.
// ---------------------------------------------------------------------------

const CLOUDFLARE_HOSTING_SCHEMA: HostingTargetSchema = {
  id: "cloudflare",
  allowedRuntimes: ["worker", "container", "managed"],
  validateTargetFields(value, issues) {
    requireNonEmptyString(value.accountId, "$.target.accountId", issues);
    requireNonEmptyString(value.workerName, "$.target.workerName", issues);
    optionalNonEmptyString(
      value.dispatchNamespace,
      "$.target.dispatchNamespace",
      issues,
    );
    optionalNonEmptyString(value.zoneId, "$.target.zoneId", issues);
  },
};

const AWS_HOSTING_SCHEMA: HostingTargetSchema = {
  id: "aws",
  allowedRuntimes: ["container", "managed", "kubernetes-deployment"],
  validateTargetFields(value, issues) {
    requireNonEmptyString(value.accountId, "$.target.accountId", issues);
    requireNonEmptyString(value.region, "$.target.region", issues);
    optionalNonEmptyString(value.clusterName, "$.target.clusterName", issues);
    optionalNonEmptyString(
      value.loadBalancerName,
      "$.target.loadBalancerName",
      issues,
    );
    optionalNonEmptyString(
      value.route53ZoneId,
      "$.target.route53ZoneId",
      issues,
    );
  },
};

const GCP_HOSTING_SCHEMA: HostingTargetSchema = {
  id: "gcp",
  allowedRuntimes: ["container", "managed", "kubernetes-deployment"],
  validateTargetFields(value, issues) {
    requireNonEmptyString(value.projectId, "$.target.projectId", issues);
    requireNonEmptyString(value.region, "$.target.region", issues);
    optionalNonEmptyString(value.clusterName, "$.target.clusterName", issues);
    optionalNonEmptyString(
      value.loadBalancerName,
      "$.target.loadBalancerName",
      issues,
    );
    optionalNonEmptyString(value.cloudDnsZone, "$.target.cloudDnsZone", issues);
  },
};

const KUBERNETES_HOSTING_SCHEMA: HostingTargetSchema = {
  id: "kubernetes",
  allowedRuntimes: ["kubernetes-deployment", "managed"],
  validateTargetFields(value, issues) {
    requireNonEmptyString(value.namespace, "$.target.namespace", issues);
    optionalNonEmptyString(value.clusterName, "$.target.clusterName", issues);
    optionalNonEmptyString(value.context, "$.target.context", issues);
    optionalNonEmptyString(value.ingressClass, "$.target.ingressClass", issues);
  },
};

const SELFHOSTED_HOSTING_SCHEMA: HostingTargetSchema = {
  id: "selfhosted",
  allowedRuntimes: ["process", "container", "managed"],
  validateTargetFields(value, issues) {
    requireNonEmptyString(value.host, "$.target.host", issues);
    optionalNonEmptyString(value.baseUrl, "$.target.baseUrl", issues);
    optionalNonEmptyString(
      value.composeProject,
      "$.target.composeProject",
      issues,
    );
    optionalNonEmptyString(value.reverseProxy, "$.target.reverseProxy", issues);
  },
};

// Register the built-in schemas at module load.
registerHostingTarget(CLOUDFLARE_HOSTING_SCHEMA);
registerHostingTarget(AWS_HOSTING_SCHEMA);
registerHostingTarget(GCP_HOSTING_SCHEMA);
registerHostingTarget(KUBERNETES_HOSTING_SCHEMA);
registerHostingTarget(SELFHOSTED_HOSTING_SCHEMA);

function validateManifestResources(
  value: unknown,
  issues: HostingManifestValidationIssue[],
): void {
  if (!Array.isArray(value)) {
    issues.push(issueAt("$.resources", "resources must be an array"));
    return;
  }
  const seen = new Set<string>();
  for (const [index, entry] of value.entries()) {
    const path = `$.resources[${index}]`;
    if (!isRecord(entry)) {
      issues.push(issueAt(path, "resource must be an object"));
      continue;
    }
    requireNonEmptyString(entry.shape, `${path}.shape`, issues);
    requireNonEmptyString(entry.name, `${path}.name`, issues);
    requireNonEmptyString(entry.provider, `${path}.provider`, issues);
    if (entry.spec === undefined) {
      issues.push(issueAt(`${path}.spec`, "spec is required"));
    }
    if (typeof entry.name === "string") {
      if (seen.has(entry.name)) {
        issues.push(issueAt(
          `${path}.name`,
          `duplicate resource name: ${entry.name}`,
        ));
      } else {
        seen.add(entry.name);
      }
    }
    if (entry.requires !== undefined) {
      if (!Array.isArray(entry.requires)) {
        issues.push(issueAt(
          `${path}.requires`,
          "requires must be an array",
        ));
      } else if (!entry.requires.every(isNonEmptyString)) {
        issues.push(issueAt(
          `${path}.requires`,
          "requires must contain only non-empty strings",
        ));
      }
    }
    if (entry.metadata !== undefined && !isJsonObject(entry.metadata)) {
      issues.push(issueAt(
        `${path}.metadata`,
        "metadata must be a JSON object",
      ));
    }
  }
}

function validateManifestTemplate(
  value: unknown,
  issues: HostingManifestValidationIssue[],
): void {
  if (!isRecord(value)) {
    issues.push(issueAt("$.template", "template must be an object"));
    return;
  }
  requireNonEmptyString(value.template, "$.template.template", issues);
  if (value.inputs !== undefined && !isJsonObject(value.inputs)) {
    issues.push(issueAt("$.template.inputs", "inputs must be a JSON object"));
  }
}

function validateServices(
  value: unknown,
  issues: HostingManifestValidationIssue[],
  options: ResolvedHostingManifestValidationOptions,
  targetId: HostingTargetId | undefined,
): void {
  if (!Array.isArray(value)) {
    issues.push(issueAt("$.services", "services must be an array"));
    return;
  }

  const seen = new Set<TakosServiceId>();
  for (const [index, service] of value.entries()) {
    const path = `$.services[${index}]`;
    if (!isRecord(service)) {
      issues.push(issueAt(path, "service must be an object"));
      continue;
    }
    if (!isTakosServiceId(service.serviceId)) {
      issues.push(issueAt(`${path}.serviceId`, "service id is not supported"));
    } else if (seen.has(service.serviceId)) {
      issues.push(issueAt(`${path}.serviceId`, "service id is duplicated"));
    } else {
      seen.add(service.serviceId);
    }

    if (!isServiceRuntime(service.runtime)) {
      issues.push(issueAt(`${path}.runtime`, "runtime is not supported"));
    }
    if (
      service.hostingTargetId !== undefined &&
      !isHostingTargetId(service.hostingTargetId)
    ) {
      issues.push(
        issueAt(
          `${path}.hostingTargetId`,
          "hosting target id is not supported",
        ),
      );
    } else if (
      options.requireServiceTargetMatch && targetId !== undefined &&
      service.hostingTargetId !== targetId
    ) {
      issues.push(
        issueAt(
          `${path}.hostingTargetId`,
          `must match target id ${targetId}`,
        ),
      );
    }
    optionalNonEmptyString(service.image, `${path}.image`, issues);
    optionalNonEmptyString(service.artifactRef, `${path}.artifactRef`, issues);
    if (options.forbidLatestImages && isLatestImageTag(service.image)) {
      issues.push(
        issueAt(`${path}.image`, "must not use the mutable latest tag"),
      );
    }
    if (
      options.requireArtifacts && service.image === undefined &&
      service.artifactRef === undefined
    ) {
      issues.push(
        issueAt(`${path}`, "service must declare image or artifactRef"),
      );
    }
    if (
      options.requireServiceTargetMatch && targetId !== undefined &&
      isServiceRuntime(service.runtime) &&
      !runtimeAllowedForTarget(targetId, service.runtime)
    ) {
      issues.push(
        issueAt(
          `${path}.runtime`,
          `runtime ${service.runtime} is not valid for target ${targetId}`,
        ),
      );
    }
    optionalUrlString(service.internalUrl, `${path}.internalUrl`, issues);
    optionalUrlString(service.publicUrl, `${path}.publicUrl`, issues);
    if (service.smoke !== undefined) {
      validateSmokeProbe(service.smoke, `${path}.smoke`, issues);
    } else if (options.requireSmokeForAllServices) {
      issues.push(issueAt(`${path}.smoke`, "smoke is required"));
    }
    if (service.env !== undefined && !isStringRecord(service.env)) {
      issues.push(issueAt(`${path}.env`, "env must be a string record"));
    }
    if (service.metadata !== undefined && !isJsonObject(service.metadata)) {
      issues.push(
        issueAt(`${path}.metadata`, "metadata must be a JSON object"),
      );
    }
  }

  if (options.requireAllServices) {
    for (const serviceId of TAKOS_SERVICE_IDS) {
      if (!seen.has(serviceId)) {
        issues.push(issueAt("$.services", `missing service ${serviceId}`));
      }
    }
  }
}

type ResolvedHostingManifestValidationOptions =
  & Required<Omit<HostingManifestValidationOptions, "mode">>
  & {
    readonly mode: TakosDistributionValidationMode;
  };

function resolveValidationOptions(
  options: HostingManifestValidationOptions,
): ResolvedHostingManifestValidationOptions {
  const mode = options.mode ?? "base";
  const official = mode === "official-template" || mode === "concrete-release";
  return {
    mode,
    requireAllServices: options.requireAllServices ?? true,
    requireSmokeForAllServices: options.requireSmokeForAllServices ?? official,
    requireServiceTargetMatch: options.requireServiceTargetMatch ?? official,
    requireRouting: options.requireRouting ?? official,
    requireArtifacts: options.requireArtifacts ?? official,
    requireProviderProfile: options.requireProviderProfile ?? official,
    requireProviderProof: options.requireProviderProof ?? official,
    forbidLatestImages: options.forbidLatestImages ??
      mode === "concrete-release",
    forbidTemplatePlaceholders: options.forbidTemplatePlaceholders ??
      mode === "concrete-release",
  };
}

function validateProviderProfile(
  value: unknown,
  issues: HostingManifestValidationIssue[],
): void {
  if (!isRecord(value)) {
    issues.push(
      issueAt("$.providerProfile", "providerProfile must be an object"),
    );
    return;
  }
  requireNonEmptyString(value.bundle, "$.providerProfile.bundle", issues);
  requireNonEmptyString(
    value.profileId,
    "$.providerProfile.profileId",
    issues,
  );
  if (!isNonEmptyStringArray(value.pluginIds)) {
    issues.push(
      issueAt(
        "$.providerProfile.pluginIds",
        "pluginIds must be a non-empty string array",
      ),
    );
  }
  optionalNonEmptyString(value.version, "$.providerProfile.version", issues);
}

function validateArtifacts(
  value: unknown,
  issues: HostingManifestValidationIssue[],
): void {
  if (!Array.isArray(value)) {
    issues.push(issueAt("$.artifacts", "artifacts must be an array"));
    return;
  }
  if (value.length === 0) {
    issues.push(issueAt("$.artifacts", "artifacts must not be empty"));
  }
  for (const [index, artifact] of value.entries()) {
    const path = `$.artifacts[${index}]`;
    if (!isRecord(artifact)) {
      issues.push(issueAt(path, "artifact must be an object"));
      continue;
    }
    if (!isArtifactKind(artifact.kind)) {
      issues.push(issueAt(`${path}.kind`, "artifact kind is not supported"));
    }
    requireNonEmptyString(artifact.ref, `${path}.ref`, issues);
    optionalNonEmptyString(artifact.digest, `${path}.digest`, issues);
  }
}

function validateProviderProof(
  value: unknown,
  issues: HostingManifestValidationIssue[],
): void {
  if (!isRecord(value)) {
    issues.push(issueAt("$.providerProof", "providerProof must be an object"));
    return;
  }
  optionalNonEmptyString(
    value.readOnlySmokeTask,
    "$.providerProof.readOnlySmokeTask",
    issues,
  );
  requireNonEmptyString(
    value.provisioningSmokeTask,
    "$.providerProof.provisioningSmokeTask",
    issues,
  );
  optionalNonEmptyString(
    value.cleanupTask,
    "$.providerProof.cleanupTask",
    issues,
  );
  requireNonEmptyString(
    value.fixturePath,
    "$.providerProof.fixturePath",
    issues,
  );
  optionalNonEmptyString(
    value.liveEnvPrefix,
    "$.providerProof.liveEnvPrefix",
    issues,
  );
}

function validateRequiredBindings(
  value: unknown,
  issues: HostingManifestValidationIssue[],
): void {
  if (!Array.isArray(value)) {
    issues.push(
      issueAt("$.requiredBindings", "requiredBindings must be an array"),
    );
    return;
  }
  for (const [index, binding] of value.entries()) {
    const path = `$.requiredBindings[${index}]`;
    if (!isRecord(binding)) {
      issues.push(issueAt(path, "binding must be an object"));
      continue;
    }
    requireNonEmptyString(binding.kind, `${path}.kind`, issues);
    requireNonEmptyString(binding.name, `${path}.name`, issues);
    if (
      binding.required !== undefined &&
      typeof binding.required !== "boolean"
    ) {
      issues.push(issueAt(`${path}.required`, "required must be boolean"));
    }
  }
}

function validateSmokeProbe(
  value: unknown,
  path: string,
  issues: HostingManifestValidationIssue[],
): void {
  if (!isRecord(value)) {
    issues.push(issueAt(path, "smoke must be an object"));
    return;
  }
  if (!isRelativeUrlPath(value.healthPath)) {
    issues.push(issueAt(`${path}.healthPath`, "must be an absolute URL path"));
  }
  const expectedStatus = value.expectedStatus;
  if (
    expectedStatus !== undefined &&
    !isHttpStatus(expectedStatus)
  ) {
    issues.push(issueAt(`${path}.expectedStatus`, "must be an HTTP status"));
  }
  if (value.expectedJson !== undefined && !isJsonObject(value.expectedJson)) {
    issues.push(issueAt(`${path}.expectedJson`, "must be a JSON object"));
  }
}

function validateRouting(
  value: unknown,
  issues: HostingManifestValidationIssue[],
): void {
  if (!isRecord(value)) {
    issues.push(issueAt("$.routing", "routing must be an object"));
    return;
  }
  optionalUrlString(value.publicBaseUrl, "$.routing.publicBaseUrl", issues);
  optionalUrlString(value.adminBaseUrl, "$.routing.adminBaseUrl", issues);
  optionalNonEmptyString(
    value.wildcardDomain,
    "$.routing.wildcardDomain",
    issues,
  );
  optionalNonEmptyString(value.dnsProvider, "$.routing.dnsProvider", issues);
  if (value.metadata !== undefined && !isJsonObject(value.metadata)) {
    issues.push(
      issueAt("$.routing.metadata", "metadata must be a JSON object"),
    );
  }
}

function isServiceRuntime(value: unknown): value is TakosServiceRuntime {
  return value === "worker" || value === "container" ||
    value === "kubernetes-deployment" || value === "process" ||
    value === "managed";
}

function runtimeAllowedForTarget(
  targetId: HostingTargetId,
  runtime: TakosServiceRuntime,
): boolean {
  const schema = HOSTING_TARGET_REGISTRY.get(targetId);
  if (!schema) return false;
  return schema.allowedRuntimes.includes(runtime);
}

function isArtifactKind(
  value: unknown,
): value is TakosDistributionArtifactKind {
  return value === "helm" || value === "terraform" || value === "compose" ||
    value === "wrangler" || value === "image" || value === "operator";
}

function isLatestImageTag(value: unknown): boolean {
  if (typeof value !== "string") return false;
  return /(^|[:/])latest(?:@|$)/.test(value) || value.endsWith(":latest");
}

function validateNoTemplatePlaceholders(
  value: unknown,
  path: string,
  issues: HostingManifestValidationIssue[],
): void {
  if (typeof value === "string") {
    if (looksLikeTemplatePlaceholder(value)) {
      issues.push(issueAt(path, "must not contain template placeholder value"));
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((entry, index) =>
      validateNoTemplatePlaceholders(entry, `${path}[${index}]`, issues)
    );
    return;
  }
  if (!isRecord(value)) return;
  for (const [key, entry] of Object.entries(value)) {
    validateNoTemplatePlaceholders(entry, `${path}.${key}`, issues);
  }
}

function looksLikeTemplatePlaceholder(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  return normalized.includes("example.") ||
    normalized.includes(".example") ||
    normalized.includes("replace-me") ||
    normalized.includes("cloudflare-account-id") ||
    normalized.includes("cloudflare-zone-id") ||
    normalized.includes("000000000000") ||
    normalized === "123456789012";
}

function requireNonEmptyString(
  value: unknown,
  path: string,
  issues: HostingManifestValidationIssue[],
): void {
  if (!isNonEmptyString(value)) {
    issues.push(issueAt(path, "must be a non-empty string"));
  }
}

function optionalNonEmptyString(
  value: unknown,
  path: string,
  issues: HostingManifestValidationIssue[],
): void {
  if (value !== undefined && !isNonEmptyString(value)) {
    issues.push(issueAt(path, "must be a non-empty string"));
  }
}

function optionalUrlString(
  value: unknown,
  path: string,
  issues: HostingManifestValidationIssue[],
): void {
  if (value === undefined) return;
  if (!isNonEmptyString(value)) {
    issues.push(issueAt(path, "must be a non-empty URL string"));
    return;
  }
  try {
    new URL(value);
  } catch {
    issues.push(issueAt(path, "must be a valid URL"));
  }
}

function isRelativeUrlPath(value: unknown): value is string {
  return typeof value === "string" && value.startsWith("/") &&
    !value.startsWith("//");
}

function isHttpStatus(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) &&
    value >= 100 && value <= 599;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStringRecord(value: unknown): value is Record<string, string> {
  if (!isRecord(value)) return false;
  return Object.values(value).every((entry) => typeof entry === "string");
}

function isNonEmptyStringArray(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.length > 0 &&
    value.every(isNonEmptyString);
}

function isJsonObject(value: unknown): value is JsonObject {
  return isRecord(value) &&
    Object.values(value).every((entry) => isJsonValue(entry));
}

function isJsonValue(value: unknown): boolean {
  if (
    value === null || typeof value === "string" ||
    typeof value === "number" || typeof value === "boolean"
  ) {
    return Number.isFinite(value) || typeof value !== "number";
  }
  if (Array.isArray(value)) return value.every(isJsonValue);
  return isJsonObject(value);
}

function issue(messagePath: string, message: string) {
  return [issueAt(messagePath, message)];
}

function issueAt(
  path: string,
  message: string,
): HostingManifestValidationIssue {
  return { path, message };
}
