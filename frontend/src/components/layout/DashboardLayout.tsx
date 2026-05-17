import { useState, useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import Sidebar from './Sidebar';
import TopBar from './TopBar';
import { alertService } from '../../services/alert.service';

const pageVariants = {
  initial: { opacity: 0, y: 10 },
  enter:   { opacity: 1, y: 0, transition: { duration: 0.28, ease: 'easeOut' as const } },
  exit:    { opacity: 0, y: -6, transition: { duration: 0.15 } },
};

export default function DashboardLayout() {
  const location = useLocation();
  const [collapsed,  setCollapsed]  = useState(() => window.innerWidth < 1024);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [alertCount, setAlertCount] = useState(0);

  useEffect(() => {
    alertService.getAll(true)
      .then(r => setAlertCount(r.data.data.length))
      .catch(() => {});
  }, [location.pathname]);

  useEffect(() => { setMobileOpen(false); }, [location.pathname]);

  useEffect(() => {
    function handleResize() {
      if (window.innerWidth < 768) setCollapsed(false);
    }
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return (
    <div className="app-layout">
      <Sidebar
        collapsed={collapsed}
        mobileOpen={mobileOpen}
        onMobileClose={() => setMobileOpen(false)}
        alertCount={alertCount}
      />

      <main className={`app-main ${collapsed ? 'sidebar-collapsed' : ''}`}>
        <TopBar
          onMenuToggle={() => {
            if (window.innerWidth < 768) {
              setMobileOpen(o => !o);
            } else {
              setCollapsed(c => !c);
            }
          }}
          alertCount={alertCount}
        />

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
    </div>
  );
}
