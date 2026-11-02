function createLandingPage(values, imagePath) {
  const escape = (text) => text.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[character]);
  const digits = values.phone.replace(/\D/g, "");
  const phone = digits.length === 10 || digits.length === 11 ? `55${digits}` : digits;
  const contact = `https://wa.me/${phone}`;
  if (!/^#[0-9a-f]{6}$/i.test(values.primary) || !/^#[0-9a-f]{6}$/i.test(values.accent)) {
    throw new Error("As cores da landing page são inválidas.");
  }
  return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="description" content="${escape(values.subtitle)}">
  <title>${escape(values.name)} | ${escape(values.role)}</title>
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; color: #17233c; font: 18px Arial, sans-serif; line-height: 1.55; }
    .wrap { max-width: 1440px; margin: auto; }
    .nav { display: flex; flex-wrap: wrap; gap: 16px; justify-content: space-between; align-items: center; padding: 18px 6%; color: ${values.primary}; font-weight: bold; }
    .button { display: inline-block; padding: 12px 20px; border-radius: 99px; background: ${values.accent}; color: white; text-decoration: none; font-weight: bold; }
    .hero { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); align-items: center; background: #f3f7fc; }
    .copy { padding: 48px 9%; }
    .eyebrow { color: ${values.accent}; font-size: 15px; font-weight: bold; letter-spacing: .1em; text-transform: uppercase; }
    h1 { margin: 12px 0; color: ${values.primary}; font-size: clamp(34px, 5vw, 64px); line-height: 1.08; overflow-wrap: anywhere; }
    .hero p { color: #5c6b82; }
    .hero img { width: 100%; height: 100%; min-height: 380px; object-fit: cover; }
    .services { padding: 46px 6%; text-align: center; }
    .services h2 { color: ${values.primary}; }
    .grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 14px; }
    .item { padding: 20px 14px; border: 1px solid #e5ecf4; border-radius: 14px; color: #53647b; font-weight: bold; }
    .contact { padding: 30px 6%; background: ${values.primary}; color: white; text-align: center; }
    .contact h2 { margin-top: 0; overflow-wrap: anywhere; }
    a:focus-visible { outline: 3px solid #f5b62e; outline-offset: 3px; }
    @media (max-width: 650px) {
      .hero { grid-template-columns: 1fr; }
      .hero img { grid-row: 1; min-height: 260px; max-height: 360px; }
      .copy { padding: 32px 7%; }
      .grid { grid-template-columns: 1fr 1fr; }
    }
    @media (max-width: 360px) { .grid { grid-template-columns: 1fr; } }
  </style>
</head>
<body>
  <main class="wrap">
    <nav class="nav" aria-label="Contato"><span>${escape(values.name)} · ${escape(values.role)}</span><a class="button" href="${contact}" target="_blank" rel="noopener">WhatsApp</a></nav>
    <section class="hero">
      <div class="copy">
        <div class="eyebrow">Aprender · Evoluir · Conquistar</div>
        <h1>${escape(values.title)}</h1>
        <p>${escape(values.subtitle)}</p>
        <a class="button" href="${contact}" target="_blank" rel="noopener">${escape(values.cta)} · ${escape(values.phone)}</a>
      </div>
      <img src="${escape(imagePath)}" alt="Atendimento psicopedagógico">
    </section>
    <section class="services">
      <h2>Um caminho de descobertas e conquistas</h2>
      <div class="grid">
        <div class="item">Avaliação e intervenção personalizada</div>
        <div class="item">Estímulo às habilidades cognitivas</div>
        <div class="item">Apoio no aprendizado escolar</div>
        <div class="item">Autonomia e autoestima</div>
      </div>
    </section>
    <footer class="contact"><h2>${escape(values.name)} · ${escape(values.role)}</h2><a class="button" href="${contact}" target="_blank" rel="noopener">${escape(values.cta)} pelo WhatsApp</a></footer>
  </main>
</body>
</html>`;
}

if (typeof module !== "undefined" && module.exports) module.exports = { createLandingPage };
