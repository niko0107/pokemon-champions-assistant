import type { CounterplanResult } from "@pokemon-champions/matchup";
import type { SessionCounterplanExplanationStatusResponse } from "@pokemon-champions/shared";

export const COUNTERPLAN_EXPLANATION_STATUS = Symbol("COUNTERPLAN_EXPLANATION_STATUS");

export interface CounterplanExplanationStatusReader {
  getCounterplanExplanationStatus(
    input: CounterplanResult,
  ): Promise<SessionCounterplanExplanationStatusResponse>;
}
