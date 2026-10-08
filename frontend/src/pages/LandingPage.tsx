import '@fontsource-variable/fraunces/wght.css';
import '@fontsource-variable/fraunces/wght-italic.css';
import '@fontsource-variable/geist';
import '../landing/tokens.css';
import { Hero } from '../landing/Hero';
import { Nav } from '../landing/Nav';
import { SmoothScroll } from '../landing/motion/SmoothScroll';

export default function LandingPage() {
  return (
    <div className="landing">
      <SmoothScroll>
        <Nav />
        <main id="main">
          <Hero />
        </main>
      </SmoothScroll>
    </div>
  );
}
