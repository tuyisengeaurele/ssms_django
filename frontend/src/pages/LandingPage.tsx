import '../fonts/fonts.css';
import '../landing/tokens.css';
import '../landing/landing.css';
import { useEffect } from 'react';
import { useLanguage } from '../context/LanguageContext';
import { forgetPrerendered } from '../utils/prerendered';
import { About } from '../landing/About';
import { Challenge } from '../landing/Challenge';
import { Contact } from '../landing/Contact';
import { Cooperatives } from '../landing/Cooperatives';
import { Cta } from '../landing/Cta';
import { DiseaseSpotlight } from '../landing/DiseaseSpotlight';
import { Faq } from '../landing/Faq';
import { Features } from '../landing/Features';
import { Footer } from '../landing/Footer';
import { Hero } from '../landing/Hero';
import { HowItWorks } from '../landing/HowItWorks';
import { LanguageSuggestion } from '../landing/LanguageSuggestion';
import { Nav } from '../landing/Nav';
import { SmoothScroll } from '../landing/motion/SmoothScroll';

export default function LandingPage() {
  const { t } = useLanguage();

  // The real page is on screen now. The copy the build wrote is no longer needed.
  useEffect(() => forgetPrerendered(), []);

  return (
    <div className="landing">
      <a className="l-skip" href="#main">
        {t('lpSkip')}
      </a>
      <SmoothScroll>
        <Nav />
        <main id="main" tabIndex={-1}>
          <Hero />
          <About />
          <Challenge />
          <Features />
          <HowItWorks />
          <DiseaseSpotlight />
          <Cooperatives />
          <Faq />
          <Contact />
          <Cta />
        </main>
        <Footer />
      </SmoothScroll>
      <LanguageSuggestion />
    </div>
  );
}
