const test = require("node:test");
const assert = require("node:assert/strict");
const api = import("../src/online-client.mjs");

function fakeClient({ databaseError = null, publishError = null, cleanupError = null } = {}) {
  const operations = [];
  const client = {
    storage: {
      from(bucket) {
        return {
          upload: async (path, blob) => {
            operations.push({ action: "upload", bucket, path, size: blob.size });
            return { data: { path }, error: null };
          },
          download: async (path) => {
            operations.push({ action: "download", bucket, path });
            return { data: new Blob(["png"], { type: "image/png" }), error: null };
          },
          remove: async (paths) => {
            operations.push({ action: "cleanup", bucket, paths });
            return { error: cleanupError };
          },
          getPublicUrl: (path) => ({ data: { publicUrl: `https://test.supabase.co/public/${path}` } })
        };
      }
    },
    from(table) {
      const state = { action: "", table, filters: [] };
      const chain = {
        insert(row) { state.action = "insert"; state.row = row; return chain; },
        update(row) { state.action = "update"; state.row = row; return chain; },
        delete() { state.action = "delete"; return chain; },
        eq(...filter) { state.filters.push(filter); return chain; },
        select() { return chain; },
        single: async () => {
          operations.push(state);
          return { data: state.row || {}, error: databaseError };
        }
      };
      return chain;
    },
    rpc: async (name, args) => {
      operations.push({ action: "rpc", name, args });
      return { data: { slug: args.address, photo_path: args.image_path }, error: publishError };
    }
  };
  return { client, operations };
}

test("requires HTTPS Supabase URL and public publishable key, without accepting secrets", async () => {
  const { checkConfig, checkSlug, publicPageUrl } = await api;
  assert.equal(checkConfig({ supabaseUrl: "", publishableKey: "" }), null);
  for (const key of ["sb_secret_test", "service_role", "eyJ.legacy.key"]) {
    assert.throws(() => checkConfig({ supabaseUrl: "https://test.supabase.co", publishableKey: key }), /pública/);
  }
  assert.throws(() => checkConfig({ supabaseUrl: "https://example.com", publishableKey: "sb_publishable_test" }), /URL HTTPS/);
  assert.deepEqual(checkConfig({ supabaseUrl: "https://test.supabase.co", publishableKey: "sb_publishable_test" }),
    { url: "https://test.supabase.co", key: "sb_publishable_test" });
  assert.throws(() => checkSlug("../private"), /3 a 60/);
  assert.throws(() => checkSlug("A"), /3 a 60/);
  assert.equal(publicPageUrl("apoio-escolar", "https://example.com/editor/index.html?projeto=old"),
    "https://example.com/editor/landing.html?pagina=apoio-escolar");
});

test("saves private photos and uses optimistic revision checking before cleaning old photos", async () => {
  const { createProjectStore } = await api;
  const { client, operations } = fakeClient();
  const previous = { id: "project", revision: 3, photo_path: "owner/project/old.png" };
  const store = createProjectStore(client, assert.fail);
  const row = await store.save({ title: "Rascunho" }, new Blob(["png"], { type: "image/png" }), previous, "owner");
  assert.equal(row.revision, 4);
  assert.equal(operations[0].bucket, "studio-private");
  const update = operations.find((operation) => operation.action === "update");
  assert.deepEqual(update.filters, [["id", "project"], ["revision", 3]]);
  assert.deepEqual(operations.at(-1), { action: "cleanup", bucket: "studio-private", paths: [previous.photo_path] });
});

test("failed draft writes remove the new upload and preserve the old photo", async () => {
  const { createProjectStore } = await api;
  const { client, operations } = fakeClient({ databaseError: { message: "Revision conflict" } });
  const previous = { id: "project", revision: 1, photo_path: "owner/project/old.png" };
  await assert.rejects(() => createProjectStore(client, assert.fail).save({},
    new Blob(["png"], { type: "image/png" }), previous, "owner"), /Não foi possível salvar/);
  const removed = operations.filter((operation) => operation.action === "cleanup").flatMap((operation) => operation.paths);
  assert.equal(removed.length, 1);
  assert.ok(!removed.includes(previous.photo_path));
});

test("publishing copies a snapshot photo and sends the expected revision to the database RPC", async () => {
  const { createProjectStore } = await api;
  const { client, operations } = fakeClient();
  const project = { id: "project", owner_id: "owner", revision: 7, photo_path: "owner/project/private.png" };
  await createProjectStore(client, assert.fail).publish(project, "apoio-escolar", { photo_path: "owner/project/public-old.png" });
  assert.equal(operations[0].bucket, "studio-private");
  assert.equal(operations[1].bucket, "studio-public");
  const rpc = operations.find((operation) => operation.action === "rpc");
  assert.equal(rpc.args.expected_revision, 7);
  assert.equal(rpc.args.address, "apoio-escolar");
  assert.ok(operations.at(-1).paths.includes("owner/project/public-old.png"));
});

test("duplicate slugs clean only the unused new public photo", async () => {
  const { createProjectStore } = await api;
  const { client, operations } = fakeClient({ publishError: { code: "23505", message: "duplicate" } });
  const project = { id: "project", owner_id: "owner", revision: 1, photo_path: "private.png" };
  await assert.rejects(() => createProjectStore(client, assert.fail).publish(project, "already-used",
    { photo_path: "old.png" }), /endereço já está em uso/);
  const removed = operations.filter((operation) => operation.action === "cleanup").flatMap((operation) => operation.paths);
  assert.equal(removed.length, 1);
  assert.ok(!removed.includes("old.png"));
});

test("cleanup errors are surfaced without reporting a successful save as a failure", async () => {
  const { createProjectStore } = await api;
  const { client } = fakeClient({ cleanupError: { message: "Storage unavailable" } });
  const warnings = [];
  const saved = await createProjectStore(client, (warning) => warnings.push(warning)).save({},
    new Blob(["png"], { type: "image/png" }), { id: "p", revision: 1, photo_path: "old" }, "owner");
  assert.equal(saved.revision, 2);
  assert.match(warnings[0], /não foi possível limpar fotos antigas/);
});

test("rejects oversized or invalid photos before uploading", async () => {
  const { createProjectStore } = await api;
  const { client, operations } = fakeClient();
  const store = createProjectStore(client, assert.fail);
  await assert.rejects(() => store.save({}, new Blob(["jpeg"], { type: "image/jpeg" }), null, "owner"), /PNG de até 5 MB/);
  await assert.rejects(() => store.save({}, new Blob([new Uint8Array(5242881)], { type: "image/png" }), null, "owner"), /PNG de até 5 MB/);
  assert.equal(operations.length, 0);
});
