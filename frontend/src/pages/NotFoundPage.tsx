import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAuth } from '../context/AuthContext';

export default function NotFoundPage() {
  const { isAuthenticated, user } = useAuth();
  const navigate = useNavigate();

  const dashboardPath = user?.role === 'ADMIN'
    ? '/admin'
    : user?.role === 'SUPERVISOR'
    ? '/supervisor'
    : '/farmer';

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      background: 'var(--bg, #f8faf9)', padding: '2rem', textAlign: 'center',
    }}>
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        style={{ maxWidth: 480 }}
      >
        {/* Illustration */}
        <div style={{ marginBottom: '2rem', position: 'relative', display: 'inline-block' }}>
          <div style={{
            width: 120, height: 120, borderRadius: '50%',
            background: 'linear-gradient(135deg, #dcfce7, #bbf7d0)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto',
          }}>
            <svg width="52" height="52" viewBox="0 0 24 24" fill="none" stroke="var(--brand-600, #16a34a)" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"/>
              <line x1="12" y1="8" x2="12" y2="12"/>
              <line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
          </div>
          <span style={{
            position: 'absolute', top: -8, right: -16,
            background: 'var(--brand-600, #16a34a)', color: '#fff',
            fontWeight: 900, fontSize: '1.1rem', borderRadius: 8,
            padding: '2px 10px', letterSpacing: '-0.02em',
          }}>404</span>
        </div>

        <h1 style={{ fontSize: '1.8rem', fontWeight: 900, color: 'var(--text)', letterSpacing: '-0.03em', marginBottom: '0.625rem' }}>
          Page not found
        </h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.95rem', lineHeight: 1.65, marginBottom: '2rem' }}>
          The page you're looking for doesn't exist or has been moved. Check the URL or head back to safety.
        </p>

        <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center', flexWrap: 'wrap' }}>
          <button
            onClick={() => navigate(-1)}
            style={{
              padding: '0.6rem 1.25rem', borderRadius: 10,
              border: '1.5px solid var(--border)', background: 'transparent',
              color: 'var(--text)', fontWeight: 600, fontSize: '0.9rem',
              cursor: 'pointer',
            }}
          >
            ← Go back
          </button>
          {isAuthenticated ? (
            <Link
              to={dashboardPath}
              style={{
                padding: '0.6rem 1.25rem', borderRadius: 10,
                background: 'var(--brand-600, #16a34a)', color: '#fff',
                fontWeight: 600, fontSize: '0.9rem', textDecoration: 'none',
              }}
            >
              Dashboard
            </Link>
          ) : (
            <Link
              to="/"
              style={{
                padding: '0.6rem 1.25rem', borderRadius: 10,
                background: 'var(--brand-600, #16a34a)', color: '#fff',
                fontWeight: 600, fontSize: '0.9rem', textDecoration: 'none',
              }}
            >
              Go home
            </Link>
          )}
        </div>
      </motion.div>
    </div>
  );
}
