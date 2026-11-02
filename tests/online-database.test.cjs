const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { PGlite } = require("@electric-sql/pglite");

const userA = "00000000-0000-4000-8000-000000000001";
const userB = "00000000-0000-4000-8000-000000000002";
const projectA = "10000000-0000-4000-8000-000000000001";
const projectB = "10000000-0000-4000-8000-000000000002";
const values = {
  format: "landing", title: "Aprender", subtitle: "Texto", name: "Alexandra", role: "Psicopedagoga",
  cta: "Contato", phone: "(51) 98134-3844", primary: "#123d75", accent: "#e83d83"
};

test("Supabase schema enforces private projects, photo ownership and public snapshots", async (t) => {
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(`
    create role anon nologin;
    create role authenticated nologin;
    create schema auth;
    create schema storage;
    create table auth.users (id uuid primary key);
    insert into auth.users values ('${userA}'), ('${userB}');
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
    $$;
    create table storage.buckets(id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
    create table storage.objects(id uuid primary key default gen_random_uuid(), bucket_id text, name text, unique(bucket_id, name));
    create function storage.foldername(name text) returns text[] language sql immutable as $$
      select string_to_array(name, '/');
    $$;
    alter table storage.objects enable row level security;
    grant usage on schema public, auth, storage to anon, authenticated;
    grant select, insert, update, delete on storage.objects to anon, authenticated;
  `);
  await db.exec(fs.readFileSync(path.join(__dirname, "..", "supabase", "setup.sql"), "utf8"));

  async function as(role, uid, sql, params = []) {
    await db.exec(`set role ${role}; select set_config('request.jwt.claim.sub', '${uid || ""}', false);`);
    try { return await db.query(sql, params); }
    finally { await db.exec("reset role"); }
  }
  const aPhoto = `${userA}/${projectA}/private.png`;
  const bPhoto = `${userB}/${projectB}/private.png`;
  await as("authenticated", userA,
    'insert into public.studio_projects(id,"values",photo_path) values ($1,$2,$3)', [projectA, values, aPhoto]);
  await as("authenticated", userB,
    'insert into public.studio_projects(id,"values",photo_path) values ($1,$2,$3)', [projectB, values, bPhoto]);

  const own = await as("authenticated", userA, "select id from public.studio_projects");
  assert.deepEqual(own.rows.map((row) => row.id), [projectA]);
  await assert.rejects(() => as("anon", null, "select * from public.studio_projects"), /permission denied/);
  await assert.rejects(() => as("authenticated", userB,
    'insert into public.studio_projects(id,owner_id,"values",photo_path) values ($1,$2,$3,$4)',
    ["10000000-0000-4000-8000-000000000003", userA, values, aPhoto]), /row-level security|check constraint/);
  const changed = await as("authenticated", userB,
    "update public.studio_projects set revision=2 where id=$1 returning id", [projectA]);
  assert.equal(changed.rows.length, 0);
  await assert.rejects(() => as("authenticated", userA,
    'update public.studio_projects set "values"=$1 where id=$2',
    [{ ...values, primary: "</style>" }, projectA]), /check constraint/);
  const missing = { ...values };
  delete missing.role;
  await assert.rejects(() => as("authenticated", userA,
    'update public.studio_projects set "values"=$1 where id=$2', [missing, projectA]), /check constraint/);

  await as("authenticated", userA, "insert into storage.objects(bucket_id,name) values ('studio-private',$1)", [aPhoto]);
  assert.equal((await as("authenticated", userB, "select * from storage.objects")).rows.length, 0);
  await assert.rejects(() => as("authenticated", userB,
    "insert into storage.objects(bucket_id,name) values ('studio-private',$1)", [`${userA}/stolen.png`]), /row-level security/);
  const publicPhoto = `${userA}/${projectA}/published.png`;
  await as("authenticated", userA, "insert into storage.objects(bucket_id,name) values ('studio-public',$1)", [publicPhoto]);
  const publishSql = "select * from public.publish_studio_project($1,$2,$3,$4)";
  await assert.rejects(() => as("anon", null, publishSql, [projectA, "alexandra", publicPhoto, 1]), /permission denied/);
  await assert.rejects(() => as("authenticated", userB, publishSql, [projectA, "alexandra", publicPhoto, 1]), /acesso negado/);
  await assert.rejects(() => as("authenticated", userA, publishSql, [projectA, "alexandra", publicPhoto, 2]), /outra aba/);
  await assert.rejects(() => as("authenticated", userA, publishSql,
    [projectA, "alexandra", `${userA}/${projectA}/missing.png`, 1]), /Foto pública inválida/);
  await as("authenticated", userA, publishSql, [projectA, "alexandra", publicPhoto, 1]);
  await as("authenticated", userA, 'update public.studio_projects set "values"=$1 where id=$2',
    [{ ...values, title: "Rascunho privado alterado" }, projectA]);
  const publicRows = await as("anon", null, "select * from public.studio_pages");
  assert.equal(publicRows.rows.length, 1);
  assert.equal(publicRows.rows[0].values.title, "Aprender");
  await assert.rejects(() => as("authenticated", userB,
    'insert into public.studio_pages(project_id,owner_id,slug,"values",photo_path) values ($1,$2,$3,$4,$5)',
    [projectB, userB, "outra", values, bPhoto]), /permission denied/);
  const unauthorizedDelete = await as("authenticated", userB,
    "delete from public.studio_pages where project_id=$1 returning *", [projectA]);
  assert.equal(unauthorizedDelete.rows.length, 0);
  const bPublic = `${userB}/${projectB}/published.png`;
  await as("authenticated", userB, "insert into storage.objects(bucket_id,name) values ('studio-public',$1)", [bPublic]);
  await assert.rejects(() => as("authenticated", userB, publishSql, [projectB, "alexandra", bPublic, 1]), /unique constraint/);
  await as("authenticated", userA, "delete from public.studio_pages where project_id=$1", [projectA]);
  assert.equal((await as("anon", null, "select * from public.studio_pages")).rows.length, 0);
});
