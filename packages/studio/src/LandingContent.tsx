import type { CSSProperties } from "react";
import { contactUrl, type ProjectValues } from "./model";

export function LandingContent({ values, photo }: { values: ProjectValues; photo: string }) {
  const colors = { "--primary": values.primary, "--accent": values.accent } as CSSProperties;
  const contact = contactUrl(values.phone);
  if (values.landing) return <article className="public-landing custom-landing" style={colors}>
    <nav className="landing-nav" aria-label="Contato"><strong>{values.name} · {values.role}</strong>
      <a className="landing-button" href={contact} target="_blank" rel="noopener noreferrer">WhatsApp</a></nav>
    {values.landing.blocks.map(block => {
      const image = block.image === "photo" ? photo : block.image;
      return <section key={block.id} className={`custom-block block-${block.type}`} style={{ background: block.background, textAlign: block.align }}>
        {block.type === "hero" ? <div className="custom-hero"><div><p className="landing-eyebrow">{values.role}</p><h1>{block.title}</h1>
          <p className="block-body">{block.body}</p><a className="landing-button" href={contact} target="_blank" rel="noopener noreferrer">{values.cta}</a></div>
          <img src={image} alt={block.title || "Apresentação"} /></div> :
          <><h2>{block.title}</h2><p className="block-body">{block.body}</p>
            {block.type === "services" && <div className="landing-grid">{block.items.filter(Boolean).map((text, i) => <div key={i}><span className="service-number">{String(i + 1).padStart(2, "0")}</span>{text}</div>)}</div>}
            {block.type === "gallery" && <img className="block-photo" src={image} alt={block.title || "Nosso espaço"} loading="lazy" />}
            {block.type === "contact" && <a className="landing-button" href={contact} target="_blank" rel="noopener noreferrer">{values.cta} · {values.phone}</a>}
          </>}
      </section>;
    })}
    <footer className="landing-footer">{values.name} · {values.role}</footer>
  </article>;
  return <article className="public-landing" style={colors}>
    <nav className="landing-nav" aria-label="Contato">
      <strong>{values.name} · {values.role}</strong>
      <a className="landing-button" href={contact} target="_blank" rel="noopener noreferrer">WhatsApp</a>
    </nav>
    <section className="landing-hero">
      <div className="landing-copy">
        <p className="landing-eyebrow">Aprender · Evoluir · Conquistar</p>
        <h1>{values.title}</h1>
        <p>{values.subtitle}</p>
        <a className="landing-button" href={contact} target="_blank" rel="noopener noreferrer">{values.cta} · {values.phone}</a>
      </div>
      <img src={photo} alt="Atendimento psicopedagógico" />
    </section>
    <section className="landing-services">
      <h2>Um caminho de descobertas e conquistas</h2>
      <div className="landing-grid">
        {["Avaliação e intervenção personalizada", "Estímulo às habilidades cognitivas",
          "Apoio no aprendizado escolar", "Autonomia e autoestima"].map(service => <div key={service}>{service}</div>)}
      </div>
    </section>
    <footer className="landing-contact">
      <h2>{values.name} · {values.role}</h2>
      <a className="landing-button" href={contact} target="_blank" rel="noopener noreferrer">{values.cta} pelo WhatsApp</a>
    </footer>
  </article>;
}
