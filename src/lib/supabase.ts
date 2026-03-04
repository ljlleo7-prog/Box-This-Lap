import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables');
}

// Custom storage adapter for SSO with geeksproductionstudio.com
// This allows sharing the session between the main website and this subdomain
const cookieStorage = {
  getItem: (key: string): string | null => {
    const name = `${key}=`;
    try {
      const decodedCookie = decodeURIComponent(document.cookie);
      const ca = decodedCookie.split(';');
      for (let i = 0; i < ca.length; i++) {
        let c = ca[i];
        while (c.charAt(0) === ' ') {
          c = c.substring(1);
        }
        if (c.indexOf(name) === 0) {
          return c.substring(name.length, c.length);
        }
      }
    } catch (e) {
      console.warn('Error parsing cookies:', e);
    }
    return null;
  },
  setItem: (key: string, value: string) => {
    // Save the token to document.cookie with domain=.geeksproductionstudio.com
    // We check if we are on the production domain to avoid breaking localhost
    const domain = '.geeksproductionstudio.com';
    let cookieString = `${key}=${encodeURIComponent(value)}; path=/; SameSite=Lax; Secure`;
    
    // Only set domain attribute if we are actually on that domain (or subdomain)
    if (window.location.hostname.endsWith('geeksproductionstudio.com')) {
      cookieString += `; domain=${domain}`;
    }
    
    document.cookie = cookieString;
  },
  removeItem: (key: string) => {
    const domain = '.geeksproductionstudio.com';
    let cookieString = `${key}=; Max-Age=0; path=/; SameSite=Lax; Secure`;
    
    if (window.location.hostname.endsWith('geeksproductionstudio.com')) {
      cookieString += `; domain=${domain}`;
    }
    
    document.cookie = cookieString;
  }
};

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: cookieStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
  },
});
