import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { LanguageProvider } from '../context/LanguageContext';
import PrivacyPolicyPage from '../pages/PrivacyPolicyPage';
import TermsOfServicePage from '../pages/TermsOfServicePage';
import { landingTranslations } from './landing';
import { pageTranslations } from './pages';

// Farmers and supervisors do not know about administrators, so the word stays on the admin screens.
// When people need help they are pointed to their supervisor or to the SSMS team.

const ADMIN_WORDS = /admin|administrat|umuyobozi/i;

// Keys that belong to screens only an administrator opens, and the role name itself.
const ADMIN_SCREENS = /^(us|au|ad|co|ms|rep|sr)[A-Z]|^(roleAdmin|ptAdmin|ptSectionAdmin)$/;

function offenders(dictionary: Record<string, Record<string, string>>, skip?: RegExp): string[] {
  return Object.entries(dictionary)
    .filter(([key]) => !skip?.test(key))
    .flatMap(([key, entry]) => Object.entries(entry).filter(([, text]) => ADMIN_WORDS.test(text)).map(([locale]) => `${key}.${locale}`));
}

describe('The word administrator', () => {
  it('is not on the public landing page or the no access page, in any language', () => {
    expect(offenders(landingTranslations)).toEqual([]);
  });

  it('is not in the screens farmers and supervisors use, in any language', () => {
    expect(offenders(pageTranslations, ADMIN_SCREENS)).toEqual([]);
  });

  it.each([
    ['privacy policy', PrivacyPolicyPage],
    ['terms of service', TermsOfServicePage],
  ])('is not on the %s page', (_name, Page) => {
    const { container } = render(
      <MemoryRouter>
        <LanguageProvider>
          <Page />
        </LanguageProvider>
      </MemoryRouter>,
    );
    expect(container.textContent).not.toMatch(ADMIN_WORDS);
  });
});
