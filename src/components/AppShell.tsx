'use client';

import { useState, useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import Sidebar from '@/components/Sidebar';
import { createSupabaseBrowserClient } from '@/lib/supabase-client';

export default function AppShell({ children }: { children: React.ReactNode }) {
    const [collapsed, setCollapsed] = useState(false);
    const pathname = usePathname();
    const router = useRouter();
    const supabase = createSupabaseBrowserClient();

    // Client-side security check (Backup for Middleware/Layout)
    useEffect(() => {
        const checkAuth = async () => {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) {
                router.push('/login');
            }
        };
        checkAuth();
    }, [router, supabase]);

    // Listen for sidebar collapse state changes
    useEffect(() => {
        const observer = new MutationObserver(() => {
            const aside = document.querySelector('aside');
            if (aside) {
                setCollapsed(aside.classList.contains('w-[60px]'));
            }
        });

        const aside = document.querySelector('aside');
        if (aside) {
            observer.observe(aside, { attributes: true, attributeFilter: ['class'] });
        }

        return () => observer.disconnect();
    }, []);

    return (
        <div className="flex min-h-screen">
            <Sidebar />
            <main
                className="flex-1 transition-sidebar bg-[var(--background)]"
                style={{ marginLeft: collapsed ? '60px' : '260px' }}
            >
                <div className="max-w-6xl mx-auto px-8 py-8">
                    <AnimatePresence mode="wait">
                        <motion.div
                            key={pathname}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -10 }}
                            transition={{ duration: 0.3, ease: 'easeOut' }}
                        >
                            {children}
                        </motion.div>
                    </AnimatePresence>
                </div>
            </main>
        </div>
    );
}
