import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

// Public paths that don't require authentication
const PUBLIC_PATHS = ['/login'];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow public paths through immediately
  if (PUBLIC_PATHS.some(p => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  let response = NextResponse.next({
    request: { headers: request.headers },
  });

  // NOTE: This client is self-contained and does NOT import from @/lib/supabase
  // because next/headers is NOT compatible with the Edge Runtime used by middleware.
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          request.cookies.set({ name, value, ...options });
          response = NextResponse.next({ request: { headers: request.headers } });
          response.cookies.set({ name, value, ...options });
        },
        remove(name: string, options: CookieOptions) {
          request.cookies.set({ name, value: '', ...options });
          response = NextResponse.next({ request: { headers: request.headers } });
          response.cookies.set({ name, value: '', ...options });
        },
      },
    }
  );

  // getUser() verifies the JWT with Supabase — this is the secure check
  const { data: { user }, error } = await supabase.auth.getUser();

  // If no valid session, force redirect to login
  if (error || !user) {
    const loginUrl = new URL('/login', request.url);
    return NextResponse.redirect(loginUrl);
  }

  // User is authenticated — allow through
  return response;
}

export const config = {
  matcher: [
    /*
     * Match ALL paths EXCEPT:
     * - _next/static (Next.js static files)
     * - _next/image (image optimization)
     * - favicon.ico
     * - /login (login page itself)
     */
    '/((?!_next/static|_next/image|favicon.ico|login).*)',
  ],
};
