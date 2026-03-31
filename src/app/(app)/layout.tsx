import AppShell from '@/components/AppShell';
import { createSupabaseServerClient, WHITELIST } from '@/lib/supabase';
import { redirect } from 'next/navigation';

export default async function AppLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    console.log('--- SECURITY CHECK IN AppLayout ---');
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();

    console.log('User detected in layout:', user ? user.email : 'NONE');

    if (!user) {
        console.log('NO USER -> REDIRECTING TO /login');
        redirect('/login');
    }

    if (!WHITELIST.includes(user.email || '')) {
        console.log('USER NOT IN WHITELIST -> SIGN OUT AND REDIRECT');
        await supabase.auth.signOut();
        redirect('/login?error=unauthorized');
    }

    return <AppShell>{children}</AppShell>;
}
