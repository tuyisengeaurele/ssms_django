import { NavLink } from 'react-router-dom';

export interface TabItem {
  to: string;
  label: string;
  /** Open only on exactly this address, for the first tab whose address is the start of the others. */
  end?: boolean;
}

interface Props {
  /** What the row of tabs is, for people who cannot see it. */
  label: string;
  items: TabItem[];
}

/** A row of tabs under a page title. Each tab is a page of its own, so each is a link and the open one is marked. */
export default function TabNav({ label, items }: Props) {
  return (
    <nav className="tab-nav" aria-label={label}>
      <ul>
        {items.map((item) => (
          <li key={item.to}>
            <NavLink to={item.to} end={item.end} className={({ isActive }) => `tab-link${isActive ? ' is-on' : ''}`}>
              {item.label}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
