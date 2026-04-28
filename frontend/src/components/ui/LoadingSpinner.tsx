export default function LoadingSpinner({ fullPage = false }: { fullPage?: boolean }) {
  if (fullPage) {
    return (
      <div className="flex-center" style={{ minHeight: '100vh' }}>
        <div className="spinner" />
      </div>
    );
  }
  return <div className="spinner" style={{ margin: '2rem auto' }} />;
}
