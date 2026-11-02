import type { Project, ProjectValues } from "@atelie/studio";
import { isRecord } from "@atelie/studio";
import { auth } from "./auth";

const base = (import.meta.env.VITE_API_URL || "http://localhost:5080").replace(/\/$/, "");
export const publicOrigin = import.meta.env.VITE_PUBLIC_SITE_URL || "http://localhost:3000";
async function request<T>(path: string, method = "GET", body?: unknown): Promise<T> {
  if (!auth?.currentUser) throw new Error("Entre na sua conta antes de salvar online.");
  const { token, claims } = await auth.currentUser.getIdTokenResult(true);
  if (claims.email_verified !== true) {
    throw new Error("Confirme seu e-mail pelo link enviado pelo Firebase e tente novamente. Em Minha conta, use Reenviar confirmação se necessário.");
  }
  const response = await fetch(`${base}/api${path}`, {
    method, headers: { Authorization: `Bearer ${token}`, ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(90000)
  });
  if (!response.ok) {
    if (response.status === 403) {
      throw new Error("Sua conta não tem permissão para esta operação. Confira a confirmação do e-mail em Minha conta e entre novamente.");
    }
    const problem: unknown = await response.json().catch(() => null);
    const message = isRecord(problem) && typeof problem.detail === "string" ? problem.detail :
      isRecord(problem) && typeof problem.title === "string" ? problem.title :
      `A API não conseguiu concluir a operação (${response.status}).`;
    throw new Error(message);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}
export const api = {
  list: () => request<Project[]>("/projects"),
  open: (id: string) => request<Project>(`/projects/${id}`),
  save: (values: ProjectValues, photo: string, previous: Project | null) =>
    request<Project>(previous ? `/projects/${previous.id}` : "/projects", previous ? "PUT" : "POST",
      { values, photo, revision: previous?.revision ?? 0 }),
  publish: (id: string, slug: string, revision: number) => request<unknown>(`/projects/${id}/publish`, "POST", { slug, revision }),
  unpublish: (id: string) => request<void>(`/projects/${id}/publication`, "DELETE"),
  remove: (id: string) => request<void>(`/projects/${id}`, "DELETE")
};
