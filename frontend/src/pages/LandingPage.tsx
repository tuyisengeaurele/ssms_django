import '@fontsource-variable/fraunces/wght.css';
import '@fontsource-variable/fraunces/wght-italic.css';
import '@fontsource-variable/geist';
import '../landing/tokens.css';
import '../landing/landing.css';
import { useLanguage } from '../context/LanguageContext';
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
import { Nav } from '../landing/Nav';
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
    </div>
  );
}
