export type Format = "square" | "story" | "landing";
export interface ProjectValues {
  format: Format;
  title: string;
  subtitle: string;
  name: string;
  role: string;
  cta: string;
  phone: string;
  primary: string;
  accent: string;
}
export interface ProjectFile {
  app: "alexandra-content-studio";
  version: 1;
  values: ProjectValues;
  photo: string;
}
export interface Publication { slug: string; publishedAt: string }
export interface Project {
  id: string;
  values: ProjectValues;
  photo: string;
  revision: number;
  updatedAt: string;
  publication: Publication | null;
}
export interface PublishedPage extends Publication { values: ProjectValues; photo: string }
export const limits = { title: 100, subtitle: 180, name: 60, role: 45, cta: 32, phone: 20 } as const;
export const defaults: ProjectValues = {
  format: "square",
  title: "Aprender também é uma forma de ser feliz!",
  subtitle: "Acompanhamento psicopedagógico acolhedor para cada etapa do aprendizado.",
  name: "Alexandra G. S. de Fraga",
  role: "Psicopedagoga",
  cta: "Fale comigo",
  phone: "(51) 98134-3844",
  primary: "#123d75",
  accent: "#e83d83"
};
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
export function parseValues(value: unknown): ProjectValues {
  if (!isRecord(value) || !["square", "story", "landing"].includes(String(value.format)) ||
      typeof value.primary !== "string" || !/^#[a-f0-9]{6}$/i.test(value.primary) ||
      typeof value.accent !== "string" || !/^#[a-f0-9]{6}$/i.test(value.accent)) {
    throw new Error("Formato ou cores inválidos.");
  }
  for (const [key, limit] of Object.entries(limits)) {
    if (typeof value[key] !== "string" || value[key].length > limit) throw new Error(`Campo inválido: ${key}.`);
  }
  return {
    format: value.format as Format, primary: value.primary, accent: value.accent,
    title: String(value.title), subtitle: String(value.subtitle), name: String(value.name),
    role: String(value.role), cta: String(value.cta), phone: String(value.phone)
  };
}
export function parseProjectFile(raw: unknown): ProjectFile {
  if (!isRecord(raw) || raw.app !== "alexandra-content-studio" || raw.version !== 1 ||
      typeof raw.photo !== "string") throw new Error("Escolha um projeto JSON salvo pelo editor.");
  const photo = raw.photo;
  if (photo.length > 7_000_000 || !/^data:image\/png;base64,iVBORw0KGgo[A-Za-z0-9+/=\r\n]+$/.test(photo)) {
    throw new Error("O projeto deve conter uma foto PNG de até 5 MB.");
  }
  return { app: "alexandra-content-studio", version: 1, values: parseValues(raw.values), photo };
}
export function validateSlug(slug: string): void {
  if (!/^[a-z0-9][a-z0-9-]{1,58}[a-z0-9]$/.test(slug)) {
    throw new Error("No endereço, use de 3 a 60 letras minúsculas, números e hífens.");
  }
}
export function contactUrl(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  const number = digits.length === 10 || digits.length === 11 ? `55${digits}` : digits;
  return `https://wa.me/${number}`;
}
export function pageUrl(slug: string, origin: string): string {
  validateSlug(slug);
  return new URL(`/projetos/${slug}`, origin).href;
}
