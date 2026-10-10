export const TOKENS_PER_CREDIT = 1_000;
export const MONTHLY_CREDITS = { esencial: 1_000, crecimiento: 4_000, equipo: 10_000 } as const;
export const NEXO_MESSAGE_LIMITS = { trial: 15, demo: 20, esencial: 40, crecimiento: 100, equipo: 200 } as const;
export interface MessageBalance {
  plan: string;
  businessName: string | null;
  quotaMessages: number;
  usedMessages: number;
  reservedMessages: number;
  availableMessages: number;
  windowHours: number;
  /** Next individual slot recovery; null when the allowance is already full. */
  resetsAt: string | null;
  fullyResetsAt: string | null;
}

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
