import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';

const LAST_UPDATED = 'May 17, 2026';

interface SectionProps { title: string; children: React.ReactNode }
function Section({ title, children }: SectionProps) {
  return (
    <section style={{ marginBottom: '2.5rem' }}>
      <h2 style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text)', marginBottom: '0.75rem', paddingBottom: '0.5rem', borderBottom: '1.5px solid var(--border)' }}>
        {title}
      </h2>
      <div style={{ fontSize: '0.9rem', color: 'var(--text-muted)', lineHeight: 1.75 }}>
        {children}
      </div>
    </section>
  );
}

export default function PrivacyPolicyPage() {
  useEffect(() => { window.scrollTo(0, 0); }, []);

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg, #f8faf9)' }}>
      {/* Top bar */}
      <header style={{ background: '#0D1F15', padding: '1rem 2rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Link to="/" style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none' }}>
          <img src="/logo.png" alt="SSMS" style={{ height: 28 }} />
          <span style={{ fontWeight: 900, fontSize: '1rem', color: '#fff', letterSpacing: '-0.03em' }}>SSMS</span>
        </Link>
        <Link to="/" style={{ fontSize: '0.82rem', color: 'rgba(255,255,255,0.55)', textDecoration: 'none' }}>← Back to home</Link>
      </header>

      {/* Content */}
      <motion.main
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
        style={{ maxWidth: 780, margin: '0 auto', padding: '3rem 2rem 5rem' }}
      >
        <p style={{ fontSize: '0.8rem', color: 'var(--text-faint)', marginBottom: '0.5rem' }}>Last updated: {LAST_UPDATED}</p>
        <h1 style={{ fontSize: '2rem', fontWeight: 900, color: 'var(--text)', letterSpacing: '-0.03em', marginBottom: '0.5rem' }}>Privacy Policy</h1>
        <p style={{ fontSize: '0.95rem', color: 'var(--text-muted)', lineHeight: 1.7, marginBottom: '2.5rem' }}>
          This Privacy Policy explains how the Silkworm Smart Management System (<strong>"SSMS"</strong>, <strong>"we"</strong>, <strong>"our"</strong>) collects, uses, and protects information about users of the platform. By registering or using SSMS you agree to this policy.
        </p>

        <Section title="1. Information We Collect">
          <p>We collect only the information necessary to operate the platform:</p>
          <ul style={{ paddingLeft: '1.25rem', marginTop: '0.5rem', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
            <li><strong>Account data:</strong> name, email address, and role (Farmer / Supervisor / Admin).</li>
            <li><strong>Farm &amp; batch data:</strong> farm names, locations, batch stages, and sensor readings you enter.</li>
            <li><strong>Disease detection images:</strong> photos uploaded for AI analysis are stored on Cloudinary and used solely to run the diagnostic model.</li>
            <li><strong>Usage data:</strong> actions you take within the platform (e.g., batch stage changes, logins) are recorded in our audit log for security and accountability.</li>
            <li><strong>Technical data:</strong> IP address, browser type, and request timestamps collected automatically for security.</li>
          </ul>
        </Section>

        <Section title="2. How We Use Your Information">
          <ul style={{ paddingLeft: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
            <li>To operate and improve the SSMS platform.</li>
            <li>To send alerts and notifications relevant to your farms and batches.</li>
            <li>To run the AI disease-detection model on images you upload.</li>
            <li>To detect and prevent unauthorised access or abuse.</li>
            <li>To respond to contact-form submissions.</li>
          </ul>
          <p style={{ marginTop: '0.75rem' }}>We do <strong>not</strong> sell, rent, or trade your personal information to third parties.</p>
        </Section>

        <Section title="3. Data Storage & Security">
          <p>
            Your data is stored on PostgreSQL databases hosted on Railway/Render infrastructure. Disease-detection images are stored on Cloudinary (Cloudinary's privacy policy applies to that data). We use industry-standard measures — JWT authentication with token blacklisting, bcrypt password hashing, HTTPS/TLS in transit, and HSTS headers — to protect your information.
          </p>
          <p style={{ marginTop: '0.5rem' }}>
            No method of transmission or storage is 100 % secure. We will notify affected users promptly in the event of a confirmed data breach.
          </p>
        </Section>

        <Section title="4. Cookies & Local Storage">
          <p>
            SSMS stores your authentication token and language preference in browser localStorage. We do not use third-party tracking cookies or advertising cookies. You can clear localStorage at any time via your browser settings.
          </p>
        </Section>

        <Section title="5. Data Retention">
          <p>
            Account and farm data is retained for as long as your account is active. Sensor readings older than 90 days may be automatically purged to manage storage. Disease-detection images on Cloudinary are retained indefinitely unless you request deletion. Audit log entries are retained for at least 12 months.
          </p>
        </Section>

        <Section title="6. Your Rights">
          <p>You have the right to:</p>
          <ul style={{ paddingLeft: '1.25rem', marginTop: '0.5rem', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
            <li><strong>Access</strong> the personal data we hold about you.</li>
            <li><strong>Correct</strong> inaccurate data via your profile settings.</li>
            <li><strong>Request deletion</strong> of your account and associated data.</li>
            <li><strong>Export</strong> your harvest records via the CSV export feature.</li>
          </ul>
          <p style={{ marginTop: '0.75rem' }}>
            To exercise any of these rights, contact us at <a href="mailto:smartsericulturerw@gmail.com" style={{ color: 'var(--brand-600)' }}>smartsericulturerw@gmail.com</a>.
          </p>
        </Section>

        <Section title="7. Third-Party Services">
          <p>SSMS integrates with the following external services:</p>
          <ul style={{ paddingLeft: '1.25rem', marginTop: '0.5rem', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
            <li><strong>Cloudinary</strong> — image storage for disease-detection uploads.</li>
            <li><strong>Sentry</strong> — anonymous error monitoring (PII is not sent).</li>
            <li><strong>Railway / Render</strong> — cloud hosting infrastructure.</li>
          </ul>
          <p style={{ marginTop: '0.75rem' }}>Each third-party service has its own privacy policy. We do not share personal data with them beyond what is technically required.</p>
        </Section>

        <Section title="8. Changes to This Policy">
          <p>
            We may update this policy from time to time. The "Last updated" date at the top of this page indicates when the most recent revision was made. Continued use of SSMS after changes constitutes acceptance of the revised policy.
          </p>
        </Section>

        <Section title="9. Contact">
          <p>
            Questions or concerns? Contact us at <a href="mailto:smartsericulturerw@gmail.com" style={{ color: 'var(--brand-600)' }}>smartsericulturerw@gmail.com</a>.
          </p>
        </Section>

        <div style={{ marginTop: '3rem', paddingTop: '1.5rem', borderTop: '1px solid var(--border)', display: 'flex', gap: '1.5rem', flexWrap: 'wrap' }}>
          <Link to="/terms" style={{ fontSize: '0.85rem', color: 'var(--brand-600)', fontWeight: 600 }}>Terms of Service →</Link>
          <Link to="/" style={{ fontSize: '0.85rem', color: 'var(--text-faint)' }}>← Home</Link>
        </div>
      </motion.main>
    </div>
  );
}
