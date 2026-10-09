import assert from "node:assert/strict";
import { before, after, beforeEach, test } from "node:test";
import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite-pgvector";
const user = "33333333-3333-4333-8333-333333333333", other = "44444444-4444-4444-8444-444444444444";
let db;
before(async () => {
  db = new PGlite({ extensions: { vector } });
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls; create schema auth; create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema auth to authenticated; grant execute on function auth.uid() to authenticated;
    create schema storage; create table storage.buckets(id text primary key,name text,public boolean,file_size_limit integer);`);
  const dir = new URL("../../supabase/migrations/", import.meta.url);
  for (const file of (await readdir(dir)).filter(f => f.endsWith(".sql")).sort()) await db.exec((await readFile(new URL(file, dir), "utf8")).replace("create extension if not exists pgcrypto;", ""));
  await db.query("insert into auth.users values ($1),($2)", [user, other]);
});
after(async () => { await db?.close(); });
beforeEach(async () => { await db.exec("reset role; delete from jarvis_files; delete from jarvis_sessions;"); });
const insert = async (uid = user, bytes = 10, session = null) => { const id = crypto.randomUUID(); await db.query("insert into jarvis_files(id,user_id,session_id,filename,object_path,mime_type,byte_size,status,sections) values ($1,$2,$3,'file.txt',$4,'text/plain',$5,'ready','[{\"reference\":\"línea 1\",\"text\":\"data\"}]')", [id, uid, session, `${uid}/${id}`, bytes]); return id; };

test("migration creates a private size-limited bucket and generated section count", async () => {
  assert.deepEqual((await db.query("select public,file_size_limit from storage.buckets where id='jarvis-files'")).rows[0], { public: false, file_size_limit: 3145728 });
  const id = await insert(); assert.equal((await db.query("select section_count from jarvis_files where id=$1", [id])).rows[0].section_count, 1);
});
test("RLS exposes only owner files and browsers cannot insert, reassign or delete rows", async () => {
  await insert(); await insert(other); await db.query("select set_config('request.jwt.claim.sub',$1,false)", [user]);
  await db.exec("set role authenticated"); assert.equal((await db.query("select count(*)::int n from jarvis_files")).rows[0].n, 1);
  await assert.rejects(db.exec("delete from jarvis_files"), /permission denied/); await assert.rejects(db.exec("update jarvis_files set user_id = gen_random_uuid()"), /permission denied/);
  await assert.rejects(insert(), /permission denied/); await db.exec("reset role; set role anon"); await assert.rejects(db.exec("select * from jarvis_files"), /permission denied/);
});
test("session ownership and immutable file identity are enforced in SQL", async () => {
  await db.query("insert into jarvis_sessions(session_id,user_id) values ('owner',$1),('other',$2),('next',$1)", [user, other]);
  await assert.rejects(insert(user,10,"other"), /file_session_forbidden/);
  const id = await insert(user,10,"owner"); await assert.rejects(db.query("update jarvis_files set session_id='next' where id=$1", [id]), /file_session_immutable/);
  await assert.rejects(db.query("update jarvis_files set byte_size=11 where id=$1", [id]), /file_identity_immutable/);
});
test("count and byte quotas reject excess files and deleting a file restores room", async () => {
  const ids = []; for (let i = 0; i < 40; i++) ids.push(await insert());
  await assert.rejects(insert(), /file_quota_exhausted/);
  await db.query("delete from jarvis_files where id=$1", [ids[0]]); await insert();
  await db.exec("delete from jarvis_files"); for (let i = 0; i < 20; i++) await insert(user,3145728);
  await assert.rejects(insert(), /file_quota_exhausted/);
});
test("object paths and size constraints cannot be bypassed through metadata", async () => {
  const id = crypto.randomUUID();
  await assert.rejects(db.query("insert into jarvis_files(id,user_id,filename,object_path,mime_type,byte_size,status) values ($1,$2,'x.txt','another-user/path','text/plain',1,'ready')", [id,user]), /check constraint/);
  await assert.rejects(insert(user,3145729), /check constraint/);
});
