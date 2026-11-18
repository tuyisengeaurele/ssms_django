import { describe, expect, it } from 'vitest';
import { sitemapXml } from '../scripts/sitemap.mjs';

// The sitemap tells search engines which addresses exist. The landing page exists in three languages, so its three addresses are
// listed together, each naming all three, so the engines know they are one page and show the right one to each reader.

const xml = sitemapXml({ site: 'https://ssms.example', today: '2026-11-18' });
const entry = (path: string) => xml.split('</url>').find((block) => block.includes(`<loc>https://ssms.example${path}</loc>`)) ?? '';

describe('the sitemap', () => {
  it('lists the three landing page addresses', () => {
    for (const path of ['/', '/fr', '/rw']) expect(entry(path), path).not.toBe('');
  });

  it('declares the namespace the alternates need', () => {
    expect(xml).toContain('xmlns:xhtml="http://www.w3.org/1999/xhtml"');
  });

  it.each(['/', '/fr', '/rw'])('lists, for %s, every language of the landing page and x-default', (path) => {
    const block = entry(path);
    expect(block).toContain('<xhtml:link rel="alternate" hreflang="en" href="https://ssms.example/"/>');
    expect(block).toContain('<xhtml:link rel="alternate" hreflang="fr" href="https://ssms.example/fr"/>');
    expect(block).toContain('<xhtml:link rel="alternate" hreflang="rw" href="https://ssms.example/rw"/>');
    expect(block).toContain('<xhtml:link rel="alternate" hreflang="x-default" href="https://ssms.example/"/>');
  });

  it('keeps the other pages as they were, one address each and no alternates', () => {
    for (const path of ['/login', '/register', '/privacy', '/terms']) {
      expect(entry(path), path).toContain(`<loc>https://ssms.example${path}</loc>`);
      expect(entry(path), path).not.toContain('xhtml:link');
    }
  });

  it('says when each page was last changed', () => {
    expect(xml.match(/<lastmod>2026-11-18<\/lastmod>/g)).toHaveLength(7);
  });

  it('never lists the English page as /en', () => {
    expect(xml).not.toContain('/en<');
  });
});
