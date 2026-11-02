import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LandingContent } from "@atelie/studio/landing";
import { getPage } from "../../../lib/pages";
export const dynamic = "force-dynamic";
type Props = { params: Promise<{ slug: string }> };
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const page = await getPage((await params).slug);
  if (!page) return { title: "Página não encontrada" };
  return {
    title: `${page.values.name} | ${page.values.role}`, description: page.values.subtitle,
    openGraph: { title: page.values.title, description: page.values.subtitle, type: "website" }
  };
}
export default async function PublicPage({ params }: Props) {
  const page = await getPage((await params).slug);
  if (!page) notFound();
  return <main><LandingContent values={page.values} photo={page.photo} /></main>;
}
