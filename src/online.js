import { createClient } from "@supabase/supabase-js";
import { checkConfig, checkSlug, publicPageUrl, createProjectStore } from "./online-client.mjs";

function getClient(publicOnly = false) {
  const config = checkConfig(window.ALEXANDRA_ONLINE);
  if (!config) return null;
  return createClient(config.url, config.key, {
    auth: {
      storageKey: "alexandra-online-auth",
      detectSessionInUrl: !publicOnly,
      persistSession: !publicOnly,
      autoRefreshToken: !publicOnly
    }
  });
}

function asDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("Não foi possível ler a foto online."));
    reader.readAsDataURL(blob);
  });
}

window.startOnlineEditor = async (editor) => {
  const root = document.querySelector("#online-panel");
  const status = root.querySelector("[role=status]");
  const controls = root.querySelector("fieldset");
  const authForm = root.querySelector("#online-auth");
  const account = root.querySelector("#online-account");
  const recoveryForm = root.querySelector("#online-recovery");
  const email = root.querySelector("#online-email");
  const password = root.querySelector("#online-password");
  const selector = root.querySelector("#online-projects");
  const slugInput = root.querySelector("#online-slug");
  const publishedLink = root.querySelector("#online-link");
  const consent = root.querySelector("#online-consent");
  let client, store, user = null, current = null, published = null;
  let projects = [], pages = [], busy = false, warnings = [], recovering = false;

  function message(text, error = false) {
    status.textContent = text;
    status.style.color = error ? "#ad3030" : "#315c35";
  }

  function showCurrent() {
    root.querySelector("#online-current").textContent = current
      ? `Editando online: ${current.values.title || current.values.name}`
      : "Novo projeto: salvar online criará uma nova cópia.";
    published = current ? pages.find((page) => page.project_id === current.id) || null : null;
    publishedLink.hidden = !published;
    if (published) {
      publishedLink.href = publicPageUrl(published.slug, location.href);
      publishedLink.textContent = publishedLink.href;
      slugInput.value = published.slug;
    } else {
      publishedLink.removeAttribute("href");
      publishedLink.textContent = "";
      slugInput.value = "";
    }
    root.querySelector("#online-unpublish").disabled = !published;
    root.querySelector("#online-delete").disabled = !current;
    consent.checked = false;
  }

  async function refresh() {
    projects = await store.list();
    pages = await store.pages(projects.map((project) => project.id));
    selector.replaceChildren(new Option("Selecione um projeto salvo", ""));
    for (const project of projects) {
      selector.add(new Option(project.values.title || project.values.name || "Sem título", project.id));
    }
    if (current) selector.value = current.id;
    showCurrent();
  }

  async function run(action) {
    if (busy) return;
    busy = true;
    warnings = [];
    controls.disabled = true;
    message("Aguarde...");
    try {
      const result = await action();
      message([result, ...warnings].filter(Boolean).join(" "));
    } catch (error) {
      message([error.message || "Não foi possível concluir a operação.", ...warnings].join(" "), true);
    } finally {
      controls.disabled = false;
      busy = false;
    }
  }

  async function useSession(session) {
    user = session ? session.user : null;
    current = null;
    authForm.hidden = !!user || recovering;
    account.hidden = !user || recovering;
    root.querySelector("#online-user").textContent = user ? user.email : "";
    if (user) await refresh();
    else {
      projects = [];
      pages = [];
      selector.replaceChildren();
      showCurrent();
    }
  }

  async function saveCurrent() {
    if (!user) throw new Error("Entre na sua conta antes de salvar online.");
    const values = editor.readValues();
    const photo = await (await fetch(await editor.embeddedPhoto())).blob();
    current = await store.save(values, photo, current, user.id);
    await refresh();
    return current;
  }

  try {
    client = getClient();
    if (!client) {
      message("Modo online ainda não ativado. Crie o projeto Supabase e siga CONFIGURAR-ONLINE.txt. Os downloads locais continuam funcionando.");
      return;
    }
    if (!/^https?:$/.test(location.protocol)) {
      message("Abra o site online ou use Live Server para entrar e publicar.", true);
      return;
    }
    store = createProjectStore(client, (warning) => warnings.push(warning));
    controls.hidden = false;
    client.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY") {
        recovering = true;
        recoveryForm.hidden = false;
        authForm.hidden = true;
        account.hidden = true;
      } else if (event === "SIGNED_OUT" || (event === "SIGNED_IN" && session.user.id !== user?.id)) {
        setTimeout(() => {
          if ((session?.user.id || null) === (user?.id || null)) return;
          run(async () => {
            await useSession(session);
            return session ? "Conta conectada." : "Você saiu da conta.";
          });
        }, 0);
      }
    });
  } catch (error) {
    message(`Configuração online: ${error.message}`, true);
    return;
  }

  authForm.addEventListener("submit", (event) => {
    event.preventDefault();
    run(async () => {
      const creating = event.submitter?.id === "online-signup";
      if (creating && password.value.length < 8) throw new Error("Use uma senha com pelo menos 8 caracteres.");
      const credentials = { email: email.value.trim(), password: password.value };
      try {
        const result = creating
          ? await client.auth.signUp({ ...credentials, options: { emailRedirectTo: new URL("index.html", location.href).href } })
          : await client.auth.signInWithPassword(credentials);
        if (result.error) throw result.error;
        if (result.data.session) {
          await useSession(result.data.session);
          return "Conta conectada. Você já pode salvar seus projetos online.";
        }
        return "Confira seu e-mail para confirmar a conta. Depois, entre com seu e-mail e senha.";
      } finally {
        password.value = "";
      }
    });
  });
  root.querySelector("#online-forgot").addEventListener("click", () => run(async () => {
    if (!email.validity.valid || !email.value.trim()) throw new Error("Preencha um e-mail válido para recuperar a senha.");
    const result = await client.auth.resetPasswordForEmail(email.value.trim(), {
      redirectTo: new URL("index.html", location.href).href
    });
    if (result.error) throw result.error;
    return "Se houver uma conta com esse e-mail, você receberá instruções para redefinir a senha.";
  }));
  recoveryForm.addEventListener("submit", (event) => {
    event.preventDefault();
    run(async () => {
      const input = root.querySelector("#online-new-password");
      const result = await client.auth.updateUser({ password: input.value });
      input.value = "";
      if (result.error) throw result.error;
      recoveryForm.hidden = true;
      recovering = false;
      const session = await client.auth.getSession();
      if (session.error) throw session.error;
      await useSession(session.data.session);
      return "Senha atualizada.";
    });
  });
  root.querySelector("#online-logout").addEventListener("click", () => run(async () => {
    const result = await client.auth.signOut();
    if (result.error) throw result.error;
    await useSession(null);
    return "Você saiu. O conteúdo visível no editor não foi apagado; não deixe dados privados em um computador compartilhado.";
  }));
  root.querySelector("#online-refresh").addEventListener("click", () => run(async () => {
    await refresh();
    return "Lista de projetos atualizada.";
  }));
  root.querySelector("#online-open").addEventListener("click", () => run(async () => {
    const project = projects.find((item) => item.id === selector.value);
    if (!project) throw new Error("Selecione um projeto para abrir.");
    const photo = await asDataUrl(await store.photo(project));
    await editor.openProject({ app: "alexandra-content-studio", version: 1, values: project.values, photo });
    current = project;
    showCurrent();
    return "Projeto online aberto com a foto.";
  }));
  root.querySelector("#online-new").addEventListener("click", () => {
    current = null;
    showCurrent();
    message("Novo projeto a partir do conteúdo atual. A próxima gravação criará uma cópia, sem sobrescrever o original.");
  });
  document.querySelector('a[href="#online-panel"]').addEventListener("click", () => { root.open = true; });
  window.addEventListener("studio-local-project", () => {
    current = null;
    showCurrent();
  });
  root.querySelector("#online-save").addEventListener("click", () => run(async () => {
    await saveCurrent();
    return "Rascunho salvo online. Se a página já estiver pública, use Publicar para atualizar o conteúdo divulgado.";
  }));
  root.querySelector("#online-publish").addEventListener("click", () => run(async () => {
    const slug = slugInput.value.trim();
    checkSlug(slug);
    if (!consent.checked) throw new Error("Confirme que os textos e a foto podem ser públicos.");
    const project = await saveCurrent();
    await store.publish(project, slug, published);
    await refresh();
    return "Página publicada! Copie o link abaixo e divulgue. Não é necessário fazer commit ou push.";
  }));
  root.querySelector("#online-copy").addEventListener("click", () => run(async () => {
    if (!published) throw new Error("Publique o projeto primeiro.");
    try {
      await navigator.clipboard.writeText(publicPageUrl(published.slug, location.href));
    } catch (error) {
      throw new Error("Não foi possível copiar automaticamente. Selecione e copie o link exibido abaixo.");
    }
    return "Link copiado.";
  }));
  root.querySelector("#online-unpublish").addEventListener("click", () => run(async () => {
    if (!published) throw new Error("Este projeto ainda não está publicado.");
    await store.unpublish(published);
    await refresh();
    return "Página retirada do ar. O rascunho continua salvo na sua conta.";
  }));
  root.querySelector("#online-delete").addEventListener("click", () => run(async () => {
    if (!current) throw new Error("Abra um projeto antes de excluir.");
    if (!root.querySelector("#online-delete-confirm").checked) throw new Error("Marque a confirmação para excluir o projeto.");
    await store.remove(current, published);
    current = null;
    root.querySelector("#online-delete-confirm").checked = false;
    await refresh();
    return "Projeto excluído e publicação removida. Cópias já baixadas ou em cache não podem ser revogadas.";
  }));
  await run(async () => {
    const result = await client.auth.getSession();
    if (result.error) throw result.error;
    await useSession(result.data.session);
    return user ? "Conta conectada. Seus rascunhos são privados." : "Entre ou crie uma conta para salvar e publicar online.";
  });
};

async function showPublicPage() {
  const status = document.querySelector("#public-status");
  try {
    const client = getClient(true);
    if (!client) throw new Error("Publicação online ainda não configurada.");
    const slug = new URLSearchParams(location.search).get("pagina") || "";
    const store = createProjectStore(client, () => {});
    const page = await store.publicPage(slug);
    const response = await fetch(page.photoUrl);
    if (!response.ok) throw new Error("Não foi possível carregar a foto desta página. Tente novamente mais tarde.");
    const photo = await asDataUrl(await response.blob());
    const image = new Image();
    image.src = photo;
    try {
      await image.decode();
    } catch (error) {
      throw new Error("A foto publicada está indisponível ou é inválida.");
    }
    document.title = `${page.values.name} | ${page.values.role}`;
    const frame = document.querySelector("#public-page");
    frame.srcdoc = window.createLandingPage(page.values, photo);
    frame.hidden = false;
    status.hidden = true;
  } catch (error) {
    status.textContent = error.message || "Não foi possível carregar esta página.";
    document.title = "Página indisponível";
  }
}

if (document.querySelector("#public-page")) showPublicPage();
