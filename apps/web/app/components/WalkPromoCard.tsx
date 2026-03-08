export default function WalkPromoCard() {
  return (
    <section className="bg-dark-raised rounded-none lg:rounded-section px-6 py-8 md:px-8 md:py-9 lg:px-10 lg:py-10">
      <p className="font-serif text-[1.9rem] md:text-[2.2rem] text-dark-text leading-[1.1]">
        Upptäck konstvandringar
      </p>
      <p className="mt-2 text-sm text-dark-text-secondary">
        Utvalda resor genom samlingarna
      </p>
      <a href="/walks" className="inline-block mt-5 text-xs tracking-[0.08em] uppercase text-dark-text-secondary hover:text-dark-text transition-colors no-underline focus-ring">
        Till vandringarna →
      </a>
    </section>
  );
}

