import { cache } from "react";
import { isRecord, parseValues, type PublishedPage } from "@atelie/studio";

export const getPage = cache(async (slug: string): Promise<PublishedPage | null> => {
  if (!/^[a-z0-9][a-z0-9-]{1,58}[a-z0-9]$/.test(slug)) return null;
  const base = (process.env.API_INTERNAL_URL || "http://localhost:5080").replace(/\/$/, "");
  const response = await fetch(`${base}/api/pages/${encodeURIComponent(slug)}`, {
    cache: "no-store", signal: AbortSignal.timeout(90000)
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Falha na API pública (${response.status}).`);
  const value: unknown = await response.json();
  if (!isRecord(value) || typeof value.photo !== "string" ||
      typeof value.slug !== "string" || typeof value.publishedAt !== "string" ||
      !/^data:image\/png;base64,/.test(value.photo)) throw new Error("A API retornou uma página inválida.");
  return { slug: value.slug, publishedAt: value.publishedAt, photo: value.photo, values: parseValues(value.values) };
});
