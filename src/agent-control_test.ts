import { assertEquals } from "jsr:@std/assert";
import {
  resolveTakosAgentControlInternalPath,
  TAKOS_AGENT_CONTROL_INTERNAL_PATHS,
  TAKOS_AGENT_CONTROL_INTERNAL_PREFIX,
} from "./agent-control.ts";

Deno.test("agent control contract exposes canonical internal paths", () => {
  assertEquals(
    TAKOS_AGENT_CONTROL_INTERNAL_PREFIX,
    "/api/internal/v1/agent-control",
  );
  assertEquals(
    TAKOS_AGENT_CONTROL_INTERNAL_PATHS.runBootstrap,
    "/api/internal/v1/agent-control/run-bootstrap",
  );
  assertEquals(
    TAKOS_AGENT_CONTROL_INTERNAL_PATHS.toolExecute,
    "/api/internal/v1/agent-control/tool-execute",
  );
  assertEquals(
    resolveTakosAgentControlInternalPath("/run-event"),
    "/api/internal/v1/agent-control/run-event",
  );
});
