import assert from "node:assert/strict";
import { before, after, beforeEach, afterEach, test } from "node:test";
import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite-pgvector";

const tenant = crypto.randomUUID(), otherTenant = crypto.randomUUID();
const owner = crypto.randomUUID(), otherOwner = crypto.randomUUID();
const agent = crypto.randomUUID(), viewer = crypto.randomUUID(), dual = crypto.randomUUID();
const source = crypto.randomUUID(), otherSource = crypto.randomUUID();
const embedding = (x = 1, y = 0) => JSON.stringify([x, y, ...Array(1534).fill(0)]);
let db;

before(async () => {
  db = new PGlite({ extensions: { vector } });
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema auth to authenticated;
    grant execute on function auth.uid() to authenticated;
    create schema storage; create table storage.buckets(id text primary key,name text,public boolean,file_size_limit integer);`);
  const dir = new URL("../../supabase/migrations/", import.meta.url);
  for (const file of (await readdir(dir)).filter(f => f.endsWith(".sql")).sort()) {
    await db.exec((await readFile(new URL(file, dir), "utf8")).replace("create extension if not exists pgcrypto;", ""));
  }
  // Match Supabase's existing grant; tenant_members' own-row RLS remains active.
  await db.exec("grant select on public.tenant_members to authenticated");
  for (const uid of [owner, otherOwner, agent, viewer, dual]) await db.query("insert into auth.users values($1)", [uid]);
  await db.query("insert into tenants(id,name,slug) values($1,'A','knowledge-a'),($2,'B','knowledge-b')", [tenant, otherTenant]);
  for (const [tid, uid, role] of [[tenant,owner,"owner"], [tenant,agent,"agent"], [tenant,viewer,"viewer"], [tenant,dual,"owner"], [otherTenant,dual,"owner"], [otherTenant,otherOwner,"owner"]]) {
    await db.query("insert into tenant_members(tenant_id,user_id,role) values($1,$2,$3)", [tid,uid,role]);
  }
  await db.query("insert into knowledge_sources(id,tenant_id,name,kind,status) values($1,$2,'Catálogo A','file','ready'),($3,$4,'Catálogo B','file','ready')", [source,tenant,otherSource,otherTenant]);
  await chunk(source,tenant,0,"A primero",embedding(),1);
  await chunk(source,tenant,1,"A segundo",embedding(0.8,0.6),1);
  await chunk(otherSource,otherTenant,0,"ONLY_B",embedding(),1);
});
beforeEach(async () => { await db.exec("begin"); });
afterEach(async () => { await db.exec("rollback; reset role"); });
after(async () => { await db?.close(); });

async function chunk(sid, tid, index, content, vec = embedding(), revision = 1) {
  return db.query("insert into knowledge_chunks(tenant_id,source_id,chunk_index,content,embedding,revision,page_number,metadata) values($1,$2,$3,$4,$5,$6,1,'{\"section\":\"catálogo\"}')", [tid,sid,index,content,vec,revision]);
}
async function asUser(uid = owner) {
  await db.query("select set_config('request.jwt.claim.sub',$1,true)", [uid]);
  await db.exec("set local role authenticated");
}
async function matches(tid = tenant, vec = embedding(), limit = 5, threshold = 0.5) {
  return (await db.query("select * from match_knowledge_chunks($1,$2,$3,$4)", [tid,vec,limit,threshold])).rows;
}
async function denied(operation, pattern) {
  await db.exec("savepoint expected_failure");
  await assert.rejects(operation, pattern);
  await db.exec("rollback to savepoint expected_failure");
}

test("vector extension and HNSW cosine index are installed; query can use the index", async () => {
  const info = (await db.query("select extnamespace::regnamespace::text as schema from pg_extension where extname='vector'")).rows[0];
  assert.equal(info.schema,"extensions");
  await db.exec("set local enable_seqscan=off");
  const plan = await db.query("explain select id from knowledge_chunks order by embedding operator(extensions.<=>) $1::extensions.vector limit 5", [embedding()]);
  assert.match(JSON.stringify(plan.rows), /knowledge_chunks_embedding_hnsw_idx/);
});

test("members receive ranked current-tenant results with source, page and revision references", async () => {
  for (const uid of [owner, agent, viewer]) {
    await asUser(uid);
    const rows = await matches();
    assert.deepEqual(rows.map(row => row.content), ["A primero","A segundo"]);
    assert.equal(rows[0].source_id, source);
    assert.equal(rows[0].source_name, "Catálogo A");
    assert.equal(rows[0].page_number, 1);
    assert.equal(rows[0].revision, 1);
    assert.deepEqual(rows[0].metadata, {section:"catálogo"});
    assert.ok(rows[0].similarity > rows[1].similarity);
    assert.equal((await matches(tenant,embedding(),1)).length,1);
    assert.equal((await matches(tenant,embedding(),5,0.9)).length,1);
    await db.exec("reset role");
  }
});

test("RLS protects raw reads, forged tenant RPC arguments and multi-membership selection", async () => {
  await asUser();
  assert.deepEqual((await db.query("select distinct tenant_id from knowledge_chunks")).rows,[{tenant_id:tenant}]);
  assert.deepEqual((await db.query("select distinct tenant_id from knowledge_sources")).rows,[{tenant_id:tenant}]);
  await denied(() => matches(otherTenant), /KNOWLEDGE_FORBIDDEN/);
  await db.exec("reset role"); await asUser(otherOwner);
  assert.deepEqual((await matches(otherTenant)).map(row=>row.content),["ONLY_B"]);
  await db.exec("reset role"); await asUser(dual);
  assert.deepEqual((await matches()).map(row=>row.content),["A primero","A segundo"]);
  assert.deepEqual((await matches(otherTenant)).map(row=>row.content),["ONLY_B"]);
});

test("revoking membership removes both direct and RPC access immediately", async () => {
  await db.query("delete from tenant_members where tenant_id=$1 and user_id=$2", [tenant,owner]);
  await asUser();
  assert.equal((await db.query("select * from knowledge_chunks")).rows.length,0);
  await denied(() => matches(), /KNOWLEDGE_FORBIDDEN/);
});

test("retrieval excludes drafts, failed, archived and old document revisions", async () => {
  await chunk(source,tenant,0,"A revisión nueva",embedding(),2);
  for (const status of ["draft","indexing","failed","archived"]) {
    await db.query("update knowledge_sources set status=$1 where id=$2",[status,source]);
    await asUser(); assert.equal((await matches()).length,0); await db.exec("reset role");
  }
  await db.query("update knowledge_sources set status='ready',revision=2 where id=$1",[source]);
  await asUser(); assert.deepEqual((await matches()).map(row=>row.content),["A revisión nueva"]);
});

test("authenticated and anonymous clients cannot ingest, edit or delete knowledge", async () => {
  await asUser();
  for (const table of ["knowledge_sources","knowledge_chunks"]) {
    await denied(() => db.exec(`delete from ${table}`), /permission denied/);
    await denied(() => db.exec(`update ${table} set tenant_id=gen_random_uuid()`), /permission denied/);
  }
  await denied(() => chunk(source,tenant,2,"Browser write"), /permission denied/);
  await denied(() => db.query("insert into knowledge_sources(tenant_id,name,kind) values($1,'Browser','manual')",[tenant]), /permission denied/);
  await db.exec("reset role; set local role anon");
  await denied(() => db.exec("select * from knowledge_chunks"), /permission denied/);
  await denied(() => db.exec("select * from knowledge_sources"), /permission denied/);
  await denied(() => matches(), /permission denied/);
});

test("only authenticated callers have retrieval execution; service-role is ingestion-only", async () => {
  for (const [role, allowed] of [["anon",false],["authenticated",true],["service_role",false]]) {
    const acl = (await db.query("select has_function_privilege($1,'public.match_knowledge_chunks(uuid,extensions.vector,integer,double precision)','EXECUTE') allowed",[role])).rows[0];
    assert.equal(acl.allowed,allowed);
  }
  await db.exec("set local role service_role");
  await chunk(source,tenant,2,"Trusted ingestion");
  await denied(() => matches(),/permission denied/);
});

test("foreign source linkage and tenant reassignment are rejected even for ingestion", async () => {
  await db.exec("set local role service_role");
  await denied(() => chunk(otherSource,tenant,2,"Bad tenant link"), /foreign key constraint/);
  await denied(() => db.query("update knowledge_sources set tenant_id=$1 where id=$2",[otherTenant,source]), /KNOWLEDGE_IDENTITY_IMMUTABLE/);
  await denied(() => db.query("update knowledge_chunks set tenant_id=$1,source_id=$2 where source_id=$3",[otherTenant,otherSource,source]), /KNOWLEDGE_IDENTITY_IMMUTABLE/);
  await denied(() => db.query("update knowledge_chunks set revision=2 where source_id=$1",[source]), /KNOWLEDGE_IDENTITY_IMMUTABLE/);
  await denied(() => db.query("update knowledge_sources set revision=0 where id=$1",[source]), /KNOWLEDGE_REVISION_REGRESSION/);
});

test("invalid query dimensions, zero vectors, nulls, thresholds and limits are rejected", async () => {
  await asUser();
  for (const [vec,limit,threshold] of [["[1,0]",5,0.5],[embedding(0,0),5,0.5],[null,5,0.5],[embedding(),0,0.5],[embedding(),11,0.5],[embedding(),null,0.5],[embedding(),5,-0.1],[embedding(),5,1.1],[embedding(),5,null],[embedding(),5,"NaN"]]) {
    await denied(() => matches(tenant,vec,limit,threshold), /KNOWLEDGE_INVALID_QUERY/);
  }
});

test("storage rejects incompatible vectors, oversized content and malformed metadata", async () => {
  await denied(() => chunk(source,tenant,2,"Wrong dimensions","[1,0]"), /expected 1536 dimensions/);
  await denied(() => chunk(source,tenant,2,"Zero",embedding(0,0)), /check constraint/);
  await denied(() => chunk(source,tenant,2," "), /check constraint/);
  await denied(() => chunk(source,tenant,2,"x".repeat(6001)), /check constraint/);
  await denied(() => chunk(source,tenant,2," ".repeat(6000)+"x"), /check constraint/);
  await denied(() => db.query("update knowledge_sources set name=$1 where id=$2",[" ".repeat(200)+"x",source]), /check constraint/);
  await denied(() => db.query("update knowledge_chunks set metadata='[]' where source_id=$1",[source]), /check constraint/);
  await denied(() => db.query("update knowledge_sources set embedding_model='other-model' where id=$1",[source]), /check constraint/);
  await denied(() => db.query("update knowledge_sources set metadata=$1 where id=$2",[JSON.stringify({text:"x".repeat(17000)}),source]), /check constraint/);
});

test("deleting a source cascades only its own chunks", async () => {
  await db.query("delete from knowledge_sources where id=$1",[source]);
  assert.deepEqual((await db.query("select tenant_id from knowledge_chunks")).rows,[{tenant_id:otherTenant}]);
});
