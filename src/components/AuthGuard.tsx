'use client';

import { useState, useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase-client";

export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(true);
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createSupabaseBrowserClient();

  useEffect(() => {
    async function checkAuth() {
      // Exclude login and auth paths
      if (pathname === '/login' || pathname.startsWith('/auth/')) {
        setLoading(false);
        return;
      }

      console.log('--- GLOBAL AUTH GUARD CHECK ---');
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        console.log('No user detected in Guard -> Forced redirect to /login');
        router.push('/login');
      } else {
        setLoading(false);
      }
    }
    checkAuth();
  }, [pathname, router, supabase]);

  // Prevent flash of content
  if (loading && pathname !== '/login' && !pathname.startsWith('/auth/')) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-[var(--accent)] border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  return <>{children}</>;
}
