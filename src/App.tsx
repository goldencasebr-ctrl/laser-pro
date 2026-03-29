/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import { Scissors, Layout, ChevronLeft, ChevronRight } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import ModuleRemover from './components/ModuleRemover';
import ModuleProducao from './components/ModuleProducao';

type Module = 'remover' | 'producao';

export default function App() {
  const [activeModule, setActiveModule] = useState<Module>('remover');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(max-width: 767px)');
    const syncViewport = () => setIsMobile(mediaQuery.matches);

    syncViewport();
    mediaQuery.addEventListener('change', syncViewport);
    return () => mediaQuery.removeEventListener('change', syncViewport);
  }, []);

  const sidebarWidth = isMobile ? '100%' : (sidebarCollapsed ? '64px' : '260px');
  const navCollapsed = isMobile ? false : sidebarCollapsed;

  return (
    <div className="flex h-dvh md:h-screen max-md:flex-col bg-[#0a0a0a] text-zinc-100 font-sans overflow-hidden">
      {/* Sidebar Navigation */}
      <motion.aside
        initial={false}
        animate={{ width: sidebarWidth }}
        className="flex flex-col border-b md:border-b-0 md:border-r border-white/5 bg-[#111111] z-20 shrink-0"
      >
        <div className="p-4 flex items-center justify-between border-b border-white/5">
          {!navCollapsed && (
            <motion.h1
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-lg font-bold tracking-tight bg-gradient-to-r from-emerald-400 to-cyan-400 bg-clip-text text-transparent"
            >
              ESTÚDIO LASER PRO
            </motion.h1>
          )}
          <button
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            className={`p-1.5 hover:bg-white/5 rounded-lg transition-colors ${isMobile ? 'hidden' : ''}`}
          >
            {sidebarCollapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
          </button>
        </div>

        <nav className="flex-1 p-2 flex md:flex-col gap-1 overflow-x-auto">
          <NavItem
            active={activeModule === 'remover'}
            onClick={() => setActiveModule('remover')}
            icon={<Scissors size={20} />}
            label="Removedor de Fundo"
            collapsed={navCollapsed}
          />
          <NavItem
            active={activeModule === 'producao'}
            onClick={() => setActiveModule('producao')}
            icon={<Layout size={20} />}
            label="Produção de Matrizes"
            collapsed={navCollapsed}
          />
        </nav>

        <div className="p-4 border-t border-white/5 hidden md:block">
          {!navCollapsed && (
            <div className="text-[10px] uppercase tracking-widest text-zinc-500 font-medium">
              v1.0.0 Professional
            </div>
          )}
        </div>
      </motion.aside>

      {/* Main Content Area */}
      <main className="flex-1 relative flex flex-col overflow-hidden min-h-0">
        <AnimatePresence mode="wait">
          {activeModule === 'remover' && <ModuleRemover key="remover" />}
          {activeModule === 'producao' && <ModuleProducao key="producao" />}
        </AnimatePresence>
      </main>
    </div>
  );
}

function NavItem({
  active, onClick, icon, label, collapsed,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  collapsed: boolean;
}) {
  return (
    <button
      onClick={onClick}
      title={collapsed ? label : undefined}
      className={`w-full flex items-center gap-3 p-3 rounded-xl transition-all duration-200 flex-1 md:flex-none min-w-[150px] md:min-w-0 ${
        active
          ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
          : 'text-zinc-400 hover:bg-white/5 hover:text-zinc-200'
      }`}
    >
      <div className={active ? 'text-emerald-400' : 'text-zinc-500'}>{icon}</div>
      {!collapsed && <span className="text-sm font-medium truncate">{label}</span>}
    </button>
  );
}
