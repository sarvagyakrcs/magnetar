import type { BodyType } from "../types/body";

type Algo = NonNullable<BodyType["algo"]>;

export type TelemetryContext = {
  requestId: string;
  method: string;
  path: string;
  query?: string;
  clientId?: string;
  hasRequestBody: boolean;
  payloadBytes?: number;
};

export type TelemetryDecision = {
  algo: Algo;
  workerUrl: string;
  targetUrl: string;
  workerCount: number;
};

export type TelemetryOutcome = {
  statusCode: number;
  latencyMs: number;
  success: boolean;
};

export type RoutingTelemetryRecord = {
  version: number;
  telemetryId: string;
  capturedAt: string;
  context: TelemetryContext;
  decision: TelemetryDecision;
  outcome: TelemetryOutcome;
  reward: number;
};

export type CollectTelemetryInput = {
  context: TelemetryContext;
  decision: TelemetryDecision;
  outcome: {
    statusCode: number;
    latencyMs: number;
    success?: boolean;
  };
  reward?: number;
  telemetryId?: string;
  capturedAt?: string;
};

const deriveSuccess = (
  statusCode: number,
  providedSuccess?: boolean
): boolean => {
  if (typeof providedSuccess === "boolean") {
    return providedSuccess;
  }
  return statusCode >= 200 && statusCode < 500;
};

const deriveReward = (success: boolean, reward?: number): number => {
  if (typeof reward === "number" && Number.isFinite(reward)) {
    return reward;
  }
  return success ? 1 : 0;
};

/**
 * Produces the normalized telemetry record used by the routing learner/MAB strategy.
 */
export const collectRoutingTelemetry = (
  input: CollectTelemetryInput
): RoutingTelemetryRecord => {
  const telemetryId = input.telemetryId ?? crypto.randomUUID();
  const capturedAt = input.capturedAt ?? new Date().toISOString();
  const success = deriveSuccess(
    input.outcome.statusCode,
    input.outcome.success
  );
  const reward = deriveReward(success, input.reward);

  return {
    version: 1,
    telemetryId,
    capturedAt,
    context: input.context,
    decision: input.decision,
    outcome: {
      statusCode: input.outcome.statusCode,
      latencyMs: input.outcome.latencyMs,
      success,
    },
    reward,
  };
};

