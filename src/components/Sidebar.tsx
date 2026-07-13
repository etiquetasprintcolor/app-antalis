'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import {
    Calculator,
    ClipboardList,
    BarChart3,
    ChevronLeft,
    ChevronRight,
    Printer,
    Clock,
    DollarSign,
    FileText,
    LogOut,
    AlertTriangle,
} from 'lucide-react';
import { createSupabaseBrowserClient } from '@/lib/supabase-client';
import { useRouter } from 'next/navigation';

const navItems = [
    { href: '/calculadora', label: 'Calculadora', icon: Calculator },
    { href: '/pendientes', label: 'Pendientes', icon: Clock },
    { href: '/historial', label: 'Historial', icon: ClipboardList },
    { href: '/precios', label: 'Precios', icon: DollarSign },
    { href: '/incidencias', label: 'Incidencias', icon: AlertTriangle },
    { href: '/dashboard', label: 'Dashboard', icon: BarChart3 },
    { href: '/analisis', label: 'Análisis', icon: FileText },
];

export default function Sidebar() {
    const pathname = usePathname();
    const router = useRouter();
    const [collapsed, setCollapsed] = useState(false);
    const supabase = createSupabaseBrowserClient();

    const handleSignOut = async () => {
        await supabase.auth.signOut();
        router.push('/login');
        router.refresh();
    };

    return (
        <aside
            className={`
        fixed top-0 left-0 h-full z-40 flex flex-col
        bg-[var(--surface)] border-r border-[var(--border-color)]
        transition-sidebar
        ${collapsed ? 'w-[60px]' : 'w-[260px]'}
      `}
        >
            {/* Logo / Brand */}
            <div className="flex items-center gap-3 px-4 h-14 border-b border-[var(--border-color)]">
                <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-[var(--accent)] text-white flex-shrink-0">
                    <Printer size={18} />
                </div>
                {!collapsed && (
                    <span className="text-sm font-semibold text-[var(--foreground)] truncate">
                        Printcolor
                    </span>
                )}
            </div>

            {/* Navigation */}
            <nav className="flex-1 py-3 px-2 space-y-0.5">
                {navItems.map(({ href, label, icon: Icon }) => {
                    const isActive = pathname === href || pathname.startsWith(href + '/');
                    return (
                        <Link
                            key={href}
                            href={href}
                            className={`
                flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium
                transition-colors duration-150 no-underline
                ${isActive
                                    ? 'bg-[var(--accent)] text-white'
                                    : 'text-[var(--foreground)] hover:bg-[var(--surface-hover)]'
                                }
                ${collapsed ? 'justify-center px-0' : ''}
              `}
                            title={collapsed ? label : undefined}
                        >
                            <Icon size={18} className="flex-shrink-0" />
                            {!collapsed && <span>{label}</span>}
                        </Link>
                    );
                })}
            </nav>

            {/* Logout Button */}
            <button
                onClick={handleSignOut}
                className={`
                    flex items-center gap-3 px-3 py-2 mx-2 mb-1 rounded-lg text-sm font-medium
                    text-red-600 hover:bg-red-50 transition-colors duration-150 border-0 cursor-pointer bg-transparent
                    ${collapsed ? 'justify-center px-0' : ''}
                `}
                title={collapsed ? 'Cerrar sesión' : undefined}
            >
                <LogOut size={18} className="flex-shrink-0" />
                {!collapsed && <span>Cerrar sesión</span>}
            </button>

            {/* Collapse Toggle */}
            <button
                onClick={() => setCollapsed(!collapsed)}
                className={`
          flex items-center justify-center h-10 mx-2 mb-3 rounded-lg
          text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--surface-hover)]
          transition-colors duration-150 border-0 cursor-pointer bg-transparent
        `}
                title={collapsed ? 'Expandir menú' : 'Colapsar menú'}
            >
                {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
                {!collapsed && <span className="ml-2 text-xs">Colapsar</span>}
            </button>
        </aside>
    );
}
