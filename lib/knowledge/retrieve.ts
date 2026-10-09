import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, KnowledgeMatch } from "@/lib/database.types";

export const KNOWLEDGE_EMBEDDING_MODEL = "text-embedding-3-small";
export const KNOWLEDGE_EMBEDDING_DIMENSIONS = 1536;

/**
 * Use the user's authenticated client and the tenant resolved by getCurrentTenant.
 * The RPC checks membership again; service-role retrieval is deliberately denied.
 * This foundation does not generate embeddings or call the language model yet.
 */
export async function retrieveKnowledge(
  supabase: SupabaseClient<Database>,
  tenantId: string,
  embedding: number[],
  options: { limit?: number; minSimilarity?: number } = {},
): Promise<KnowledgeMatch[]> {
  const limit = options.limit ?? 5;
  const minSimilarity = options.minSimilarity ?? 0.5;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(tenantId)
    || !Array.isArray(embedding) || embedding.length !== KNOWLEDGE_EMBEDDING_DIMENSIONS
    || Array.from(embedding).some(value => typeof value !== "number" || !Number.isFinite(value))
    || !embedding.some(value => value !== 0)
    || !Number.isInteger(limit) || limit < 1 || limit > 10
    || !Number.isFinite(minSimilarity) || minSimilarity < 0 || minSimilarity > 1) {
    throw new Error("KNOWLEDGE_INVALID_QUERY");
  }
  const { data, error } = await supabase.rpc("match_knowledge_chunks", {
    p_tenant_id: tenantId,
    p_embedding: JSON.stringify(embedding),
    p_limit: limit,
    p_min_similarity: minSimilarity,
  });
  // Do not surface database details, document contents or credentials in errors.
  if (error) throw new Error("KNOWLEDGE_RETRIEVAL_FAILED");
  return data ?? [];
}
