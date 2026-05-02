import type { ActorContext } from "./types.ts";

const textEncoder = new TextEncoder();

export const TAKOS_INTERNAL_RPC_VERSION = "takos-internal";
export const TAKOS_INTERNAL_PROTOCOL_HEADER = "x-takos-internal-protocol";
export const TAKOS_INTERNAL_SIGNATURE_HEADER = "x-takos-internal-signature";
export const TAKOS_INTERNAL_TIMESTAMP_HEADER = "x-takos-internal-timestamp";
export const TAKOS_INTERNAL_REQUEST_ID_HEADER = "x-takos-request-id";
export const TAKOS_INTERNAL_ACTOR_HEADER = "x-takos-actor-context";
export const TAKOS_INTERNAL_BODY_DIGEST_HEADER = "x-takos-body-digest";
export const TAKOS_INTERNAL_NONCE_HEADER = "x-takos-nonce";
export const TAKOS_INTERNAL_CALLER_HEADER = "x-takos-caller";
export const TAKOS_INTERNAL_AUDIENCE_HEADER = "x-takos-audience";
export const TAKOS_INTERNAL_CAPABILITIES_HEADER = "x-takos-capabilities";
export const TAKOS_INTERNAL_SIGNATURE_MAX_SKEW_MS = 5 * 60 * 1000;

export type TakosActorContext = ActorContext;

export interface TakosInternalRpcSigningInput {
  readonly method: string;
  readonly path: string;
  readonly query?: string;
  readonly body: string | Uint8Array;
  readonly actor: TakosActorContext;
  readonly caller: string;
  readonly audience: string;
  readonly capabilities?: readonly string[];
  readonly requestId?: string;
  readonly nonce?: string;
  readonly timestamp: string;
  readonly secret: string;
}

export interface TakosInternalRpcCanonicalInput {
  readonly method: string;
  readonly path: string;
  readonly query?: string;
  readonly bodyDigest: string;
  readonly actorContextHeader: string;
  readonly caller: string;
  readonly audience: string;
  readonly capabilities: readonly string[];
  readonly requestId: string;
  readonly nonce: string;
  readonly timestamp: string;
}

export interface TakosInternalRpcVerificationInput {
  readonly method: string;
  readonly path: string;
  readonly query?: string;
  readonly body: string | Uint8Array;
  readonly secret: string;
  readonly headers: Headers | Record<string, string>;
  readonly now?: () => Date;
  readonly maxClockSkewMs?: number;
  readonly expectedCaller?: string | readonly string[];
  readonly expectedAudience?: string;
  readonly requiredCapabilities?: readonly string[];
}

export interface VerifiedTakosInternalRpc {
  readonly actor: TakosActorContext;
  readonly caller: string;
  readonly audience: string;
  readonly capabilities: readonly string[];
  readonly requestId: string;
  readonly nonce: string;
  readonly timestamp: string;
}

export interface TakosInternalServiceEndpoint {
  readonly serviceId: string;
  readonly audience: string;
  readonly url: string;
}

export interface TakosServiceDirectory {
  resolve(serviceId: string): TakosInternalServiceEndpoint | undefined;
}

export class EnvTakosServiceDirectory implements TakosServiceDirectory {
  readonly #env: Record<string, string | undefined>;

  constructor(env: Record<string, string | undefined> = Deno.env.toObject()) {
    this.#env = env;
  }

  resolve(serviceId: string): TakosInternalServiceEndpoint | undefined {
    const key = endpointEnvKey(serviceId);
    const url = key ? this.#env[key] : undefined;
    if (!url) return undefined;
    return { serviceId, audience: serviceId, url };
  }
}

export interface TakosInternalClientOptions {
  readonly caller: string;
  readonly audience: string;
  readonly baseUrl: string;
  readonly secret: string;
  readonly fetch?: typeof fetch;
  readonly clock?: () => Date;
}

export class TakosInternalClient {
  readonly #caller: string;
  readonly #audience: string;
  readonly #baseUrl: string;
  readonly #secret: string;
  readonly #fetch: typeof fetch;
  readonly #clock: () => Date;

  constructor(options: TakosInternalClientOptions) {
    this.#caller = options.caller;
    this.#audience = options.audience;
    this.#baseUrl = options.baseUrl;
    this.#secret = options.secret;
    this.#fetch = options.fetch ?? fetch;
    this.#clock = options.clock ?? (() => new Date());
  }

