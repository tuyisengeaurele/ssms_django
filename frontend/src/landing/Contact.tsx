import { useCallback, useRef, useState, type FormEvent } from 'react';
import { useLanguage } from '../context/LanguageContext';
import { Reveal } from './motion/Reveal';
import { Turnstile } from './Turnstile';
import './contact.css';

export interface ContactPayload {
  name: string;
  email: string;
  subject: string;
  message: string;
  /** Hidden trap field. People leave it empty. */
  website: string;
}

/** status 0 means the request never reached the server. */
export async function submitContact(
  payload: ContactPayload,
  token?: string,
): Promise<{ ok: boolean; status: number }> {
  const base = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? '/api';
  try {
    const res = await fetch(`${base}/contact`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(token ? { ...payload, turnstileToken: token } : payload),
    });
    let ok = res.ok;
    try {
      const json = await res.json();
      ok = res.ok && json?.success !== false;
    } catch {
      // A reply without JSON still counts by its status.
    }
    return { ok, status: res.status };
  } catch {
    return { ok: false, status: 0 };
  }
}

type FieldName = 'name' | 'email' | 'subject' | 'message';
type Errors = Partial<Record<FieldName, string>>;
const FIELDS: FieldName[] = ['name', 'email', 'subject', 'message'];
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function Contact() {
  const { t } = useLanguage();
  const [values, setValues] = useState({ name: '', email: '', subject: '', message: '', website: '' });
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState('');
  const [sending, setSending] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const token = useRef<string | undefined>(undefined);
  const inputs = useRef<Partial<Record<FieldName, HTMLInputElement | HTMLTextAreaElement | null>>>({});
  const busy = useRef(false);

  const onToken = useCallback((value: string) => {
    token.current = value;
  }, []);

  const validate = (): Errors => {
    const next: Errors = {};
    for (const field of FIELDS) {
      if (!values[field].trim()) next[field] = t('lpFormRequired');
    }
    if (!next.email && !EMAIL.test(values.email.trim())) next.email = t('lpFormEmailInvalid');
    if (!next.message && values.message.trim().length < 10) next.message = t('lpFormMessageShort');
    return next;
  };

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy.current) return;

    const found = validate();
    setErrors(found);
    setFormError('');
    const first = FIELDS.find((f) => found[f]);
    if (first) {
      inputs.current[first]?.focus();
      return;
    }

    busy.current = true;
    setSending(true);
    const result = await submitContact(
      { ...values, name: values.name.trim(), email: values.email.trim(), subject: values.subject.trim(), message: values.message.trim() },
      token.current,
    );
    busy.current = false;
    setSending(false);

    if (result.ok) setSentTo(values.email.trim());
    else if (result.status === 429) setFormError(t('lpFormErrorBusy'));
    else if (result.status === 0) setFormError(t('lpFormErrorNetwork'));
    else setFormError(t('lpFormErrorGeneric'));
  };

  const field = (name: FieldName, label: string, type = 'text', autoComplete?: string) => {
    const error = errors[name];
    const common = {
      id: `contact-${name}`,
      name,
      value: values[name],
      'aria-invalid': error ? true : undefined,
      'aria-describedby': error ? `contact-${name}-error` : undefined,
      autoComplete,
      onChange: (e: { target: { value: string } }) => setValues((v) => ({ ...v, [name]: e.target.value })),
    };
    return (
      <div className="l-field">
        <label htmlFor={common.id}>{label}</label>
        {name === 'message' ? (
          <textarea
            {...common}
            rows={5}
            ref={(el) => {
              inputs.current[name] = el;
            }}
          />
        ) : (
          <input
            {...common}
            type={type}
            ref={(el) => {
              inputs.current[name] = el;
            }}
          />
        )}
        {error && (
          <small id={`contact-${name}-error`} className="l-field__error">
            {error}
          </small>
        )}
      </div>
    );
  };

  return (
    <section id="contact" className="l-contact" aria-labelledby="contact-title">
      <div className="l-container l-contact__grid">
        <div>
          <Reveal as="p" className="l-eyebrow">
            {t('lpNavContact')}
          </Reveal>
          <Reveal as="h2" className="l-contact__title" delay={60}>
            <span id="contact-title">{t('lpContactTitle')}</span>
          </Reveal>
          <Reveal as="p" delay={120} className="l-contact__sub">
            {t('lpContactSub')}
          </Reveal>
        </div>

        <Reveal className="l-contact__card" delay={100}>
          {sentTo ? (
            <div className="l-contact__sent" role="status">
              <span className="l-contact__tick" aria-hidden="true">
                <svg viewBox="0 0 24 24" width="22" height="22" focusable="false">
                  <path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>
              <h3>{t('lpFormSentTitle')}</h3>
              <p>{t('lpFormSentBody').replace('{email}', sentTo)}</p>
            </div>
          ) : (
            <form onSubmit={onSubmit} noValidate>
              {field('name', t('lpFormName'), 'text', 'name')}
              {field('email', t('lpFormEmail'), 'email', 'email')}
              {field('subject', t('lpFormSubject'), 'text')}
              {field('message', t('lpFormMessage'))}

              <div className="l-visually-hidden" aria-hidden="true">
                <input
                  type="text"
                  name="website"
                  tabIndex={-1}
                  autoComplete="off"
                  value={values.website}
                  onChange={(e) => setValues((v) => ({ ...v, website: e.target.value }))}
                />
              </div>

              <Turnstile onToken={onToken} />

              <div role="alert" className="l-contact__error">
                {formError}
              </div>

              <button type="submit" className="l-btn l-contact__send" disabled={sending}>
                {sending ? t('lpFormSending') : t('lpFormSend')}
              </button>
            </form>
          )}
        </Reveal>
      </div>
    </section>
  );
}
