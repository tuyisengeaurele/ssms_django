import '@fontsource-variable/fraunces/wght.css';
import '@fontsource-variable/fraunces/wght-italic.css';
import '@fontsource-variable/geist';
import '../tokens.css';
import '../landing.css';
import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useLanguage } from '../../context/LanguageContext';
import { Footer } from '../Footer';
import { Nav } from '../Nav';
import './legal.css';

export interface LegalSection {
  title: string;
  body: ReactNode;
}

interface LegalLayoutProps {
  title: string;
  updated: string;
  intro: ReactNode;
  sections: LegalSection[];
  /** The other legal page, shown at the end. */
  other: { to: string; label: string };
}

/** Highlights the contents link of the section nearest the top of the screen. */
function useActiveSection(ids: string[]): string {
  const [active, setActive] = useState(ids[0]);

  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActive(visible[0].target.id);
      },
      { rootMargin: '-15% 0px -70% 0px' },
    );
    ids.forEach((id) => {
      const el = document.getElementById(id);
      if (el) io.observe(el);
    });
    return () => io.disconnect();
  }, [ids]);

  return active;
}

export function LegalLayout({ title, updated, intro, sections, other }: LegalLayoutProps) {
  const { t } = useLanguage();
  const ids = sections.map((_, i) => `section-${i + 1}`);
  const active = useActiveSection(ids);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  return (
    <div className="landing l-legal">
      <a className="l-skip" href="#main">
        {t('lpSkip')}
      </a>
      <Nav />
      <main id="main" tabIndex={-1}>
        <header className="l-legal__head">
          <div className="l-container">
            <p className="l-eyebrow">{t('lpFooterLegal')}</p>
            <h1>{title}</h1>
            <p className="l-legal__updated">Last updated: {updated}</p>
            <p className="l-legal__intro">{intro}</p>
          </div>
        </header>

        <div className="l-container l-legal__grid">
          <nav className="l-legal__toc" aria-label="On this page">
            <ol>
              {sections.map((section, i) => (
                <li key={section.title}>
                  <a href={`#${ids[i]}`} aria-current={ids[i] === active ? 'true' : undefined}>
                    <span aria-hidden="true">{String(i + 1).padStart(2, '0')}</span>
                    {section.title}
                  </a>
                </li>
              ))}
            </ol>
          </nav>

          <article className="l-legal__body">
            {sections.map((section, i) => (
              <section key={section.title} id={ids[i]}>
                <h2>
                  <span aria-hidden="true">{String(i + 1).padStart(2, '0')}</span>
                  {section.title}
                </h2>
                {section.body}
              </section>
            ))}

            <p className="l-legal__other">
              <Link to={other.to}>{other.label}</Link>
            </p>
          </article>
        </div>
      </main>
      <Footer />
    </div>
  );
}
