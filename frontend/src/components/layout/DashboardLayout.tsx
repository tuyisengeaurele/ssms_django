import '@fontsource-variable/fraunces/wght.css';
import '@fontsource-variable/geist';
import '../../styles/shell.css';
import '../../styles/components.css';
import { useState, useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import Sidebar from './Sidebar';
import TopBar from './TopBar';
import BottomNav from './BottomNav';
import { alertService } from '../../services/alert.service';

const pageVariants = {
  initial: { opacity: 0, y: 10 },
  enter:   { opacity: 1, y: 0, transition: { duration: 0.28, ease: 'easeOut' as const } },
  exit:    { opacity: 0, y: -6, transition: { duration: 0.15 } },
};

const NAV_KEY = 'ssms_nav';
// Screens this wide have room for the labels, so the menu starts open there.
const WIDE_SCREEN = 1600;

/** The menu is a narrow icon rail unless the person opened it. What they chose is remembered. */
function startsAsRail(): boolean {
  try {
    const saved = localStorage.getItem(NAV_KEY);
    if (saved === 'open') return false;
    if (saved === 'rail') return true;
  } catch {
    // Storage can be blocked. The default below still works.
  }
  return window.innerWidth < WIDE_SCREEN;
}

export default function DashboardLayout() {
  const location = useLocation();
  const [rail, setRail] = useState(startsAsRail);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [alertCount, setAlertCount] = useState(0);

  useEffect(() => {
    alertService.getAll(true)
      .then(r => setAlertCount(r.data.data.length))
      .catch(() => {});
  }, [location.pathname]);

  useEffect(() => { setMobileOpen(false); }, [location.pathname]);

  const toggleMenu = () => {
    if (window.innerWidth < 768) {
      setMobileOpen((o) => !o);
      return;
    }
    const next = !rail;
    setRail(next);
    try {
      localStorage.setItem(NAV_KEY, next ? 'rail' : 'open');
    } catch {
      // Not remembering the choice is fine.
    }
  };

  return (
    <div className="app-layout">
      <Sidebar
        collapsed={rail}
        mobileOpen={mobileOpen}
        onMobileClose={() => setMobileOpen(false)}
        alertCount={alertCount}
      />

      <main className={`app-main ${rail ? 'sidebar-collapsed' : ''}`}>
        <TopBar onMenuToggle={toggleMenu} alertCount={alertCount} />

        <AnimatePresence mode="wait">
          <motion.div
            key={location.pathname}
            className="app-content"
            variants={pageVariants}
            initial="initial"
            animate="enter"
            exit="exit"
          >
            <Outlet />
          </motion.div>
        </AnimatePresence>
      </main>

      <BottomNav alertCount={alertCount} onMore={() => setMobileOpen(true)} />
    </div>
  );
}