  async request(input: {
    readonly method: string;
    readonly path: string;
    readonly search?: string;
    readonly body?: string | Uint8Array;
    readonly actor: TakosActorContext;
    readonly capabilities?: readonly string[];
    readonly headers?: HeadersInit;
  }): Promise<Response> {
    const body = input.body ?? "";
    const url = new URL(input.path, this.#baseUrl);
    if (input.search) url.search = input.search;
    const signed = await signTakosInternalRequest({
      method: input.method,
      path: input.path,
      query: url.search,
      body,
      actor: input.actor,
      caller: this.#caller,
      audience: this.#audience,
      capabilities: input.capabilities,
      timestamp: this.#clock().toISOString(),
      secret: this.#secret,
    });
    const headers = new Headers(input.headers);
    for (const [key, value] of Object.entries(signed.headers)) {
      headers.set(key, value);
    }
    if (
      typeof body === "string" && body.length > 0 &&
      !headers.has("content-type")
    ) {
      headers.set("content-type", "application/json");
    }
    const fetchBody = typeof body === "string"
      ? body
      : bytesToArrayBuffer(body);
    return await this.#fetch(url, {
      method: input.method,
      headers,
      body: body.length > 0 ? fetchBody : undefined,
    });
  }
}

export function canonicalTakosInternalRequest(
  input: TakosInternalRpcCanonicalInput,
): string {
  return [
    TAKOS_INTERNAL_RPC_VERSION,
    input.method.toUpperCase(),
    pathWithQuery(input.path, input.query),
    input.timestamp,
    input.requestId,
    input.nonce,
    input.caller,
    input.audience,
    normalizeCapabilities(input.capabilities).join(","),
    input.bodyDigest,
    input.actorContextHeader,
  ].join("\n");
}

export function encodeActorContext(actor: TakosActorContext): string {
  return btoa(JSON.stringify(actor));
}

export function decodeActorContext(value: string): TakosActorContext {
  const parsed = JSON.parse(atob(value)) as TakosActorContext;
  if (
    !parsed.actorAccountId || !parsed.requestId || !Array.isArray(parsed.roles)
  ) {
    throw new TypeError("Invalid Takos actor context");
  }
  return parsed;
}

export async function signTakosInternalRequest(
  input: TakosInternalRpcSigningInput,
): Promise<{ headers: Record<string, string> }> {
  const actorContextHeader = encodeActorContext(input.actor);
  const bodyDigest = await sha256Hex(input.body);
  const requestId = input.requestId ?? input.actor.requestId;
  const nonce = input.nonce ?? crypto.randomUUID();
  const capabilities = normalizeCapabilities(input.capabilities ?? []);
  const signature = await hmacSha256Hex(
    input.secret,
    canonicalTakosInternalRequest({
      method: input.method,
      path: input.path,
      query: input.query,
      bodyDigest,
      actorContextHeader,
      caller: input.caller,
      audience: input.audience,
      capabilities,
      requestId,
      nonce,
      timestamp: input.timestamp,
    }),
  );
  return {
    headers: {
      [TAKOS_INTERNAL_PROTOCOL_HEADER]: TAKOS_INTERNAL_RPC_VERSION,
      [TAKOS_INTERNAL_ACTOR_HEADER]: actorContextHeader,
      [TAKOS_INTERNAL_BODY_DIGEST_HEADER]: bodyDigest,
      [TAKOS_INTERNAL_NONCE_HEADER]: nonce,
      [TAKOS_INTERNAL_REQUEST_ID_HEADER]: requestId,
      [TAKOS_INTERNAL_TIMESTAMP_HEADER]: input.timestamp,
      [TAKOS_INTERNAL_CALLER_HEADER]: input.caller,
      [TAKOS_INTERNAL_AUDIENCE_HEADER]: input.audience,
      [TAKOS_INTERNAL_CAPABILITIES_HEADER]: capabilities.join(","),
      [TAKOS_INTERNAL_SIGNATURE_HEADER]: signature,
    },
  };
}

