// The sitemap: the addresses search engines should know. The landing page exists in three languages and its three addresses are
// listed together, each naming all three, so the engines treat them as one page and show the right one to each reader.

const LANDING = [
  ['en', '/'],
  ['fr', '/fr'],
  ['rw', '/rw'],
];
const OTHER = ['/login', '/register', '/privacy', '/terms'];

export function sitemapXml({ site, today }) {
  const alternates = [
    ...LANDING.map(([language, path]) => `<xhtml:link rel="alternate" hreflang="${language}" href="${site}${path}"/>`),
    `<xhtml:link rel="alternate" hreflang="x-default" href="${site}/"/>`,
  ].join('');
  const urls = [
    ...LANDING.map(([, path]) => `  <url><loc>${site}${path}</loc><lastmod>${today}</lastmod>${alternates}</url>`),
    ...OTHER.map((path) => `  <url><loc>${site}${path}</loc><lastmod>${today}</lastmod></url>`),
  ];
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${urls.join('\n')}
</urlset>
`;
}
