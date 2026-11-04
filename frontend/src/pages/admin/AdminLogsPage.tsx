import { useSearchParams } from 'react-router-dom';
import { useLanguage } from '../../context/LanguageContext';
import { LogStream } from '../../services/logs.service';
import AdminAuditLogPage from './AdminAuditLogPage';
import LogStreamPanel from './LogStreamPanel';

type Stream = 'audit' | LogStream;

const STREAMS: Stream[] = ['audit', 'security', 'requests', 'jobs'];

/** The four logs of the System page. The open one is in the address, so a link can point at it. */
export default function AdminLogsPage() {
  const { t } = useLanguage();
  const [params, setParams] = useSearchParams();

  const asked = params.get('stream');
  const stream: Stream = STREAMS.includes(asked as Stream) ? (asked as Stream) : 'audit';

  const open = (next: Stream) => {
    setParams(next === 'audit' ? {} : { stream: next }, { replace: true });
  };

  return (
    <div>
      <nav className="stream-switch" aria-label={t('lgStreams')}>
        {STREAMS.map((name) => (
          <button
            key={name}
            type="button"
            className={`stream-button${name === stream ? ' is-on' : ''}`}
            aria-pressed={name === stream}
            onClick={() => open(name)}
          >
            {t(`lgStream_${name}`)}
          </button>
        ))}
      </nav>

      {stream === 'audit' ? <AdminAuditLogPage /> : <LogStreamPanel key={stream} stream={stream} />}
    </div>
  );
}