export async function verifyTakosInternalRequestFromHeaders(
  input: TakosInternalRpcVerificationInput,
): Promise<VerifiedTakosInternalRpc | undefined> {
  const version = readHeader(input.headers, TAKOS_INTERNAL_PROTOCOL_HEADER);
  const signature = readHeader(input.headers, TAKOS_INTERNAL_SIGNATURE_HEADER);
  const timestamp = readHeader(input.headers, TAKOS_INTERNAL_TIMESTAMP_HEADER);
  const requestId = readHeader(input.headers, TAKOS_INTERNAL_REQUEST_ID_HEADER);
  const nonce = readHeader(input.headers, TAKOS_INTERNAL_NONCE_HEADER);
  const caller = readHeader(input.headers, TAKOS_INTERNAL_CALLER_HEADER);
  const audience = readHeader(input.headers, TAKOS_INTERNAL_AUDIENCE_HEADER);
  const capabilities = normalizeCapabilities(
    parseCapabilities(
      readHeader(input.headers, TAKOS_INTERNAL_CAPABILITIES_HEADER),
    ),
  );
  const bodyDigest = readHeader(
    input.headers,
    TAKOS_INTERNAL_BODY_DIGEST_HEADER,
  );
  const actorContextHeader = readHeader(
    input.headers,
    TAKOS_INTERNAL_ACTOR_HEADER,
  );
  if (
    version !== TAKOS_INTERNAL_RPC_VERSION || !signature || !timestamp ||
    !requestId || !nonce || !caller || !audience || !bodyDigest ||
    !actorContextHeader
  ) {
    return undefined;
  }
  if (!timestampWithinSkew(timestamp, input)) return undefined;
  if (!callerAllowed(caller, input.expectedCaller)) return undefined;
  if (input.expectedAudience && audience !== input.expectedAudience) {
    return undefined;
  }
  for (const capability of input.requiredCapabilities ?? []) {
    if (!capabilities.includes(capability)) return undefined;
  }
  const actualBodyDigest = await sha256Hex(input.body);
  if (!timingSafeEqualHex(actualBodyDigest, bodyDigest)) return undefined;
  let actor: TakosActorContext;
  try {
    actor = decodeActorContext(actorContextHeader);
  } catch {
    return undefined;
  }
  if (actor.requestId !== requestId) return undefined;
  const expectedSignature = await hmacSha256Hex(
    input.secret,
    canonicalTakosInternalRequest({
      method: input.method,
      path: input.path,
      query: input.query,
      bodyDigest,
      actorContextHeader,
      caller,
      audience,
      capabilities,
      requestId,
      nonce,
      timestamp,
    }),
  );
  if (!timingSafeEqualHex(expectedSignature, signature)) return undefined;
  return Object.freeze({
    actor: Object.freeze(structuredClone(actor)),
    caller,
    audience,
    capabilities,
    requestId,
    nonce,
    timestamp,
  });
}

function endpointEnvKey(serviceId: string): string | undefined {
  switch (serviceId) {
    case "takos-paas":
      return "TAKOS_PAAS_INTERNAL_URL";
    case "takos-app":
      return "TAKOS_APP_INTERNAL_URL";
    case "takos-git":
      return "TAKOS_GIT_INTERNAL_URL";
    case "takos-agent":
      return "TAKOS_AGENT_INTERNAL_URL";
    default:
      return undefined;
  }
}

function parseCapabilities(value: string | null): string[] {
  return (value ?? "").split(",").map((capability) => capability.trim()).filter(
    Boolean,
  );
}

function normalizeCapabilities(capabilities: readonly string[]): string[] {
  return [
    ...new Set(
      capabilities.map((capability) => capability.trim()).filter(
        Boolean,
      ),
    ),
  ].sort();
}

function callerAllowed(
  caller: string,
  expected: string | readonly string[] | undefined,
): boolean {
  if (!expected) return true;
  return typeof expected === "string"
    ? caller === expected
    : expected.includes(caller);
}

function pathWithQuery(path: string, query?: string): string {
  if (!query) return path;
  const normalized = query.startsWith("?") ? query : `?${query}`;
  if (!path.includes("?")) return `${path}${normalized}`;
  return `${path}${normalized.replace(/^\?/, "&")}`;
}

function timestampWithinSkew(
  timestamp: string,
  input: {
    readonly now?: () => Date;
    readonly maxClockSkewMs?: number;
  },
): boolean {
  const parsed = Date.parse(timestamp);
  if (!Number.isFinite(parsed)) return false;
  const maxClockSkewMs = input.maxClockSkewMs ??
    TAKOS_INTERNAL_SIGNATURE_MAX_SKEW_MS;
  if (!Number.isFinite(maxClockSkewMs)) return true;
  const now = (input.now?.() ?? new Date()).getTime();
  return Math.abs(now - parsed) <= maxClockSkewMs;
}

async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    textEncoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    textEncoder.encode(message),
  );
  return toHex(signature);
}

async function sha256Hex(value: string | Uint8Array): Promise<string> {
  const bytes = typeof value === "string" ? textEncoder.encode(value) : value;
  return toHex(
    await crypto.subtle.digest("SHA-256", bytesToArrayBuffer(bytes)),
  );
}

function bytesToArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
}

function readHeader(
  headers: Headers | Record<string, string>,
  name: string,
): string | null {
  if (headers instanceof Headers) return headers.get(name);
  return headers[name] ?? headers[name.toLowerCase()] ?? null;
}

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}
