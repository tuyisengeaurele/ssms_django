import { Fragment } from 'react';
import { useLanguage } from '../../context/LanguageContext';
import { AuthField } from './AuthShell';

/** The password rules the server enforces. The server also turns away common passwords and ones close to the name. */
const RULES = [
  { key: 'length', label: 'regRuleLength', test: (v: string) => v.length >= 8 },
  { key: 'upper', label: 'regRuleUpper', test: (v: string) => /[A-Z]/.test(v) },
  { key: 'lower', label: 'regRuleLower', test: (v: string) => /[a-z]/.test(v) },
  { key: 'digit', label: 'regRuleDigit', test: (v: string) => /\d/.test(v) },
] as const;

type RuleKey = (typeof RULES)[number]['key'];

export function passwordRules(password: string): Record<RuleKey, boolean> {
  return Object.fromEntries(RULES.map((rule) => [rule.key, rule.test(password)])) as Record<RuleKey, boolean>;
}

type Problem = 'regNeedStrong' | 'regMismatch' | 'regNeedTerms';

/** What stops the form from being sent, as the key of a kind sentence, or null when it can go. */
export function newAccountProblem({ password, confirm, accepted }: { password: string; confirm: string; accepted: boolean }): Problem | null {
  if (!Object.values(passwordRules(password)).every(Boolean)) return 'regNeedStrong';
  if (password !== confirm) return 'regMismatch';
  if (!accepted) return 'regNeedTerms';
  return null;
}

interface Props {
  /** Makes the ids of the fields unique on the page. */
  idPrefix: string;
  password: string;
  confirm: string;
  accepted: boolean;
  onChange: (patch: Partial<{ password: string; confirm: string; accepted: boolean }>) => void;
}

/** The password, its confirmation and the box for the terms. Shared by every form that makes an account. */
export default function NewAccountFields({ idPrefix, password, confirm, accepted, onChange }: Props) {
  const { t } = useLanguage();
  const rulesId = `${idPrefix}-rules`;
  const mismatchId = `${idPrefix}-mismatch`;
  const met = passwordRules(password);
  const mismatch = confirm !== '' && confirm !== password;

  const links: Record<string, { href: string; text: string }> = {
    terms: { href: '/terms', text: t('regTermsName') },
    privacy: { href: '/privacy', text: t('regPrivacyName') },
  };

  return (
    <>
      <AuthField
        id={`${idPrefix}-password`}
        label={t('loginPasswordLabel')}
        type="password"
        value={password}
        onChange={(e) => onChange({ password: e.target.value })}
        autoComplete="new-password"
        aria-describedby={rulesId}
        required
      />
      <ul id={rulesId} className="l-auth__rules l-auth__rules--text" aria-label={t('regRulesTitle')}>
        {RULES.map((rule) => (
          <li key={rule.key} className={met[rule.key] ? 'is-met' : undefined}>
            <span>{t(rule.label)}</span>
            <span className="l-auth__sr"> ({t(met[rule.key] ? 'regMet' : 'regNotYet')})</span>
          </li>
        ))}
      </ul>

      <AuthField
        id={`${idPrefix}-confirm`}
        label={t('regConfirm')}
        type="password"
        value={confirm}
        onChange={(e) => onChange({ confirm: e.target.value })}
        autoComplete="new-password"
        aria-invalid={mismatch ? true : undefined}
        aria-describedby={mismatch ? mismatchId : undefined}
        required
      />
      {mismatch ? (
        <p id={mismatchId} className="l-field__hint l-field__hint--problem" role="status">
          {t('regMismatch')}
        </p>
      ) : null}

      <div className="l-check">
        <input id={`${idPrefix}-terms`} type="checkbox" checked={accepted} onChange={(e) => onChange({ accepted: e.target.checked })} />
        <label htmlFor={`${idPrefix}-terms`}>
          {t('regAgree').split(/(\[terms\]|\[privacy\])/).map((part, i) => {
            const link = links[part.slice(1, -1)];
            // Opened beside the form, so what has been typed is not lost.
            return link && part.startsWith('[')
              ? <a key={i} href={link.href} target="_blank" rel="noopener noreferrer">{link.text}</a>
              : <Fragment key={i}>{part}</Fragment>;
          })}
        </label>
      </div>
    </>
  );
}
