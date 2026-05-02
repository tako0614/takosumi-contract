/**
 * Agent execution control RPC contract.
 *
 * These paths are called by `takos-agent` during a run.
 */

export const TAKOS_AGENT_CONTROL_INTERNAL_PREFIX =
  "/api/internal/v1/agent-control";

export const TAKOS_AGENT_CONTROL_INTERNAL_ENDPOINTS = [
  "heartbeat",
  "run-status",
  "run-record",
  "run-bootstrap",
  "run-fail",
  "run-reset",
  "run-context",
  "run-config",
  "no-llm-complete",
  "current-session",
  "is-cancelled",
  "conversation-history",
  "skill-runtime-context",
  "skill-catalog",
  "skill-plan",
  "memory-activation",
  "memory-finalize",
  "add-message",
  "update-run-status",
  "tool-catalog",
  "tool-execute",
  "tool-cleanup",
  "run-event",
  "billing-run-usage",
  "api-keys",
] as const;

export interface TakosAgentControlInternalPaths {
  readonly heartbeat: string;
  readonly runStatus: string;
  readonly runRecord: string;
  readonly runBootstrap: string;
  readonly runFail: string;
  readonly runReset: string;
  readonly runContext: string;
  readonly runConfig: string;
  readonly noLlmComplete: string;
  readonly currentSession: string;
  readonly isCancelled: string;
  readonly conversationHistory: string;
  readonly skillRuntimeContext: string;
  readonly skillCatalog: string;
  readonly skillPlan: string;
  readonly memoryActivation: string;
  readonly memoryFinalize: string;
  readonly addMessage: string;
  readonly updateRunStatus: string;
  readonly toolCatalog: string;
  readonly toolExecute: string;
  readonly toolCleanup: string;
  readonly runEvent: string;
  readonly billingRunUsage: string;
  readonly apiKeys: string;
}

export const TAKOS_AGENT_CONTROL_INTERNAL_PATHS:
  TakosAgentControlInternalPaths = {
    heartbeat: `${TAKOS_AGENT_CONTROL_INTERNAL_PREFIX}/heartbeat`,
    runStatus: `${TAKOS_AGENT_CONTROL_INTERNAL_PREFIX}/run-status`,
    runRecord: `${TAKOS_AGENT_CONTROL_INTERNAL_PREFIX}/run-record`,
    runBootstrap: `${TAKOS_AGENT_CONTROL_INTERNAL_PREFIX}/run-bootstrap`,
    runFail: `${TAKOS_AGENT_CONTROL_INTERNAL_PREFIX}/run-fail`,
    runReset: `${TAKOS_AGENT_CONTROL_INTERNAL_PREFIX}/run-reset`,
    runContext: `${TAKOS_AGENT_CONTROL_INTERNAL_PREFIX}/run-context`,
    runConfig: `${TAKOS_AGENT_CONTROL_INTERNAL_PREFIX}/run-config`,
    noLlmComplete: `${TAKOS_AGENT_CONTROL_INTERNAL_PREFIX}/no-llm-complete`,
    currentSession: `${TAKOS_AGENT_CONTROL_INTERNAL_PREFIX}/current-session`,
    isCancelled: `${TAKOS_AGENT_CONTROL_INTERNAL_PREFIX}/is-cancelled`,
    conversationHistory:
      `${TAKOS_AGENT_CONTROL_INTERNAL_PREFIX}/conversation-history`,
    skillRuntimeContext:
      `${TAKOS_AGENT_CONTROL_INTERNAL_PREFIX}/skill-runtime-context`,
    skillCatalog: `${TAKOS_AGENT_CONTROL_INTERNAL_PREFIX}/skill-catalog`,
    skillPlan: `${TAKOS_AGENT_CONTROL_INTERNAL_PREFIX}/skill-plan`,
    memoryActivation:
      `${TAKOS_AGENT_CONTROL_INTERNAL_PREFIX}/memory-activation`,
    memoryFinalize: `${TAKOS_AGENT_CONTROL_INTERNAL_PREFIX}/memory-finalize`,
    addMessage: `${TAKOS_AGENT_CONTROL_INTERNAL_PREFIX}/add-message`,
    updateRunStatus: `${TAKOS_AGENT_CONTROL_INTERNAL_PREFIX}/update-run-status`,
    toolCatalog: `${TAKOS_AGENT_CONTROL_INTERNAL_PREFIX}/tool-catalog`,
    toolExecute: `${TAKOS_AGENT_CONTROL_INTERNAL_PREFIX}/tool-execute`,
    toolCleanup: `${TAKOS_AGENT_CONTROL_INTERNAL_PREFIX}/tool-cleanup`,
    runEvent: `${TAKOS_AGENT_CONTROL_INTERNAL_PREFIX}/run-event`,
    billingRunUsage: `${TAKOS_AGENT_CONTROL_INTERNAL_PREFIX}/billing-run-usage`,
    apiKeys: `${TAKOS_AGENT_CONTROL_INTERNAL_PREFIX}/api-keys`,
  } as const;

export type TakosAgentControlInternalPath =
  (typeof TAKOS_AGENT_CONTROL_INTERNAL_PATHS)[
    keyof typeof TAKOS_AGENT_CONTROL_INTERNAL_PATHS
  ];

export function resolveTakosAgentControlInternalPath(endpoint: string): string {
  const normalized = endpoint.replace(/^\/+/, "");
  return `${TAKOS_AGENT_CONTROL_INTERNAL_PREFIX}/${normalized}`;
}
