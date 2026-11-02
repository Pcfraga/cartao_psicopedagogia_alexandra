export function checkConfig(config) {
  if (!config || !config.supabaseUrl || !config.publishableKey) return null;
  const url = new URL(config.supabaseUrl);
  if (url.protocol !== "https:" || !/^[a-z0-9-]+\.supabase\.co$/.test(url.hostname) ||
      url.pathname !== "/" || url.search || url.hash || url.username || url.password) {
    throw new Error("Informe a URL HTTPS do projeto Supabase em online-config.js.");
  }
  if (!config.publishableKey.startsWith("sb_publishable_")) {
    throw new Error("Use apenas a chave pública sb_publishable_. Nunca use uma chave secret ou service_role.");
  }
  return { url: url.origin, key: config.publishableKey };
}

export function publicPageUrl(slug, base) {
  const url = new URL("landing.html", base);
  url.searchParams.set("pagina", slug);
  return url.href;
}

export function checkSlug(slug) {
  if (!/^[a-z0-9][a-z0-9-]{1,58}[a-z0-9]$/.test(slug)) {
    throw new Error("Use de 3 a 60 letras minúsculas, números ou hífens, começando e terminando com letra ou número.");
  }
}

function checked(result) {
  if (result.error) {
    if (result.error.code === "23505") throw new Error("Esse endereço já está em uso. Escolha outro nome.");
    throw new Error(result.error.message);
  }
  return result.data;
}

export function createProjectStore(client, warn) {
  async function cleanup(bucket, paths) {
    if (!paths.length) return;
    try {
      checked(await client.storage.from(bucket).remove(paths));
    } catch (error) {
      warn(`A operação foi concluída, mas não foi possível limpar fotos antigas: ${error.message}`);
    }
  }

  async function list() {
    return checked(await client.from("studio_projects").select("*").order("updated_at", { ascending: false }));
  }

  async function pages(ids) {
    if (!ids.length) return [];
    return checked(await client.from("studio_pages").select("*").in("project_id", ids));
  }

  async function save(values, photo, previous, userId) {
    if (photo.type !== "image/png" || photo.size > 5 * 1024 * 1024 || !photo.size) {
      throw new Error("A foto precisa ser PNG de até 5 MB. Escolha uma foto menor para salvar online.");
    }
    const id = previous ? previous.id : crypto.randomUUID();
    const photoPath = `${userId}/${id}/${crypto.randomUUID()}.png`;
    checked(await client.storage.from("studio-private").upload(photoPath, photo, { contentType: "image/png" }));
    let saved;
    try {
      const row = { id, owner_id: userId, values, photo_path: photoPath,
        revision: previous ? previous.revision + 1 : 1, updated_at: new Date().toISOString() };
      const query = previous
        ? client.from("studio_projects").update(row).eq("id", id).eq("revision", previous.revision)
        : client.from("studio_projects").insert(row);
      saved = checked(await query.select().single());
    } catch (error) {
      await cleanup("studio-private", [photoPath]);
      throw new Error(`Não foi possível salvar. ${error.message} Se o projeto mudou em outra aba, abra-o novamente.`);
    }
    if (previous) await cleanup("studio-private", [previous.photo_path]);
    return saved;
  }

  async function photo(project) {
    return checked(await client.storage.from("studio-private").download(project.photo_path));
  }

  async function publish(project, slug, oldPage) {
    checkSlug(slug);
    const blob = await photo(project);
    const photoPath = `${project.owner_id}/${project.id}/${crypto.randomUUID()}.png`;
    checked(await client.storage.from("studio-public").upload(photoPath, blob, { contentType: "image/png" }));
    let result;
    try {
      result = checked(await client.rpc("publish_studio_project", {
        project: project.id, address: slug, image_path: photoPath, expected_revision: project.revision
      }));
    } catch (error) {
      await cleanup("studio-public", [photoPath]);
      throw error;
    }
    if (oldPage) await cleanup("studio-public", [oldPage.photo_path]);
    return result;
  }

  async function unpublish(page) {
    checked(await client.from("studio_pages").delete().eq("project_id", page.project_id).select().single());
    await cleanup("studio-public", [page.photo_path]);
  }

  async function remove(project, page) {
    checked(await client.from("studio_projects").delete().eq("id", project.id).select().single());
    await cleanup("studio-private", [project.photo_path]);
    if (page) await cleanup("studio-public", [page.photo_path]);
  }

  async function publicPage(slug) {
    checkSlug(slug);
    const result = checked(await client.from("studio_pages").select("slug,values,photo_path").eq("slug", slug).maybeSingle());
    if (!result) throw new Error("Esta página não existe ou foi retirada do ar.");
    return { ...result, photoUrl: client.storage.from("studio-public").getPublicUrl(result.photo_path).data.publicUrl };
  }

  return { list, pages, save, photo, publish, unpublish, remove, publicPage };
}
