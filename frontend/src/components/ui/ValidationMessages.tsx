import { useEffect, useRef } from 'react';
import { useLanguage } from '../../context/LanguageContext';
import { fill } from '../../utils/fill';

type Field = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;

const isField = (el: EventTarget | null): el is Field =>
  el instanceof HTMLInputElement || el instanceof HTMLSelectElement || el instanceof HTMLTextAreaElement;

/**
 * The browser tells a person what is wrong with a field in its own language ("Please fill out this field."), which is not
 * always the language chosen in the app. This puts the app's words into that same message. It sets the message when the
 * browser finds a field invalid and takes it away as soon as the person edits the field, so the browser asks again.
 * A message that a page set for itself is left alone. It draws nothing.
 */
export default function ValidationMessages() {
  const { t } = useLanguage();
  const say = useRef(t);
  say.current = t;

  useEffect(() => {
    const words = (field: Field): string | null => {
      const v = field.validity;
      const t = say.current;
      if (v.valueMissing) {
        if (field instanceof HTMLSelectElement || (field instanceof HTMLInputElement && field.type === 'radio')) return t('vmSelect');
        if (field instanceof HTMLInputElement && field.type === 'checkbox') return t('vmTick');
        return t('vmRequired');
      }
      if (v.typeMismatch) return field instanceof HTMLInputElement && field.type === 'email' ? t('vmEmail') : t('vmFormat');
      if (v.badInput || v.stepMismatch) return t('vmNumber');
      if (v.rangeUnderflow) return fill(t('vmMin'), { min: (field as HTMLInputElement).min });
      if (v.rangeOverflow) return fill(t('vmMax'), { max: (field as HTMLInputElement).max });
      if (v.tooShort) return fill(t('vmShort'), { n: (field as HTMLInputElement).minLength });
      if (v.tooLong) return fill(t('vmLong'), { n: (field as HTMLInputElement).maxLength });
      if (v.patternMismatch) return field.title || t('vmFormat');
      return null;
    };

    const onInvalid = (event: Event) => {
      const field = event.target;
      if (!isField(field)) return;
      // A message the page set for itself is its own. One of ours is set again, in the language now chosen.
      if (field.validity.customError && field.dataset.vm !== '1') return;
      const text = words(field);
      if (!text) return;
      field.setCustomValidity(text);
      field.dataset.vm = '1';
    };

    const onEdit = (event: Event) => {
      const field = event.target;
      if (!isField(field) || field.dataset.vm !== '1') return;
      field.setCustomValidity('');
      delete field.dataset.vm;
    };

    // "invalid" does not bubble, so it is caught on the way down.
    document.addEventListener('invalid', onInvalid, true);
    document.addEventListener('input', onEdit, true);
    document.addEventListener('change', onEdit, true);
    return () => {
      document.removeEventListener('invalid', onInvalid, true);
      document.removeEventListener('input', onEdit, true);
      document.removeEventListener('change', onEdit, true);
    };
  }, []);

  return null;
}
