import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { motion, type Variants } from 'framer-motion';

function useIsMobile() {
  const [mobile, setMobile] = useState(window.innerWidth < 768);
  useEffect(() => {
    const fn = () => setMobile(window.innerWidth < 768);
    window.addEventListener('resize', fn);
    return () => window.removeEventListener('resize', fn);
  }, []);
  return mobile;
}

const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1];
const fadeUp: Variants   = { hidden: { opacity: 0, y: 40 },  visible: { opacity: 1, y: 0, transition: { duration: 0.75, ease: EASE } } };
const fadeLeft: Variants  = { hidden: { opacity: 0, x: -48 }, visible: { opacity: 1, x: 0, transition: { duration: 0.75, ease: EASE } } };
const fadeRight: Variants = { hidden: { opacity: 0, x:  48 }, visible: { opacity: 1, x: 0, transition: { duration: 0.75, ease: EASE } } };

const Icon = {
  chevronDown: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9" /></svg>,
  virus:       <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="4" /><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" /></svg>,
  thermometer: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M14 14.76V3.5a2.5 2.5 0 0 0-5 0v11.26a4.5 4.5 0 1 0 5 0z" /></svg>,
  folder:      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" /></svg>,
  shield:      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>,
  flag:        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" /><line x1="4" y1="22" x2="4" y2="15" /></svg>,
  activity:    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12" /></svg>,
  home:        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><polyline points="9 22 9 12 15 12 15 22" /></svg>,
  users:       <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>,
  mail:        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>,
  check:       <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>,
};

function Section({ children, id, bg = '#fff', py = 96 }: { children: React.ReactNode; id?: string; bg?: string; py?: number }) {
  return (
    <section id={id} style={{ background: bg, padding: `${py}px 0` }}>
      <div style={{ maxWidth: 1120, margin: '0 auto', padding: '0 32px' }}>
        {children}
      </div>
    </section>
  );
}

function Pill({ text, dark = false }: { text: string; dark?: boolean }) {
  return (
    <span style={{
      display: 'inline-block',
      background: dark ? 'rgba(116,198,157,0.15)' : '#F0FDF4',
      color: dark ? '#74C69D' : '#2D6A4F',
      border: `1px solid ${dark ? 'rgba(116,198,157,0.25)' : '#D8F3DC'}`,
      fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.09em', textTransform: 'uppercase',
      padding: '0.28rem 0.8rem', borderRadius: 9999, marginBottom: '1.125rem',
    }}>
      {text}
    </span>
  );
}

