import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useLanguage } from '../context/LanguageContext';
import type { PageKey } from '../i18n/pages';

export interface PageInfo {
  titleKey: PageKey;
  sectionKey: PageKey;
}

const ADMIN = 'ptSectionAdmin';
const FARMING = 'ptSectionFarming';
const MONITORING = 'ptSectionMonitoring';
const ACCOUNT = 'ptSectionAccount';

/** First match wins, so the longer paths come before the shorter ones. */
const ROUTES: Array<[RegExp, PageInfo]> = [
  [/^\/admin$/, { titleKey: 'ptAdmin', sectionKey: ADMIN }],
  [/^\/admin\/users$/, { titleKey: 'ptUsers', sectionKey: ADMIN }],
  [/^\/admin\/cooperatives$/, { titleKey: 'ptCooperatives', sectionKey: ADMIN }],
  [/^\/admin\/contacts$/, { titleKey: 'ptMessages', sectionKey: ADMIN }],
  [/^\/admin\/audit-log$/, { titleKey: 'ptAudit', sectionKey: ADMIN }],
  [/^\/admin\/reports$/, { titleKey: 'ptSystemReport', sectionKey: ADMIN }],
  [/^\/farmer$/, { titleKey: 'ptFarmer', sectionKey: FARMING }],
  [/^\/supervisor$/, { titleKey: 'ptSupervisor', sectionKey: FARMING }],
  [/^\/farms$/, { titleKey: 'ptFarms', sectionKey: FARMING }],
  [/^\/farms\/new$/, { titleKey: 'ptFarmNew', sectionKey: FARMING }],
  [/^\/farms\/[^/]+\/batches\/new$/, { titleKey: 'ptBatchNew', sectionKey: FARMING }],
  [/^\/farms\/[^/]+$/, { titleKey: 'ptFarmDetail', sectionKey: FARMING }],
  [/^\/batches$/, { titleKey: 'ptBatches', sectionKey: FARMING }],
  [/^\/batches\/[^/]+\/detect$/, { titleKey: 'ptDetect', sectionKey: FARMING }],
  [/^\/batches\/[^/]+\/harvest$/, { titleKey: 'ptHarvest', sectionKey: FARMING }],
  [/^\/batches\/[^/]+$/, { titleKey: 'ptBatchDetail', sectionKey: FARMING }],
  [/^\/harvests$/, { titleKey: 'ptHarvests', sectionKey: FARMING }],
  [/^\/detections\/reports$/, { titleKey: 'ptDetectionReports', sectionKey: MONITORING }],
  [/^\/alerts$/, { titleKey: 'ptAlerts', sectionKey: MONITORING }],
  [/^\/devices$/, { titleKey: 'ptDevices', sectionKey: MONITORING }],
  [/^\/profile$/, { titleKey: 'ptProfile', sectionKey: ACCOUNT }],
];

export function getPageInfo(pathname: string): PageInfo {
  const path = pathname.split('?')[0].replace(/\/+$/, '') || '/';
  for (const [pattern, info] of ROUTES) {
    if (pattern.test(path)) return info;
  }
  return { titleKey: 'ptDefault', sectionKey: ACCOUNT };
}

export function formatDocumentTitle(title: string): string {
  return `${title} | SSMS`;
}

/** Sets the browser tab title while the page is open, then puts the old one back. */
export function useDocumentTitle(title: string) {
  useEffect(() => {
    const previous = document.title;
    document.title = formatDocumentTitle(title);
    return () => {
      document.title = previous;
    };
  }, [title]);
}

/** The title and section of the current route, in the current language. Also sets the tab title. */
export function usePageTitle(): { title: string; section: string } {
  const { pathname } = useLocation();
  const { t } = useLanguage();
  const info = getPageInfo(pathname);
  const title = t(info.titleKey);
  useDocumentTitle(title);
  return { title, section: t(info.sectionKey) };
}
