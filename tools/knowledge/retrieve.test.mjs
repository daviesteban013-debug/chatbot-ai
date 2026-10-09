import assert from "node:assert/strict";
import { test } from "node:test";
import { load } from "../agent/load.mjs";
const { retrieveKnowledge, KNOWLEDGE_EMBEDDING_MODEL, KNOWLEDGE_EMBEDDING_DIMENSIONS } = await import(await load("../../lib/knowledge/retrieve.ts"));
const tenant = crypto.randomUUID();
const vector = () => [1,...Array(1535).fill(0)];

test("retrieval passes tenant and bounded vector search to authenticated RPC and preserves citations", async () => {
  const rows = [{ id:crypto.randomUUID(), source_id:crypto.randomUUID(), source_name:"Manual", revision:2, chunk_index:0, content:"Políticas", page_number:4, metadata:{section:"Ventas"}, similarity:0.9 }];
  const client = { rpc: async (name,args) => {
    assert.equal(name,"match_knowledge_chunks");
    assert.deepEqual(args,{p_tenant_id:tenant,p_embedding:JSON.stringify(vector()),p_limit:3,p_min_similarity:0.7});
    return {data:rows,error:null};
  } };
  assert.deepEqual(await retrieveKnowledge(client,tenant,vector(),{limit:3,minSimilarity:0.7}),rows);
  assert.equal(KNOWLEDGE_EMBEDDING_MODEL,"text-embedding-3-small");
  assert.equal(KNOWLEDGE_EMBEDDING_DIMENSIONS,1536);
});

test("malformed vectors and search bounds fail before any database call", async () => {
  let calls=0; const client={rpc:async()=>{calls++; return {data:[],error:null};}};
  const badVectors = [[],[1,0],Array(1536).fill(0),Array(1536),[NaN,...vector().slice(1)],[Infinity,...vector().slice(1)],["1",...vector().slice(1)],null];
  for (const vec of badVectors) await assert.rejects(retrieveKnowledge(client,tenant,vec),/KNOWLEDGE_INVALID_QUERY/);
  for (const options of [{limit:0},{limit:11},{limit:2.5},{minSimilarity:-0.1},{minSimilarity:1.1},{minSimilarity:NaN}]) {
    await assert.rejects(retrieveKnowledge(client,tenant,vector(),options),/KNOWLEDGE_INVALID_QUERY/);
  }
  await assert.rejects(retrieveKnowledge(client,"forged",vector()),/KNOWLEDGE_INVALID_QUERY/);
  assert.equal(calls,0);
});

test("empty results are safe and database failures do not expose private details", async () => {
  assert.deepEqual(await retrieveKnowledge({rpc:async()=>({data:null,error:null})},tenant,vector()),[]);
  await assert.rejects(retrieveKnowledge({rpc:async()=>({data:null,error:{message:"private database detail"}})},tenant,vector()),{message:"KNOWLEDGE_RETRIEVAL_FAILED"});
});
