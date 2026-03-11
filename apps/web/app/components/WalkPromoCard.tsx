export default function WalkPromoCard() {
  return (
    <section className="bg-dark-raised rounded-none lg:rounded-section px-5 py-9 md:px-7 md:py-10 lg:px-10 lg:py-12">
      <p className="text-[0.6rem] uppercase tracking-[0.2em] text-dark-text-muted font-medium">Nytt</p>
      <p className="font-serif text-[1.7rem] md:text-[1.9rem] text-dark-text leading-[1.1] mt-2">
        Upptäck konstvandringar
      </p>
      <p className="mt-2.5 text-[0.82rem] text-dark-text-secondary leading-[1.5]">
        Utvalda resor genom samlingarna — med berättelser och utvalda verk.
      </p>
      <a href="/vandringar" className="inline-block mt-5 text-[0.72rem] tracking-[0.08em] uppercase text-dark-text-secondary hover:text-dark-text transition-colors no-underline focus-ring">
        Till vandringarna →
      </a>
    </section>
  );
}

