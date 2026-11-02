import type { CSSProperties } from "react";
import { contactUrl, type ProjectValues } from "./model";

export function LandingContent({ values, photo }: { values: ProjectValues; photo: string }) {
  const colors = { "--primary": values.primary, "--accent": values.accent } as CSSProperties;
  const contact = contactUrl(values.phone);
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
