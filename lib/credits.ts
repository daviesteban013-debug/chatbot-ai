export const TOKENS_PER_CREDIT = 1_000;
export const MONTHLY_CREDITS = { esencial: 1_000, crecimiento: 4_000, equipo: 10_000 } as const;

export interface CreditBalance {
  ownerKey: string;
  periodStart: string;
  resetsAt: string;
  plan: string;
  quotaTokens: number;
  usedTokens: number;
  reservedTokens: number;
  availableTokens: number;
}

export function formatCredits(tokens: number): string {
  return (tokens / TOKENS_PER_CREDIT).toLocaleString("es-CO", { maximumFractionDigits: 3 });
}

export function creditState(balance: CreditBalance): "exhausted" | "low" | "ready" {
  if (balance.availableTokens <= 0) return "exhausted";
  return balance.availableTokens <= balance.quotaTokens * 0.1 ? "low" : "ready";
}
