import '@fontsource-variable/fraunces/wght.css';
import '@fontsource-variable/fraunces/wght-italic.css';
import '@fontsource-variable/geist';
import '../landing/tokens.css';
import '../landing/landing.css';
import { useLanguage } from '../context/LanguageContext';
import { Contact } from '../landing/Contact';
import { Cta } from '../landing/Cta';
import { DiseaseSpotlight } from '../landing/DiseaseSpotlight';
import { Faq } from '../landing/Faq';
import { Features } from '../landing/Features';
import { Footer } from '../landing/Footer';
import { Hero } from '../landing/Hero';
import { HowItWorks } from '../landing/HowItWorks';
import { Nav } from '../landing/Nav';
import { Problem } from '../landing/Problem';
import { Rwanda } from '../landing/Rwanda';
import { SmoothScroll } from '../landing/motion/SmoothScroll';

export default function LandingPage() {
  const { t } = useLanguage();

  return (
    <div className="landing">
      <a className="l-skip" href="#main">
        {t('lpSkip')}
      </a>
      <SmoothScroll>
        <Nav />
        <main id="main" tabIndex={-1}>
          <Hero />
          <Problem />
          <Features />
          <HowItWorks />
          <DiseaseSpotlight />
          <Rwanda />
          <Faq />
          <Contact />
          <Cta />
        </main>
        <Footer />
      </SmoothScroll>
    </div>
  );
}