// ── Contact form ─────────────────────────────────────────────────────────────
function ContactForm() {
  const [form, setForm]       = useState({ name: '', email: '', subject: '', message: '' });
  const [sending, setSending] = useState(false);
  const [sent, setSent]       = useState(false);
  const [error, setError]     = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSending(true);
    setError('');
    try {
      const base = (import.meta.env.VITE_API_BASE_URL as string) ?? '/api';
      const res  = await fetch(`${base}/contact`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const json = await res.json();
      if (res.ok && json.success) {
        setSent(true);
      } else {
        setError(json.message || 'Failed to send. Please try again.');
      }
    } catch {
      setError('Network error. Please check your connection and try again.');
    } finally {
      setSending(false);
    }
  };

  if (sent) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        style={{
          textAlign: 'center', padding: '3rem 2rem',
          background: '#F0FDF4', borderRadius: 18,
          border: '1px solid #D8F3DC',
        }}
      >
        <div style={{ width: 64, height: 64, borderRadius: '50%', background: '#2D6A4F', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.25rem', color: '#fff' }}>
          {Icon.check}
        </div>
        <h3 style={{ fontWeight: 800, fontSize: '1.2rem', color: '#071410', marginBottom: '0.5rem' }}>Message received!</h3>
        <p style={{ color: '#4B5563', fontSize: '0.95rem', lineHeight: 1.7 }}>
          Thank you for reaching out. We've sent a confirmation to <strong>{form.email}</strong> and will get back to you shortly.
        </p>
      </motion.div>
    );
  }

  const field = (key: keyof typeof form, label: string, type = 'text', placeholder = '') => (
    <div style={{ marginBottom: '1.125rem' }}>
      <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: '#374151', marginBottom: '0.4rem' }}>{label}</label>
      <input
        type={type}
        value={form[key]}
        placeholder={placeholder}
        onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
        required
        style={{
          width: '100%', boxSizing: 'border-box',
          padding: '0.65rem 0.875rem', borderRadius: 10,
          border: '1.5px solid #D1D5DB', fontSize: '0.9rem',
          outline: 'none', transition: 'border-color 0.18s',
          fontFamily: 'inherit',
        }}
        onFocus={e => (e.currentTarget.style.borderColor = '#2D6A4F')}
        onBlur={e => (e.currentTarget.style.borderColor = '#D1D5DB')}
      />
    </div>
  );

  return (
    <form onSubmit={handleSubmit}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 1rem' }}>
        {field('name',    'Full Name',      'text',  'Your name')}
        {field('email',   'Email Address',  'email', 'you@example.com')}
      </div>
      {field('subject', 'Subject', 'text', 'How can we help?')}
      <div style={{ marginBottom: '1.125rem' }}>
        <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: '#374151', marginBottom: '0.4rem' }}>Message</label>
        <textarea
          value={form.message}
          onChange={e => setForm(f => ({ ...f, message: e.target.value }))}
          required
          rows={5}
          placeholder="Tell us about your farm, cooperative, or any questions you have..."
          style={{
            width: '100%', boxSizing: 'border-box',
            padding: '0.65rem 0.875rem', borderRadius: 10,
            border: '1.5px solid #D1D5DB', fontSize: '0.9rem',
            resize: 'vertical', fontFamily: 'inherit', outline: 'none',
            transition: 'border-color 0.18s',
          }}
          onFocus={e => (e.currentTarget.style.borderColor = '#2D6A4F')}
          onBlur={e => (e.currentTarget.style.borderColor = '#D1D5DB')}
        />
      </div>
      {error && (
        <p style={{ color: '#dc2626', fontSize: '0.85rem', marginBottom: '0.875rem' }}>{error}</p>
      )}
      <button
        type="submit"
        disabled={sending}
        style={{
          width: '100%', padding: '0.875rem',
          background: 'linear-gradient(135deg, #2D6A4F, #38A169)',
          color: '#fff', fontWeight: 700, fontSize: '1rem',
          border: 'none', borderRadius: 10, cursor: 'pointer',
          opacity: sending ? 0.7 : 1, transition: 'opacity 0.18s',
          fontFamily: 'inherit',
        }}
      >
        {sending ? 'Sending…' : 'Send Message'}
      </button>
    </form>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function LandingPage() {
  const [scrolled, setScrolled] = useState(false);
  const isMobile = useIsMobile();

  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 72);
    window.addEventListener('scroll', fn, { passive: true });
    return () => window.removeEventListener('scroll', fn);
  }, []);

  // ── Navbar ──────────────────────────────────────────────────────────────────
  const Navbar = (
    <header style={{
      position: 'fixed', top: 0, left: 0, right: 0, zIndex: 200, height: 64,
      background: scrolled ? 'rgba(10,24,17,0.92)' : 'transparent',
      backdropFilter: scrolled ? 'blur(16px)' : 'none',
      borderBottom: scrolled ? '1px solid rgba(255,255,255,0.07)' : 'none',
      transition: 'background 0.35s, border-color 0.35s, backdrop-filter 0.35s',
    }}>
      <div style={{ maxWidth: 1120, margin: '0 auto', height: '100%', padding: '0 32px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <a href="#" style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none' }}>
          <img src="/logo.png" alt="SSMS" style={{ height: 30 }} />
          <span style={{ fontWeight: 900, fontSize: '1.1rem', color: '#fff', letterSpacing: '-0.03em' }}>SSMS</span>
        </a>

        {!isMobile && (
          <nav style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            {[
              { label: 'About',     href: '#about'     },
              { label: 'Challenge', href: '#challenge'  },
              { label: 'Solution',  href: '#solution'  },
              { label: 'Contact',   href: '#contact'   },
            ].map(n => (
              <a key={n.href} href={n.href} style={{ color: 'rgba(255,255,255,0.65)', fontSize: '0.875rem', fontWeight: 500, padding: '0.375rem 0.875rem', borderRadius: 8, textDecoration: 'none', transition: 'color 0.18s' }}
              onMouseEnter={e => (e.currentTarget.style.color = '#fff')}
              onMouseLeave={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.65)')}>
                {n.label}
              </a>
            ))}
          </nav>
        )}

        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <Link to="/login" style={{ color: 'rgba(255,255,255,0.8)', fontSize: '0.875rem', fontWeight: 600, padding: '0.4rem 1rem', borderRadius: 8, border: '1px solid rgba(255,255,255,0.2)', textDecoration: 'none', transition: 'background 0.18s', background: 'transparent' }}
          onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.08)')}
          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
            Sign In
          </Link>
          <Link to="/register" style={{ background: 'linear-gradient(135deg, #2D6A4F 0%, #38A169 100%)', color: '#fff', fontSize: '0.875rem', fontWeight: 700, padding: '0.45rem 1.125rem', borderRadius: 8, textDecoration: 'none', boxShadow: '0 2px 12px rgba(45,106,79,0.4)', transition: 'opacity 0.18s' }}
          onMouseEnter={e => (e.currentTarget.style.opacity = '0.88')}
          onMouseLeave={e => (e.currentTarget.style.opacity = '1')}>
            Get Started
          </Link>
        </div>
      </div>
    </header>
  );

  // ── Hero ──────────────────────────────────────────────────────────────────────
  const Hero = (
    <section style={{ position: 'relative', height: '100vh', minHeight: 640, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
      <video autoPlay muted loop playsInline style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', zIndex: 0 }}>
        <source src="/hero.mp4" type="video/mp4" />
      </video>
      <div style={{ position: 'absolute', inset: 0, zIndex: 1, background: ['linear-gradient(to bottom, rgba(7,20,16,0.55) 0%, rgba(7,20,16,0.4) 40%, rgba(7,20,16,0.75) 100%)', 'linear-gradient(135deg, rgba(7,20,16,0.6) 0%, transparent 60%)'].join(', ') }} />
      <div style={{ position: 'relative', zIndex: 2, textAlign: 'center', maxWidth: 820, padding: '0 24px' }}>
        <motion.div initial={{ opacity: 0, y: 20, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, background: 'rgba(255,255,255,0.1)', backdropFilter: 'blur(12px)', border: '1px solid rgba(255,255,255,0.2)', color: '#B7E4C7', fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.09em', textTransform: 'uppercase', padding: '0.35rem 1rem', borderRadius: 9999, marginBottom: '1.75rem' }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#52B788', boxShadow: '0 0 0 2px rgba(82,183,136,0.3)', animation: 'ssms-pulse 2s ease infinite' }} />
            Silkworm Smart Management System
          </span>
        </motion.div>
        <motion.h1 initial={{ opacity: 0, y: 36 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15, duration: 0.85, ease: [0.22, 1, 0.36, 1] }} style={{ fontSize: 'clamp(2.6rem, 7vw, 5rem)', fontWeight: 900, color: '#fff', letterSpacing: '-0.045em', lineHeight: 1.08, marginBottom: '1.375rem' }}>
          Rwanda's Silk Farming,<br />
          <span style={{ background: 'linear-gradient(135deg, #74C69D 0%, #52B788 60%, #38A169 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>Reimagined</span>
        </motion.h1>
        <motion.p initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3, duration: 0.75, ease: [0.22, 1, 0.36, 1] }} style={{ fontSize: 'clamp(1rem, 2.2vw, 1.22rem)', color: 'rgba(255,255,255,0.68)', maxWidth: 580, margin: '0 auto 2.75rem', lineHeight: 1.72 }}>
          AI disease detection, real-time IoT sensor monitoring, and cooperative management — purpose-built for Rwanda's sericulture farmers and cooperatives.
        </motion.p>
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.46, duration: 0.6, ease: [0.22, 1, 0.36, 1] }} style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
          <Link to="/register" style={{ background: 'linear-gradient(135deg, #2D6A4F, #38A169)', color: '#fff', fontWeight: 700, fontSize: '1rem', padding: '0.9rem 2.25rem', borderRadius: 12, textDecoration: 'none', boxShadow: '0 8px 32px rgba(45,106,79,0.5)', transition: 'transform 0.2s, box-shadow 0.2s', display: 'inline-block' }}
          onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 14px 40px rgba(45,106,79,0.6)'; }}
          onMouseLeave={e => { e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = '0 8px 32px rgba(45,106,79,0.5)'; }}>
            Get Started Free
          </Link>
          <a href="#contact" style={{ background: 'rgba(255,255,255,0.1)', backdropFilter: 'blur(10px)', color: '#fff', fontWeight: 700, fontSize: '1rem', padding: '0.9rem 2.25rem', borderRadius: 12, textDecoration: 'none', border: '1px solid rgba(255,255,255,0.28)', transition: 'background 0.2s', display: 'inline-block' }}
          onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.18)')}
          onMouseLeave={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.1)')}>
            Contact Us
          </a>
        </motion.div>
      </div>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.3, duration: 0.6 }} style={{ position: 'absolute', bottom: 36, left: '50%', transform: 'translateX(-50%)', zIndex: 2, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, color: 'rgba(255,255,255,0.35)', fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', pointerEvents: 'none' }}>
        <motion.div animate={{ y: [0, 7, 0] }} transition={{ repeat: Infinity, duration: 1.6, ease: 'easeInOut' }}>{Icon.chevronDown}</motion.div>
        Scroll
      </motion.div>
    </section>
  );

  // ── About ─────────────────────────────────────────────────────────────────────
  const About = (
    <Section id="about" bg="#fff">
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: isMobile ? '3rem' : '5rem', alignItems: 'center' }}>
        <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, amount: 0.25 }} variants={isMobile ? fadeUp : fadeLeft}>
          <div style={{ position: 'relative', borderRadius: 22, overflow: 'hidden', boxShadow: '0 32px 80px rgba(13,31,21,0.18)' }}>
            <img src="/silk1.jpg" alt="Silkworm larvae feeding on mulberry leaves" style={{ width: '100%', height: isMobile ? 280 : 440, objectFit: 'cover', display: 'block' }} />
            <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: 'linear-gradient(to top, rgba(7,20,16,0.82), transparent)', padding: '2.5rem 1.5rem 1.25rem' }}>
              <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.78rem', fontWeight: 500, letterSpacing: '0.04em' }}>
                Bombyx mori — the silkworm larva, feeding on Morus (mulberry) leaves
              </p>
            </div>
          </div>
        </motion.div>
        <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, amount: 0.25 }} variants={isMobile ? fadeUp : fadeRight}>
          <Pill text="The Craft" />
          <h2 style={{ fontSize: 'clamp(1.8rem, 3.5vw, 2.6rem)', fontWeight: 900, color: '#071410', letterSpacing: '-0.035em', lineHeight: 1.18, marginBottom: '1.25rem' }}>
            What is<br />Sericulture?
          </h2>
          <p style={{ color: '#4B5563', fontSize: '1.02rem', lineHeight: 1.78, marginBottom: '1rem' }}>
            Sericulture is the science of raising silkworms (<em>Bombyx mori</em>) to harvest raw silk — one of nature's finest natural fibers. Each larva spins a cocoon of continuous filament that can stretch over a kilometer.
          </p>
          <p style={{ color: '#4B5563', fontSize: '1.02rem', lineHeight: 1.78, marginBottom: '1.75rem' }}>
            In Rwanda, sericulture is gaining momentum as a high-value export crop — connecting rural farmers and cooperatives to global textile markets and contributing to economic diversification.
          </p>
          <div style={{ padding: '1.125rem 1.375rem', background: 'linear-gradient(135deg, #F0FDF4, #E6F7EE)', borderRadius: 12, borderLeft: '3px solid #2D6A4F' }}>
            <p style={{ color: '#1A3828', fontSize: '0.9rem', fontWeight: 600, lineHeight: 1.65 }}>
              Rwanda's national sericulture program, coordinated through RAB and cooperatives across key highland provinces, offers farmers a sustainable high-income alternative with access to premium export markets.
            </p>
          </div>
        </motion.div>
      </div>
    </Section>
  );

  // ── The Challenge ─────────────────────────────────────────────────────────────
  const Challenge = (
    <Section id="challenge" bg="#071410">
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: isMobile ? '3rem' : '5rem', alignItems: 'center' }}>
        <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, amount: 0.2 }} variants={isMobile ? fadeUp : fadeLeft}>
          <Pill text="The Challenge" dark />
          <h2 style={{ fontSize: 'clamp(1.8rem, 3.5vw, 2.6rem)', fontWeight: 900, color: '#fff', letterSpacing: '-0.035em', lineHeight: 1.18, marginBottom: '1.125rem' }}>
            Farming Blindly<br />Costs Livelihoods
          </h2>
          <p style={{ color: 'rgba(255,255,255,0.58)', fontSize: '1.02rem', lineHeight: 1.78, marginBottom: '2rem' }}>
            Silkworm rearing is highly sensitive to disease, temperature, and humidity. Without real-time visibility, entire batches can collapse — erasing weeks of investment and income for farming families.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
            {[
              { icon: Icon.virus,       color: '#FCA5A5', bg: 'rgba(220,38,38,0.12)', border: 'rgba(220,38,38,0.2)', title: 'Undetected disease outbreaks', desc: 'Muscardine, flacherie, and other diseases spread rapidly through batches before visible signs appear, devastating harvests.' },
              { icon: Icon.thermometer, color: '#93C5FD', bg: 'rgba(37,99,235,0.12)', border: 'rgba(37,99,235,0.2)', title: 'No environmental monitoring', desc: 'Silkworms require precise temperature (22–28°C) and humidity (70–85%). Manual checking cannot catch sudden deviations in time.' },
              { icon: Icon.folder,      color: '#C4B5FD', bg: 'rgba(124,58,237,0.12)', border: 'rgba(124,58,237,0.2)', title: 'Zero structured records', desc: 'Without digital batch records, farmers cannot track performance over time, access quality grades, or plan the next cycle.' },
            ].map((item, i) => (
              <motion.div key={item.title} initial={{ opacity: 0, x: -24 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.13, duration: 0.55, ease: [0.22, 1, 0.36, 1] }} style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start', background: 'rgba(255,255,255,0.04)', border: `1px solid ${item.border}`, borderRadius: 14, padding: '1rem 1.25rem' }}>
                <div style={{ width: 42, height: 42, borderRadius: 11, background: item.bg, color: item.color, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{item.icon}</div>
                <div>
                  <p style={{ color: '#fff', fontWeight: 700, fontSize: '0.9rem', marginBottom: '0.25rem' }}>{item.title}</p>
                  <p style={{ color: 'rgba(255,255,255,0.48)', fontSize: '0.83rem', lineHeight: 1.65 }}>{item.desc}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </motion.div>
        <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, amount: 0.2 }} variants={isMobile ? fadeUp : fadeRight}>
          <div style={{ position: 'relative', borderRadius: 22, overflow: 'hidden', boxShadow: '0 40px 100px rgba(0,0,0,0.55)' }}>
            <img src="/silk2.jpg" alt="Close-up of silkworm feeding" style={{ width: '100%', height: isMobile ? 280 : 500, objectFit: 'cover', display: 'block' }} />
            <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(7,20,16,0.65) 0%, transparent 55%)' }} />
            <div style={{ position: 'absolute', bottom: 20, left: 20, right: 20, background: 'rgba(7,20,16,0.75)', backdropFilter: 'blur(12px)', borderRadius: 12, padding: '0.875rem 1.125rem', border: '1px solid rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#f87171', flexShrink: 0, boxShadow: '0 0 0 3px rgba(248,113,113,0.25)' }} />
              <div>
                <p style={{ color: '#fff', fontWeight: 700, fontSize: '0.82rem' }}>Without monitoring</p>
                <p style={{ color: 'rgba(255,255,255,0.45)', fontSize: '0.75rem' }}>Disease spreads silently — undetected until it's too late</p>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </Section>
  );

  // ── Solution ──────────────────────────────────────────────────────────────────
  const Solution = (
    <Section id="solution" bg="#F0FDF4" py={112}>
      <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, amount: 0.3 }} variants={fadeUp} style={{ textAlign: 'center', maxWidth: 600, margin: '0 auto 5rem' }}>
        <Pill text="Our Solution" />
        <h2 style={{ fontSize: 'clamp(1.8rem, 3.5vw, 2.6rem)', fontWeight: 900, color: '#071410', letterSpacing: '-0.035em', lineHeight: 1.18, marginBottom: '1rem' }}>
          SSMS — Built for Sericulture
        </h2>
        <p style={{ color: '#4B5563', fontSize: '1.05rem', lineHeight: 1.75 }}>
          A complete digital platform connecting farmers and cooperative supervisors — bringing AI intelligence and live IoT monitoring to every silkworm farm.
        </p>
      </motion.div>
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(2, 1fr)', gap: '1.25rem' }}>
        {[
          { icon: Icon.flag,     color: '#dc2626', bg: '#fef2f2', title: 'AI Disease Detection',       desc: 'Upload a photo of your silkworms and get an instant AI diagnosis — identifying muscardine, flacherie, and other diseases before they spread across the batch.', delay: 0 },
          { icon: Icon.activity, color: '#2563eb', bg: '#dbeafe', title: 'Real-Time IoT Monitoring',   desc: 'Track temperature and humidity across all batches through connected sensors. Automated alerts fire the moment conditions drift outside safe thresholds — day or night.', delay: 0.1 },
          { icon: Icon.home,     color: '#16a34a', bg: '#f0fdf4', title: 'Farm & Batch Management',    desc: 'Manage every farm digitally, track silkworm batches through each life stage — egg, larva, pupa, cocoon, and harvest — with full production records.', delay: 0.2 },
          { icon: Icon.users,    color: '#7c3aed', bg: '#f3e8ff', title: 'Cooperative Management',     desc: 'Supervisors oversee all farms within their cooperative, monitor health trends, and access cross-farm analytics — keeping the entire cooperative productive.', delay: 0.3 },
        ].map((feat) => (
          <motion.div key={feat.title} initial={{ opacity: 0, y: 32 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: isMobile ? 0 : feat.delay, duration: 0.65, ease: [0.22, 1, 0.36, 1] }} whileHover={{ y: -5, boxShadow: '0 16px 48px rgba(13,31,21,0.12)' }} style={{ background: '#fff', borderRadius: 18, padding: '2rem', border: '1px solid #E2EAE6', boxShadow: '0 2px 14px rgba(13,31,21,0.06)', transition: 'box-shadow 0.25s, transform 0.25s' }}>
            <div style={{ width: 52, height: 52, borderRadius: 14, background: feat.bg, color: feat.color, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '1.375rem' }}>{feat.icon}</div>
            <h3 style={{ fontSize: '1.08rem', fontWeight: 800, color: '#071410', letterSpacing: '-0.02em', marginBottom: '0.625rem' }}>{feat.title}</h3>
            <p style={{ color: '#6B7280', fontSize: '0.91rem', lineHeight: 1.72 }}>{feat.desc}</p>
          </motion.div>
        ))}
      </div>
    </Section>
  );

  // ── Mission Banner ────────────────────────────────────────────────────────────
  const Mission = (
    <section style={{ background: 'linear-gradient(140deg, #071410 0%, #0D1F15 45%, #1A3828 100%)', padding: `${isMobile ? 72 : 112}px 32px`, textAlign: 'center', position: 'relative', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', top: '-80px', right: '-80px', width: 320, height: 320, borderRadius: '50%', background: 'radial-gradient(circle, rgba(56,161,105,0.12), transparent 70%)', pointerEvents: 'none' }} />
      <div style={{ position: 'absolute', bottom: '-60px', left: '-60px', width: 240, height: 240, borderRadius: '50%', background: 'radial-gradient(circle, rgba(52,183,136,0.08), transparent 70%)', pointerEvents: 'none' }} />
      <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, amount: 0.35 }} variants={fadeUp} style={{ maxWidth: 700, margin: '0 auto', position: 'relative', zIndex: 1 }}>
        <p style={{ color: '#74C69D', fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '1.25rem' }}>Our Mission</p>
        <h2 style={{ fontSize: 'clamp(1.9rem, 4.5vw, 3.1rem)', fontWeight: 900, color: '#fff', letterSpacing: '-0.04em', lineHeight: 1.15, marginBottom: '1.5rem' }}>
          Empowering Rwanda's silk farmers and cooperatives with the tools they deserve
        </h2>
        <p style={{ color: 'rgba(255,255,255,0.55)', fontSize: '1.08rem', lineHeight: 1.8 }}>
          Every farmer and cooperative supervisor deserves more than guesswork. SSMS bridges the gap between traditional farming knowledge and modern data intelligence — so every silkworm farm can grow, adapt, and reach its full potential.
        </p>
      </motion.div>
    </section>
  );

  // ── Contact ───────────────────────────────────────────────────────────────────
  const Contact = (
    <Section id="contact" bg="#fff" py={100}>
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: isMobile ? '3rem' : '5rem', alignItems: 'start' }}>
        {/* Left — info */}
        <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, amount: 0.2 }} variants={isMobile ? fadeUp : fadeLeft}>
          <Pill text="Get in Touch" />
          <h2 style={{ fontSize: 'clamp(1.8rem, 3.5vw, 2.4rem)', fontWeight: 900, color: '#071410', letterSpacing: '-0.035em', lineHeight: 1.18, marginBottom: '1.125rem' }}>
            Questions about<br />joining SSMS?
          </h2>
          <p style={{ color: '#4B5563', fontSize: '1rem', lineHeight: 1.78, marginBottom: '2rem' }}>
            Whether you're a farmer wanting to digitize your operation, a cooperative looking to manage your network, or a partner interested in collaboration — we'd love to hear from you.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            {[
              { icon: Icon.mail, title: 'Email us', desc: 'smartsericulturerw@gmail.com', color: '#2D6A4F', bg: '#F0FDF4' },
              { icon: Icon.users, title: 'For cooperatives', desc: 'Reach out to learn how SSMS can connect and support all the farms in your network.', color: '#7c3aed', bg: '#f3e8ff' },
              { icon: Icon.home, title: 'For farmers', desc: 'Start managing your farm, batches, and harvests digitally — register for free.', color: '#2563eb', bg: '#dbeafe' },
            ].map(item => (
              <div key={item.title} style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start' }}>
                <div style={{ width: 44, height: 44, borderRadius: 12, background: item.bg, color: item.color, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{item.icon}</div>
                <div>
                  <p style={{ fontWeight: 700, fontSize: '0.9rem', color: '#071410', marginBottom: '0.2rem' }}>{item.title}</p>
                  <p style={{ color: '#6B7280', fontSize: '0.85rem', lineHeight: 1.6 }}>{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </motion.div>

        {/* Right — form */}
        <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, amount: 0.2 }} variants={isMobile ? fadeUp : fadeRight}>
          <div style={{ background: '#FAFAFA', borderRadius: 20, padding: '2.25rem', border: '1px solid #E5E7EB', boxShadow: '0 4px 24px rgba(0,0,0,0.06)' }}>
            <h3 style={{ fontWeight: 800, fontSize: '1.05rem', color: '#071410', marginBottom: '1.5rem' }}>Send us a message</h3>
            <ContactForm />
          </div>
        </motion.div>
      </div>
    </Section>
  );

  // ── CTA ───────────────────────────────────────────────────────────────────────
  const CTA = (
    <Section bg="#F0FDF4" py={100}>
      <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, amount: 0.4 }} variants={fadeUp} style={{ textAlign: 'center' }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 72, height: 72, borderRadius: 20, background: 'linear-gradient(135deg, #F0FDF4, #D8F3DC)', marginBottom: '1.75rem' }}>{Icon.shield}</div>
        <h2 style={{ fontSize: 'clamp(1.8rem, 3.5vw, 2.75rem)', fontWeight: 900, color: '#071410', letterSpacing: '-0.035em', lineHeight: 1.18, marginBottom: '1rem' }}>
          Ready to modernize<br />your sericulture?
        </h2>
        <p style={{ color: '#6B7280', fontSize: '1.05rem', lineHeight: 1.75, maxWidth: 460, margin: '0 auto 2.75rem' }}>
          Join SSMS and bring smart technology to your farm or cooperative — AI disease detection, live sensor insights, and full harvest tracking.
        </p>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
          <Link to="/register" style={{ background: 'linear-gradient(135deg, #2D6A4F, #38A169)', color: '#fff', fontWeight: 700, fontSize: '1rem', padding: '0.9rem 2.25rem', borderRadius: 12, textDecoration: 'none', boxShadow: '0 8px 32px rgba(45,106,79,0.28)', display: 'inline-block', transition: 'transform 0.2s, box-shadow 0.2s' }}
          onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 14px 40px rgba(45,106,79,0.38)'; }}
          onMouseLeave={e => { e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = '0 8px 32px rgba(45,106,79,0.28)'; }}>
            Create Free Account
          </Link>
          <a href="#contact" style={{ background: 'transparent', color: '#2D6A4F', fontWeight: 700, fontSize: '1rem', padding: '0.9rem 2.25rem', borderRadius: 12, textDecoration: 'none', border: '2px solid #2D6A4F', display: 'inline-block', transition: 'background 0.2s' }}
          onMouseEnter={e => (e.currentTarget.style.background = '#E6F7EE')}
          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
            Contact Us
          </a>
        </div>
      </motion.div>
    </Section>
  );

  // ── Footer ────────────────────────────────────────────────────────────────────
  const Footer = (
    <footer style={{ background: '#0D1F15', padding: `${isMobile ? 48 : 64}px 32px 32px`, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
      <div style={{ maxWidth: 1120, margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '2.5rem', marginBottom: '3rem' }}>
          <div style={{ maxWidth: 280 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: '0.875rem' }}>
              <img src="/logo.png" alt="SSMS" style={{ height: 28 }} />
              <span style={{ fontWeight: 900, fontSize: '1rem', color: '#fff', letterSpacing: '-0.03em' }}>SSMS</span>
            </div>
            <p style={{ color: 'rgba(255,255,255,0.35)', fontSize: '0.84rem', lineHeight: 1.7 }}>
              Silkworm Smart Management System — building a data-driven future for Rwanda's sericulture sector.
            </p>
          </div>
          <div style={{ display: 'flex', gap: '3.5rem', flexWrap: 'wrap' }}>
            <div>
              <p style={{ color: 'rgba(255,255,255,0.28)', fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '0.875rem' }}>Explore</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.55rem' }}>
                {[{ label: 'About Sericulture', href: '#about' }, { label: 'The Challenge', href: '#challenge' }, { label: 'Our Solution', href: '#solution' }, { label: 'Contact Us', href: '#contact' }].map(l => (
                  <a key={l.href} href={l.href} style={{ color: 'rgba(255,255,255,0.48)', fontSize: '0.875rem', textDecoration: 'none', transition: 'color 0.15s' }}
                  onMouseEnter={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.8)')}
                  onMouseLeave={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.48)')}>
                    {l.label}
                  </a>
                ))}
              </div>
            </div>
            <div>
              <p style={{ color: 'rgba(255,255,255,0.28)', fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '0.875rem' }}>Platform</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.55rem' }}>
                <Link to="/login"    style={{ color: 'rgba(255,255,255,0.48)', fontSize: '0.875rem', textDecoration: 'none', transition: 'color 0.15s' }} onMouseEnter={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.8)')} onMouseLeave={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.48)')}>Sign In</Link>
                <Link to="/register" style={{ color: 'rgba(255,255,255,0.48)', fontSize: '0.875rem', textDecoration: 'none', transition: 'color 0.15s' }} onMouseEnter={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.8)')} onMouseLeave={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.48)')}>Register</Link>
              </div>
            </div>
          </div>
        </div>
        <div style={{ borderTop: '1px solid rgba(255,255,255,0.07)', paddingTop: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
          <p style={{ color: 'rgba(255,255,255,0.22)', fontSize: '0.8rem' }}>© 2026 SSMS — Silkworm Smart Management System · Rwanda</p>
          <p style={{ color: 'rgba(255,255,255,0.22)', fontSize: '0.8rem' }}>Built for Rwanda's sericulture farmers and cooperatives</p>
        </div>
      </div>
    </footer>
  );

  return (
    <>
      <style>{`@keyframes ssms-pulse { 0%, 100% { box-shadow: 0 0 0 0 rgba(82,183,136,0.5); } 50% { box-shadow: 0 0 0 5px rgba(82,183,136,0); } }`}</style>
      <div style={{ fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif", color: '#111827', lineHeight: 1.6, overflowX: 'hidden', WebkitFontSmoothing: 'antialiased' }}>
        {Navbar}
        {Hero}
        {About}
        {Challenge}
        {Solution}
        {Mission}
        {Contact}
        {CTA}
        {Footer}
      </div>
    </>
  );
}
