import type { Metadata } from "next";
import "@atelie/studio/landing.css";
import "./style.css";
export const metadata: Metadata = { title: "Páginas públicas" };
export default function Layout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="pt-BR"><body>{children}</body></html>;
}
