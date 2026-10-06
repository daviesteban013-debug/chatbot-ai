import assert from "node:assert/strict";
import { before, beforeEach, after, test } from "node:test";
import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

const tenant = "11111111-1111-4111-8111-111111111111";
const otherTenant = "22222222-2222-4222-8222-222222222222";
const user = "33333333-3333-4333-8333-333333333333";
const otherUser = "44444444-4444-4444-8444-444444444444";
let db;
before(async () => {
  db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
    $$;
    grant usage on schema auth to authenticated;
    grant execute on function auth.uid() to authenticated;`);
  const dir = new URL("../../supabase/migrations/", import.meta.url);
  for (const file of (await readdir(dir)).filter(f => f.endsWith(".sql")).sort()) {
    // gen_random_uuid is built into this Postgres; pgcrypto isn't needed by these migrations.
    await db.exec((await readFile(new URL(file, dir), "utf8")).replace("create extension if not exists pgcrypto;", ""));
  }
  await db.query("insert into auth.users(id) values ($1), ($2)", [user, otherUser]);
  await db.query("insert into tenants(id, name, slug) values ($1, 'A', 'a'), ($2, 'B', 'b')", [tenant, otherTenant]);
  await db.query("insert into tenant_members(tenant_id, user_id) values ($1,$2), ($3,$4)", [tenant, user, otherTenant, otherUser]);
});
after(async () => { await db?.close(); });
beforeEach(async () => {
  await db.exec("reset role; truncate public.credit_requests, public.credit_periods; update credit_limits set tokens = 1000000 where plan = 'esencial';");
  await db.exec("update tenants set plan = 'esencial', stripe_subscription_status = 'active', stripe_current_period_end = now() + interval '2 months';");
  await db.exec("update billing_settings set mode='test'; update tenants set stripe_mode='test';");
});
const balance = async (id = tenant, uid = null) => (await db.query("select credit_balance($1,$2) as value", [id, uid])).rows[0].value;
const reserve = async (requested = 600000, minimum = requested, channel = "web", id = crypto.randomUUID()) => ({ id, ...(await db.query("select reserve_credits($1,$2,null,$3,$4,$5) as value", [id, tenant, requested, minimum, channel])).rows[0].value });
const settle = (id, input = 120, output = 130) => db.query("select settle_credits($1,$2,$3,'test-model')", [id, input, output]);

test("live cutover cannot carry over a test subscription's paid allowance", async () => {
  assert.equal((await balance()).quotaTokens,1000000);
  await db.exec("update billing_settings set mode='live';");
  assert.equal((await balance()).quotaTokens,20000);
  await db.exec("update tenants set stripe_mode='live';");
  assert.equal((await balance()).quotaTokens,1000000);
});

test("checkout retries share an attempt; competing plans are rejected and browsers cannot reserve checkout", async () => {
  await db.query("insert into billing_accounts(tenant_id,mode,customer_id) values($1,'test','cus_fixture') on conflict do nothing",[tenant]);
  await db.query("update billing_accounts set checkout_expires_at=null where tenant_id=$1",[tenant]);
  const claim=async(plan='esencial')=>(await db.query("select claim_billing_checkout($1,'test',$2,false) as value",[tenant,plan])).rows[0].value;
  const a=await claim(),b=await claim();assert.equal(a.ok,true);assert.equal(a.attempt,b.attempt);assert.equal((await claim('equipo')).ok,false);
  await db.exec("set role authenticated;");
  try { await assert.rejects(claim(),/permission denied/); await assert.rejects(db.query("update billing_settings set mode='live'"),/permission denied/); }
  finally { await db.exec("reset role;"); }
});

test("all versioned migrations apply; configured plans contain the selected monthly credits", async () => {
  const rows = (await db.query("select plan,tokens from credit_limits where plan in ('esencial','crecimiento','equipo') order by tokens")).rows;
  assert.deepEqual(rows.map(r => Number(r.tokens)), [1000000, 4000000, 10000000]);
  assert.equal((await balance()).quotaTokens, 1000000);
});
test("competing web and WhatsApp reservations cannot spend the same balance", async () => {
  const attempts = await Promise.all([reserve(600000,600000,"web"), reserve(600000,600000,"whatsapp")]);
  assert.equal(attempts.filter(r => r.ok).length, 1);
  assert.equal((await balance()).availableTokens, 400000);
  assert.equal((await balance()).reservedTokens, 600000);
});
test("actual usage charges fractions; duplicate settlement is idempotent and refunds unused reservation", async () => {
  const r = await reserve(10000);
  await settle(r.id);
  await settle(r.id);
  assert.equal((await balance()).usedTokens, 250);
  assert.equal((await balance()).availableTokens, 999750);
  assert.equal((await balance()).reservedTokens, 0);
  await assert.rejects(settle(r.id, 121, 130), /credit_usage_conflict/);
});
test("definitive rejections release only once; settled requests cannot be refunded", async () => {
  const r = await reserve(10000);
  await db.query("select release_credits($1)", [r.id]);
  await db.query("select release_credits($1)", [r.id]);
  assert.equal((await balance()).availableTokens, 1000000);
  await assert.rejects(settle(r.id), /credit_request_released/);
  const s = await reserve(10000); await settle(s.id);
  await assert.rejects(db.query("select release_credits($1)", [s.id]), /credit_request_settled/);
});
test("reservations adapt to remaining tokens; exhausted balances reject without negative reservations", async () => {
  const r = await reserve(999000); await settle(r.id, 998500, 500);
  const short = await reserve(2000, 500);
  assert.equal(short.reservedTokens, 1000);
  assert.equal((await reserve(1,1)).ok, false);
  assert.equal((await balance()).availableTokens, 0);
  assert.equal((await balance()).reservedTokens, 1000);
  await assert.rejects(reserve(0,0), /credit_reservation_invalid/);
});
test("upgrades change the quota without resetting consumption; canceled and expired plans lose paid allowance", async () => {
  const r = await reserve(10000); await settle(r.id, 4000, 1000);
  await db.query("update tenants set plan='crecimiento' where id=$1", [tenant]);
  assert.equal((await balance()).quotaTokens, 4000000);
  assert.equal((await balance()).usedTokens, 5000);
  await db.query("update tenants set stripe_subscription_status='canceled' where id=$1", [tenant]);
  assert.equal((await balance()).quotaTokens, 20000);
  await db.query("update tenants set stripe_subscription_status='active',stripe_current_period_end=now()-interval '1 day' where id=$1", [tenant]);
  assert.equal((await balance()).plan, "trial");
});
test("a previous-period settlement stays in its original month; current credits do not reset on reads", async () => {
  const current = await balance();
  await db.query(`insert into credit_periods(owner_key,period_start,tenant_id,resets_at,quota_tokens,reserved_tokens)
    values($1, date_trunc('month',now() at time zone 'UTC')::date-interval '1 month', $2, now(), 1000000, 1000)`, [current.ownerKey,tenant]);
  const id = crypto.randomUUID();
  await db.query(`insert into credit_requests(id,owner_key,period_start,channel,reserved_tokens)
    values($1,$2,date_trunc('month',now() at time zone 'UTC')::date-interval '1 month','web',1000)`, [id,current.ownerKey]);
  await settle(id,100,150);
  assert.equal((await balance()).usedTokens, 0);
  assert.equal((await balance()).availableTokens, 1000000);
});
test("demo visitors share a bounded daily pool; account trials cannot spoof monthly paid limits", async () => {
  assert.equal((await balance(null,null)).quotaTokens, 100000);
  assert.equal((await balance(null,user)).quotaTokens, 20000);
  await db.query("update tenants set stripe_subscription_status='unknown' where id=$1", [tenant]);
  assert.equal((await balance()).quotaTokens, 20000);
});
test("RLS isolates periods and requests; browsers cannot change quotas or execute charging RPCs", async () => {
  const a = await reserve(10000);
  await balance(otherTenant);
  await db.exec("set role authenticated;");
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[user]);
  try {
    const periods = (await db.query("select owner_key from credit_periods")).rows;
    assert.deepEqual(periods.map(r => r.owner_key), [`tenant:${tenant}`]);
    assert.equal((await db.query("select id from credit_requests")).rows[0].id, a.id);
    await assert.rejects(db.query("select credit_balance($1,null)",[tenant]), /permission denied/);
    await assert.rejects(db.query("select settle_credits($1,0,0,'x')",[a.id]), /permission denied/);
    await assert.rejects(db.query("update credit_limits set tokens=999999999"), /permission denied/);
    await assert.rejects(db.query("update credit_periods set used_tokens=0"), /permission denied/);
  } finally { await db.exec("reset role;"); }
});
test("unknown usage keeps the reservation pending; an unexpectedly large actual usage is recorded in full", async () => {
  const r = await reserve(10000);
  assert.equal((await balance()).reservedTokens, 10000);
  await settle(r.id, 1000000, 1);
  assert.equal((await balance()).usedTokens, 1000001);
  assert.equal((await balance()).availableTokens, 0);
  assert.equal((await reserve(1,1)).ok, false);
});
