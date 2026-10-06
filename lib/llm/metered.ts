import { chatCompletion, chatCompletionStream } from "./client";
import type { ChatOptions, LLMMessage, LLMTool } from "./types";
import { inputReservation, reserveCredits, settleCredits, releaseCredits, type CreditAccount } from "@/lib/credits/server";

export async function meteredChatCompletion(account: CreditAccount, messages: LLMMessage[], tools?: LLMTool[], options?: ChatOptions) {
  const reservation = await reserveCredits(account, inputReservation(messages, tools), options?.maxTokens ?? 2048);
  let accepted = false;
  try {
    const result = await chatCompletion(messages, tools, { ...options, maxTokens: reservation.maxTokens,
      onAccepted: () => { accepted = true; }, onRejected: () => { accepted = false; } });
    await settleCredits(reservation.id, result.tokensIn, result.tokensOut, result.model);
    return result;
  } catch (error) {
    // Unknown usage stays pending for reconciliation, never billed as an estimate.
    if (!accepted) await releaseCredits(reservation.id);
    throw error;
  }
}

export async function* meteredChatCompletionStream(account: CreditAccount, messages: LLMMessage[], tools?: LLMTool[], options?: ChatOptions) {
  const reservation = await reserveCredits(account, inputReservation(messages, tools), options?.maxTokens ?? 2048);
  let accepted = false;
  let settled = false;
  try {
    for await (const event of chatCompletionStream(messages, tools, {
      ...options, maxTokens: reservation.maxTokens, onAccepted: () => { accepted = true; }, onRejected: () => { accepted = false; },
    })) {
      if (event.type === "usage" || event.type === "done") {
        if (!settled) {
          await settleCredits(reservation.id, event.tokensIn, event.tokensOut, event.model);
          settled = true;
        }
      }
      yield event;
    }
  } finally {
    if (!accepted && !settled) await releaseCredits(reservation.id);
  }
}
