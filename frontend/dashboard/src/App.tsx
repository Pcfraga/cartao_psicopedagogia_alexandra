import { useEffect, useRef, useState } from "react";
import { Link, Route, Routes, Navigate, useLocation, useSearchParams } from "react-router-dom";
import { onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword,
  sendEmailVerification, sendPasswordResetEmail, signOut, type User } from "@firebase/auth";
import { renderToStaticMarkup } from "react-dom/server";
import { defaults, designLimits, pageUrl, parseProjectFile, parseValues, validateSlug,
  type Project, type ProjectFile, type ProjectValues } from "@atelie/studio";
import { download, loadPhoto, pngPhoto, renderPost } from "@atelie/studio/canvas";
import { LandingContent } from "@atelie/studio/landing";
import landingCss from "@atelie/studio/landing.css?raw";
import "@atelie/studio/landing.css";
import { auth } from "./auth";
import { api, publicOrigin } from "./api";
import { StudioEditor } from "./StudioEditor";
import "./style.css";

function errorText(error: unknown): string {
  const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
  const messages: Record<string, string> = {
    "auth/email-already-in-use": "Este e-mail já está cadastrado. Entre na sua conta ou use Esqueci a senha.",
    "auth/invalid-email": "Digite um endereço de e-mail válido.",
    "auth/weak-password": "Escolha uma senha mais forte, com pelo menos 8 caracteres.",
    "auth/invalid-credential": "E-mail ou senha incorretos. Confira os dados ou recupere sua senha.",
    "auth/too-many-requests": "Muitas tentativas. Aguarde alguns minutos antes de tentar novamente.",
    "auth/network-request-failed": "Não foi possível conectar. Confira sua conexão com a internet.",
    "auth/operation-not-allowed": "O cadastro por e-mail não está habilitado. Entre em contato com o responsável pelo site."
  };
  if (messages[code]) return messages[code];
  return error instanceof Error ? error.message : "Não foi possível concluir a operação.";
}
export default function App() {
  const location = useLocation();
  const [user, setUser] = useState<User | null>(null);
  const [notice, setNotice] = useState("");
  useEffect(() => auth ? onAuthStateChanged(auth, setUser) : undefined, []);
  return <><header className="topbar"><Link to="/" className="brand">✦ Ateliê da Alexandra</Link>
    <nav><Link to="/">Editor</Link><Link to="/projetos">Meus projetos</Link><Link to="/conta">{user ? "Minha conta" : "Entrar"}</Link></nav></header>
    <div hidden={location.pathname !== "/"}><Editor user={user} notice={notice} setNotice={setNotice} /></div>
    <Routes>
      <Route path="/" element={null} />
      <Route path="/projetos" element={<Projects user={user} />} />
      <Route path="/conta" element={<Account user={user} />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes></>;
}
function Account({ user }: { user: User | null }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  async function act(action: "login" | "signup" | "reset" | "logout" | "verify") {
    if (!auth) return;
    setBusy(true);
    setMessage("");
    try {
      if (action === "logout") { await signOut(auth); setMessage("Você saiu da conta."); }
      if (action === "login") { await signInWithEmailAndPassword(auth, email, password); setMessage("Conta conectada."); }
      if (action === "signup") {
        const result = await createUserWithEmailAndPassword(auth, email, password);
        await sendEmailVerification(result.user);
        setMessage("Conta criada. Confirme o e-mail antes de salvar ou publicar online.");
      }
      if (action === "verify" && user) { await sendEmailVerification(user); setMessage("E-mail de confirmação enviado."); }
      if (action === "reset") { await sendPasswordResetEmail(auth, email); setMessage("Se existir uma conta, as instruções serão enviadas por e-mail."); }
    } catch (error) { setMessage(errorText(error)); }
    finally { setBusy(false); setPassword(""); }
  }
  return <main className="account card"><h1>Minha conta</h1>
    {!auth ? <p role="status">Firebase ainda não configurado. Siga as instruções de instalação. O editor e os downloads locais continuam disponíveis.</p> :
      user ? <><p>Conectado como <strong>{user.email}</strong></p>
        {!user.emailVerified && <p>Confirme o e-mail e entre novamente para salvar ou publicar.</p>}
        <div className="buttons"><button disabled={busy} onClick={() => act("logout")}>Sair</button>
          {!user.emailVerified && <button disabled={busy} onClick={() => act("verify")}>Reenviar confirmação</button>}</div>
        <p>Em computadores compartilhados, feche o editor ao sair. Downloads e projetos abertos não são apagados automaticamente.</p></> :
        <form onSubmit={event => { event.preventDefault(); void act("login"); }}>
          <label>E-mail<input type="email" autoComplete="username" required value={email} onChange={event => setEmail(event.target.value)} /></label>
          <label>Senha<input type="password" autoComplete="current-password" minLength={8} required value={password} onChange={event => setPassword(event.target.value)} /></label>
          <div className="buttons"><button className="primary" disabled={busy}>Entrar</button>
            <button type="button" disabled={busy || password.length < 8 || !email} onClick={() => act("signup")}>Criar conta</button>
            <button type="button" disabled={busy || !email} onClick={() => act("reset")}>Esqueci a senha</button></div>
        </form>}
    <p role="status">{message}</p>
  </main>;
}
function Projects({ user }: { user: User | null }) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [message, setMessage] = useState("");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    let active = true;
    if (user) {
      setLoading(true); setMessage("");
      api.list().then(data => { if (active) setProjects(data); }).catch(error => { if (active) setMessage(errorText(error)); })
        .finally(() => { if (active) setLoading(false); });
    }
    return () => { active = false; };
  }, [user]);
  return <main><h1>Meus projetos online</h1>
    {!user ? <p><Link to="/conta">Entre na conta</Link> para acessar seus projetos privados.</p> :
      <><p>Somente sua conta acessa os rascunhos. Os links publicados são públicos.</p>
        <label className="project-search">Buscar projetos<input type="search" value={query} placeholder="Título ou nome" onChange={e => setQuery(e.target.value)} /></label>
        {loading && <p role="status">Carregando seus projetos…</p>}
        {!loading && projects.length === 0 && !message && <p>Nenhum projeto encontrado. Crie seu primeiro material no editor.</p>}
        {!loading && projects.length > 0 && !projects.some(p => `${p.values.title} ${p.values.name}`.toLocaleLowerCase().includes(query.toLocaleLowerCase())) && <p>Nenhum projeto corresponde à busca.</p>}
        <div className="project-list">{projects.filter(p => `${p.values.title} ${p.values.name}`.toLocaleLowerCase().includes(query.toLocaleLowerCase())).map(project => <article className="card" key={project.id}>
          <span className="project-badge">{project.values.format === "landing" ? "Landing page" : project.values.format === "story" ? "Story" : "Post"} · {project.publication ? "Publicado" : "Rascunho"}</span>
          <h2>{project.values.title || project.values.name}</h2><p>{new Date(project.updatedAt).toLocaleString("pt-BR")}</p>
          <Link to={`/?projeto=${project.id}`}>Abrir no editor</Link>
          {project.publication && <a className="block" href={pageUrl(project.publication.slug, publicOrigin)} target="_blank" rel="noopener noreferrer">Ver página pública</a>}
        </article>)}</div></>}
    <p role="status">{message}</p>
  </main>;
}
function Editor({ user, notice, setNotice }: { user: User | null; notice: string; setNotice: (text: string) => void }) {
  const [values, setValues] = useState<ProjectValues>({ ...defaults });
  const [photo, setPhoto] = useState("/foto-atendimento.jpg");
  const [current, setCurrent] = useState<Project | null>(null);
  const [slug, setSlug] = useState("");
  const [consent, setConsent] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const importFile = useRef<HTMLInputElement>(null);
  const loadedId = useRef<string | null>(null);
  const initialized = useRef(false);
  const [params] = useSearchParams();
  const search = params.get("projeto");
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  useEffect(() => { setCurrent(null); setConsent(false); setConfirmDelete(false); loadedId.current = null; }, [user?.uid]);
  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    if (search || !localStorage.getItem("atelie-values")) return;
    try { setValues(parseValues(JSON.parse(localStorage.getItem("atelie-values") || "null"))); }
    catch (error) { setNotice(`O rascunho local não pôde ser carregado: ${errorText(error)}`); }
  }, [search, setNotice]);
  useEffect(() => {
    if (!user || !search || loadedId.current === search) return;
    let active = true;
    setBusy(true);
    api.open(search).then(async project => {
      await loadPhoto(project.photo);
      if (!active) return;
      loadedId.current = search;
      setCurrent(project); setValues(project.values); setPhoto(project.photo); setSlug(project.publication?.slug || "");
      setDirty(false); setNotice("Projeto online aberto.");
    }).catch(error => { if (active) setNotice(errorText(error)); }).finally(() => { if (active) setBusy(false); });
    return () => { active = false; setBusy(false); };
  }, [search, user, setNotice]);
  function change(updated: ProjectValues) {
    setValues(updated); setDirty(true);
    // Photos and layered compositions are saved explicitly, not in shared browser storage.
    const { design, landing, ...texts } = updated;
    try { localStorage.setItem("atelie-values", JSON.stringify(texts)); }
    catch { setNotice("Não foi possível guardar os textos neste navegador. Salve um projeto para não perder as alterações."); }
  }
  async function run(action: () => Promise<void>) {
    setBusy(true); setNotice("Aguarde...");
    try { await action(); } catch (error) { setNotice(errorText(error)); } finally { setBusy(false); }
  }
  async function projectFile(): Promise<ProjectFile> {
    const file: ProjectFile = { app: "alexandra-content-studio", version: values.design || values.landing ? 2 : 1, values: parseValues(values), photo: await pngPhoto(photo) };
    if (new Blob([JSON.stringify(file)]).size > designLimits.fileBytes) throw new Error("O projeto ultrapassa 7,5 MB. Use fotos menores ou menos fotos antes de salvar.");
    return file;
  }
  async function saveOnline() {
    const file = await projectFile();
    const saved = await api.save(file.values, file.photo, current);
    setCurrent(saved); loadedId.current = saved.id; setDirty(false);
    return saved;
  }
  async function exportMaterial() {
    if (values.format === "landing") {
      const file = await projectFile();
      const html = '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Landing page</title><style>body{margin:0}' +
        landingCss + "</style></head><body>" + renderToStaticMarkup(<LandingContent values={file.values} photo={file.photo} />) + "</body></html>";
      download(new Blob([html], { type: "text/html;charset=utf-8" }), "landing-alexandra.html");
    } else {
      const target = document.createElement("canvas");
      await renderPost(target, values, photo);
      const blob = await new Promise<Blob | null>(resolve => target.toBlob(resolve, "image/png"));
      if (!blob) throw new Error("Não foi possível gerar o PNG.");
      download(blob, `${values.format === "story" ? "story" : "post"}-alexandra.png`);
    }
    setNotice("Material baixado.");
  }
  const link = current?.publication ? pageUrl(current.publication.slug, publicOrigin) : null;
  return <><section className="toolbar">
    <div className="buttons"><button className="primary" disabled={busy} onClick={() => run(exportMaterial)}>
      {values.format === "landing" ? "Baixar landing HTML" : "Baixar imagem PNG"}</button>
      <button disabled={busy} onClick={() => run(async () => { download(new Blob([JSON.stringify(await projectFile())], { type: "application/json" }), "projeto-alexandra.json"); setDirty(false); setNotice("Projeto salvo com camadas, textos, cores e fotos."); })}>Salvar projeto</button>
      <button disabled={busy} onClick={() => importFile.current?.click()}>Abrir projeto JSON</button>
      <button disabled={busy || !user} onClick={() => run(async () => { await saveOnline(); setNotice("Rascunho salvo na conta. Para alterar a versão pública, clique em Publicar."); })}>Salvar online</button></div>
    <p role="status" aria-live="polite">{notice}{dirty ? " · Alterações não salvas. Salve online ou baixe o projeto JSON." : ""}</p>
  </section>
  <main>
    {search && !user && <p className="card"><Link to="/conta">Entre na sua conta</Link> e volte a este endereço para abrir o projeto.</p>}
    <input type="file" accept=".json,application/json" hidden ref={importFile} onChange={event => {
      const file = event.target.files?.[0]; event.target.value = "";
      if (file) void run(async () => {
        if (file.size > designLimits.fileBytes) throw new Error("O projeto é grande demais (limite 7,5 MB).");
        const parsed = parseProjectFile(JSON.parse(await file.text())); await loadPhoto(parsed.photo);
        setValues(parsed.values); setPhoto(parsed.photo); setCurrent(null); loadedId.current = null; setDirty(false); setSlug(""); setConsent(false); setConfirmDelete(false); setNotice("Projeto JSON aberto. Salvar online criará uma nova cópia.");
      });
    }} />
    <StudioEditor values={values} photo={photo} busy={busy} onChange={change} onPhoto={photo => { setPhoto(photo); setDirty(true); }} notify={setNotice} />
    <section className="card publish"><h2>Publicar e divulgar</h2>
      <p className="muted">O link público abre uma landing page. Escolha esse formato para personalizar os blocos. Posts e Stories são baixados como PNG para publicar nas redes.</p>
      {!user ? <p><Link to="/conta">Entre ou crie sua conta</Link> para salvar online e publicar. Downloads locais não exigem login.</p> : <>
        <p>{current ? `Projeto online: ${current.values.title}` : "Novo projeto. Salvar online criará uma cópia."}</p>
        <fieldset disabled={busy}><label>Nome no endereço público<input value={slug} onChange={e => setSlug(e.target.value)} placeholder="apoio-escolar-alexandra" maxLength={60} /></label>
          <label className="check"><input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} />Tenho autorização para divulgar os textos e a foto.</label>
          <div className="buttons"><button className="primary" onClick={() => run(async () => {
            validateSlug(slug); if (!consent) throw new Error("Confirme a autorização para publicar.");
            const saved = await saveOnline(); await api.publish(saved.id, slug, saved.revision);
            const published = await api.open(saved.id); setCurrent(published); setConsent(false); setNotice("Página publicada. Copie e compartilhe o link.");
          })}>Publicar / atualizar landing</button>
            <button onClick={() => { setCurrent(null); loadedId.current = null; setSlug(""); setConsent(false); setConfirmDelete(false); setNotice("A próxima gravação criará outro projeto com o conteúdo atual."); }}>Criar outra landing</button>
            <button disabled={!link} onClick={() => run(async () => { if (link) await navigator.clipboard.writeText(link); setNotice("Link copiado."); })}>Copiar link</button>
            <button disabled={!link} onClick={() => run(async () => { if (current) { await api.unpublish(current.id); setCurrent({ ...current, publication: null }); setNotice("Página retirada do ar. Rascunho preservado."); } })}>Retirar do ar</button></div>
          {link && <a className="public-link" href={link} target="_blank" rel="noopener noreferrer">{link}</a>}
          <p>Salvar rascunho não altera a publicação. Publicar cria uma versão pública com link acessível sem login.</p>
          <label className="check"><input type="checkbox" checked={confirmDelete} onChange={e => setConfirmDelete(e.target.checked)} />Confirmo excluir definitivamente este projeto e sua publicação.</label>
          <button disabled={!current || !confirmDelete} onClick={() => run(async () => {
            if (current) { await api.remove(current.id); setCurrent(null); loadedId.current = null; setSlug(""); setConfirmDelete(false); setNotice("Projeto excluído. Cópias já baixadas ou em cache não podem ser revogadas."); }
          })}>Excluir projeto</button>
        </fieldset>
      </>}
    </section>
  </main></>;
}
