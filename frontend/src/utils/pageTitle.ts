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
  [/^\/admin\/cooperatives\/[^/]+(\/(farms|members|details))?$/, { titleKey: 'ptCooperative', sectionKey: ADMIN }],
  [/^\/admin\/contacts$/, { titleKey: 'ptMessages', sectionKey: ADMIN }],
  [/^\/admin\/system(\/(health|logs|activity))?$/, { titleKey: 'ptSystem', sectionKey: ADMIN }],
  [/^\/farmer$/, { titleKey: 'ptFarmer', sectionKey: FARMING }],
  [/^\/supervisor$/, { titleKey: 'ptSupervisor', sectionKey: FARMING }],
  [/^\/decisions$/, { titleKey: 'ptDecisions', sectionKey: FARMING }],
  [/^\/supply(\/[^/]+)?$/, { titleKey: 'ptSupply', sectionKey: FARMING }],
  [/^\/supply\/lots\/[^/]+$/, { titleKey: 'trcLotWord', sectionKey: FARMING }],
  [/^\/supervisor\/cooperative(\/(farms|farmers))?$/, { titleKey: 'ptMyCooperative', sectionKey: FARMING }],
  [/^\/farms$/, { titleKey: 'ptFarms', sectionKey: FARMING }],
  [/^\/farms\/new$/, { titleKey: 'ptFarmNew', sectionKey: FARMING }],
  [/^\/farms\/[^/]+\/batches\/new$/, { titleKey: 'ptBatchNew', sectionKey: FARMING }],
  [/^\/farms\/[^/]+$/, { titleKey: 'ptFarmDetail', sectionKey: FARMING }],
  [/^\/batches$/, { titleKey: 'ptBatches', sectionKey: FARMING }],
  [/^\/batches\/compare$/, { titleKey: 'ptCompare', sectionKey: FARMING }],
  [/^\/batches\/[^/]+\/detect$/, { titleKey: 'ptDetect', sectionKey: FARMING }],
  [/^\/batches\/[^/]+\/harvest$/, { titleKey: 'ptHarvest', sectionKey: FARMING }],
  [/^\/batches\/[^/]+\/report$/, { titleKey: 'ptBatchReport', sectionKey: FARMING }],
  [/^\/batches\/[^/]+$/, { titleKey: 'ptBatchDetail', sectionKey: FARMING }],
  [/^\/harvests$/, { titleKey: 'ptHarvests', sectionKey: FARMING }],
  [/^\/detections\/reports$/, { titleKey: 'ptDetectionReports', sectionKey: MONITORING }],
  [/^\/alerts$/, { titleKey: 'ptAlerts', sectionKey: MONITORING }],
  [/^\/devices$/, { titleKey: 'ptDevices', sectionKey: MONITORING }],
  [/^\/settings\/(account|security|appearance|safe-ranges)$/, { titleKey: 'ptSettings', sectionKey: ACCOUNT }],
];

export function getPageInfo(pathname: string, role?: string): PageInfo {
  const path = pathname.split('?')[0].replace(/\/+$/, '') || '/';
  // The supervisor's landing page is also the admin's view of every farm, so it has another name there.
  if (path === '/supervisor' && role === 'ADMIN') return { titleKey: 'ptFarmMonitoring', sectionKey: FARMING };
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
export function usePageTitle(role?: string): { title: string; section: string } {
  const { pathname } = useLocation();
  const { t } = useLanguage();
  const info = getPageInfo(pathname, role);
  const title = t(info.titleKey);
  useDocumentTitle(title);
  return { title, section: t(info.sectionKey) };
}
