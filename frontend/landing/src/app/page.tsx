import { defaults } from "@atelie/studio";
import { LandingContent } from "@atelie/studio/landing";
export default function Home() {
  return <main><LandingContent values={{ ...defaults, format: "landing" }} photo="/foto-atendimento.jpg" /></main>;
}
