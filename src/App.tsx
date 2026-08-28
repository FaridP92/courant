function App() {
  return (
    <div className="flex min-h-screen flex-col bg-abyss text-ink-100">
      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col items-start justify-center gap-8 px-6 py-16">
        <header className="flex flex-col gap-3">
          <p className="font-data text-xs tracking-[0.35em] text-ink-40 uppercase">
            Le réseau électrique français, en direct
          </p>
          <h1 className="font-display text-6xl font-extrabold tracking-tight text-ink-100 sm:text-7xl">
            Courant
          </h1>
          <p className="max-w-xl text-lg leading-relaxed text-ink-60">
            Que consomme la France en ce moment ? On importe ou on exporte ? Demain, jour rouge ou
            jour vert ? Un command center public pour rendre le système électrique lisible.
          </p>
        </header>

        <p className="rounded-md border border-line bg-panel px-4 py-3 font-data text-sm text-ink-60">
          Phase 0 : fondations. Aucune donnée branchée pour l&apos;instant, aucun chiffre affiché ne
          sera jamais simulé.
        </p>

        <nav aria-label="Liens du projet" className="flex flex-wrap gap-4">
          <a
            className="rounded-md bg-accent px-5 py-2.5 font-semibold text-abyss transition hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            href="/design/maquette.html"
          >
            Voir la maquette du command center
          </a>
          <a
            className="rounded-md border border-line px-5 py-2.5 font-semibold text-ink-60 transition hover:border-accent hover:text-ink-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            href="https://github.com/FaridP92/courant"
          >
            Code source sur GitHub
          </a>
        </nav>
      </main>

      <footer className="border-t border-line px-6 py-4">
        <p className="mx-auto max-w-3xl font-data text-xs text-ink-40">
          Données : RTE via ODRÉ (à venir en Phase 1) · Projet indépendant, non affilié à RTE.
        </p>
      </footer>
    </div>
  )
}

export default App
