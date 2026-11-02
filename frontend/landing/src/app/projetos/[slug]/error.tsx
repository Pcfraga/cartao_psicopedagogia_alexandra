"use client";
export default function PageError({ reset }: { reset: () => void }) {
  return <main className="message"><h1>Página temporariamente indisponível</h1>
    <p>Não foi possível consultar a publicação. Tente novamente em alguns instantes.</p>
    <button onClick={reset}>Tentar novamente</button></main>;
}
