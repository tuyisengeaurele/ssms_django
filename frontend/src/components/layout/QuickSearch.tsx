import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { farmService } from '../../services/farm.service';
import type { Farm } from '../../types';
import { searchItems, type SearchItem } from '../../utils/quickSearch';
import { Icon } from '../ui/Icon';
import { getNavGroups } from './Sidebar';

interface QuickSearchProps {
  open: boolean;
  onClose: () => void;
}

/** The pages the signed in person can open: the menu, their profile, and a new farm for those who may add one. */
function pageItems(role: string | undefined, t: (key: string) => string): SearchItem[] {
  const seen = new Set<string>();
  const items: SearchItem[] = [];
  const add = (to: string, label: string) => {
    if (seen.has(to)) return;
    seen.add(to);
    items.push({ id: `page:${to}`, kind: 'page', label, to });
  };
  for (const group of getNavGroups(role as Parameters<typeof getNavGroups>[0], 0, t)) {
    for (const item of group.items) add(item.to, item.label);
  }
  if (role === 'FARMER' || role === 'ADMIN') add('/farms/new', t('ptFarmNew'));
  add('/profile', t('ptProfile'));
  return items;
}

function farmItem(farm: Farm): SearchItem {
  return { id: `farm:${farm.id}`, kind: 'farm', label: farm.name, hint: farm.location, extra: farm.owner?.name, to: `/farms/${farm.id}` };
}

/**
 * Ctrl K (or Cmd K) opens a box that jumps to any page of the person's menu or to one of their farms. The farms are
 * read once, the first time the box opens, and searched on the device after that.
 */
export default function QuickSearch({ open, onClose }: QuickSearchProps) {
  const { user } = useAuth();
  const { t } = useLanguage();
  const navigate = useNavigate();
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const [farms, setFarms] = useState<Farm[]>([]);
  const farmsLoaded = useRef(false);
  const farmsLoading = useRef(false);

  // Start empty, put the cursor in the box, and give the focus back to where it was when the box closes.
  useEffect(() => {
    if (!open) return;
    setQuery('');
    setActive(0);
    const before = document.activeElement as HTMLElement | null;
    inputRef.current?.focus();
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
      before?.focus?.();
    };
  }, [open]);

  // Farms are fetched on the first opening. A failure leaves the pages working and tries again next time.
  useEffect(() => {
    if (!open || farmsLoaded.current || farmsLoading.current) return;
    farmsLoading.current = true;
    farmService.getAll()
      .then((res) => {
        setFarms(res.data.data);
        farmsLoaded.current = true;
      })
      .catch(() => {})
      .finally(() => { farmsLoading.current = false; });
  }, [open]);

  const pages = useMemo(() => pageItems(user?.role, t), [user?.role, t]);
  const results = useMemo(() => searchItems([...pages, ...farms.map(farmItem)], query), [pages, farms, query]);

  useEffect(() => {
    listRef.current?.children[active]?.scrollIntoView?.({ block: 'nearest' });
  }, [active, results]);

  if (!open) return null;

  const go = (item: SearchItem) => {
    navigate(item.to);
    onClose();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
    } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (results.length === 0) return;
      const step = event.key === 'ArrowDown' ? 1 : -1;
      setActive((index) => (index + step + results.length) % results.length);
    } else if (event.key === 'Enter') {
      // Enter that confirms a word in an input method is not a request to open the page.
      if (event.nativeEvent.isComposing) return;
      event.preventDefault();
      const chosen = results[active];
      if (chosen) go(chosen);
    } else if (event.key === 'Tab') {
      // The box has one place to type, so the focus stays there.
      event.preventDefault();
    }
  };

  const status = results.length === 0
    ? t('qsNoneStatus')
    : results.length === 1 ? t('qsOne') : t('qsMany').replace('{n}', String(results.length));

  return createPortal(
    <div className="qs-backdrop" data-testid="quick-search-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="qs-panel" role="dialog" aria-modal="true" aria-label={t('qsTitle')} onKeyDown={onKeyDown}>
        <div className="qs-field">
          <Icon name="search" size={18} />
          <input
            ref={inputRef}
            className="qs-input"
            type="text"
            role="combobox"
            aria-label={t('qsTitle')}
            aria-expanded={results.length > 0}
            aria-controls={listId}
            aria-activedescendant={results.length > 0 ? `${listId}-${active}` : undefined}
            aria-autocomplete="list"
            autoComplete="off"
            spellCheck={false}
            placeholder={t('qsPlaceholder')}
            value={query}
            onChange={(e) => { setQuery(e.target.value); setActive(0); }}
          />
        </div>

        {results.length > 0 ? (
          <ul ref={listRef} id={listId} className="qs-list" role="listbox" aria-label={t('qsTitle')}>
            {results.map((item, index) => (
              <li
                key={item.id}
                id={`${listId}-${index}`}
                role="option"
                aria-selected={index === active}
                className={`qs-item${index === active ? ' is-active' : ''}`}
                // Keeping the mouse down here would take the focus out of the box.
                onMouseDown={(e) => e.preventDefault()}
                onMouseEnter={() => setActive(index)}
                onClick={() => go(item)}
              >
                <span className="qs-main">
                  <span className="qs-label">{item.label}</span>
                  {item.hint && <span className="qs-hint">{item.hint}</span>}
                </span>
                <span className="qs-kind">{item.kind === 'farm' ? t('qsKindFarm') : t('qsKindPage')}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="qs-empty" id={listId}>{t('qsNone').replace('{q}', query.trim())}</p>
        )}

        <p className="qs-keys">{t('qsKeys')}</p>
        <p className="sr-only" role="status">{status}</p>
      </div>
    </div>,
    document.body,
  );
}
