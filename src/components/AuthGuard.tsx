'use client';

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase-client";

export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createSupabaseBrowserClient();

  useEffect(() => {
    async function checkAuth() {
      // Exclude login and auth paths
      if (pathname === '/login' || pathname.startsWith('/auth/')) {
        return;
      }

      console.log('--- GLOBAL AUTH GUARD CHECK ---');
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        console.log('No user detected in Guard -> Forced redirect to /login');
        router.push('/login');
      }
    }
    checkAuth();
  }, [pathname, router, supabase]);

  return <>{children}</>;
}
