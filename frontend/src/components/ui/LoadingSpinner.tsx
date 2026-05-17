export default function LoadingSpinner({ fullPage = false }: { fullPage?: boolean }) {
  if (fullPage) {
    return (
      <div className="flex-center" style={{ minHeight: '100vh', background: 'var(--bg)' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}>
          <img src="/logo.png" alt="SSMS" style={{ width: 52, height: 52, objectFit: 'contain', animation: 'pulse-dot 1.8s ease infinite' }} />
          <div className="spinner spinner-dark" style={{ width: 28, height: 28 }} />
        </div>
      </div>
    );
  }
  return <div className="spinner spinner-dark" style={{ margin: '2rem auto' }} />;
}
