const fs = require("node:fs");
const path = require("node:path");
const { createLandingPage } = require("../landing-page.js");

const [source, slug] = process.argv.slice(2);
if (!source || !slug || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
  throw new Error("Uso: node scripts\\publish-project.cjs caminho-do-projeto.json nome-da-pagina");
}
const project = JSON.parse(fs.readFileSync(source, "utf8"));
const limits = { title: 100, subtitle: 180, name: 60, role: 45, cta: 32, phone: 20, primary: 7, accent: 7 };
if (project.app !== "alexandra-content-studio" || project.version !== 1 || !project.values ||
    typeof project.photo !== "string" || !/^data:image\/png;base64,[A-Za-z0-9+/=\r\n]+$/.test(project.photo)) {
  throw new Error("Escolha um projeto válido, criado com Salvar projeto.");
}
for (const [key, limit] of Object.entries(limits)) {
  if (typeof project.values[key] !== "string" || project.values[key].length > limit) {
    throw new Error(`Campo inválido no projeto: ${key}`);
  }
}
const photo = Buffer.from(project.photo.split(",")[1], "base64");
if (photo.length < 24 || photo.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a") {
  throw new Error("A foto do projeto não é um PNG válido.");
}
project.values.format = "landing";
const html = createLandingPage(project.values, "foto.png");
const root = path.join(__dirname, "..", "projetos");
const destination = path.join(root, slug);
fs.mkdirSync(destination, { recursive: true });
fs.writeFileSync(path.join(destination, "foto.png"), photo);
fs.writeFileSync(path.join(destination, "projeto.json"), JSON.stringify(project));
fs.writeFileSync(path.join(destination, "index.html"), html);

const escape = (text) => text.replace(/[&<>"']/g, (character) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
})[character]);
const cards = fs.readdirSync(root, { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(entry.name))
  .map((entry) => {
    const saved = JSON.parse(fs.readFileSync(path.join(root, entry.name, "projeto.json"), "utf8"));
    return `<article><h2>${escape(saved.values.name)}</h2><p>${escape(saved.values.title)}</p>
      <div class="actions"><a href="${entry.name}/">Ver e divulgar a landing</a>
      <a href="../?projeto=${entry.name}">Abrir no editor</a>
      <a href="${entry.name}/projeto.json" download>Baixar projeto editável</a></div>
      <label>Link para divulgar<input readonly aria-label="Link da landing de ${escape(saved.values.name)}" data-page="${entry.name}/"></label>
      <button type="button" data-copy="${entry.name}/">Copiar link</button></article>`;
  }).join("\n");
fs.writeFileSync(path.join(root, "index.html"), `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Projetos publicados | Ateliê da Alexandra</title>
<style>*{box-sizing:border-box}body{margin:0;background:#f5f7fb;color:#17233c;font:18px/1.6 "Segoe UI",Arial,sans-serif}main{max-width:1100px;margin:auto;padding:32px 20px}h1{line-height:1.2}article{padding:26px;margin:24px 0;background:white;border:1px solid #dfe5ee;border-radius:18px}h2{margin-top:0}.actions{display:flex;flex-wrap:wrap;gap:14px}a{color:#145da5}label{display:block;margin:20px 0 10px}input{display:block;width:100%;margin-top:8px;padding:12px;font:inherit;border:1px solid #cbd6e5;border-radius:8px}button{padding:12px 20px;border:0;border-radius:10px;background:#145da5;color:white;font:inherit;cursor:pointer}a:focus-visible,button:focus-visible,input:focus-visible{outline:3px solid #f5b62e;outline-offset:3px}</style>
</head><body><main><a href="../">Voltar ao editor</a><h1>Projetos publicados</h1>
<p>Compartilhe o link da landing com seus clientes. As cópias editáveis ficam guardadas aqui no site.</p>
<p>Estas páginas e seus projetos são públicos. Alterações no editor só entram no ar depois de uma nova publicação pelo GitHub.</p>
${cards}<p id="status" role="status" aria-live="polite"></p></main>
<script>
document.querySelectorAll('[data-page]').forEach(input => { input.value = new URL(input.dataset.page, location.href).href; });
document.querySelectorAll('[data-copy]').forEach(button => button.addEventListener('click', async () => {
  const status = document.querySelector('#status');
  try { await navigator.clipboard.writeText(new URL(button.dataset.copy, location.href).href); status.textContent = 'Link copiado! Cole no WhatsApp ou na sua rede social.'; }
  catch (error) { status.textContent = 'Não foi possível copiar automaticamente. Selecione e copie o endereço no campo acima.'; }
}));
</script></body></html>`);
console.log(`Landing e projeto gerados em projetos/${slug}/. Faça commit e push para publicar no GitHub Pages.`);
