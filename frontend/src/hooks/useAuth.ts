import { useState, useCallback } from 'react';

export interface GoogleUser {
  name: string;
  email: string;
  picture: string;
  token: string; // Google ID token (credential)
}

const STORAGE_KEY = 'placement_prep_google_user';

function loadUser(): GoogleUser | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as GoogleUser;
  } catch {
    return null;
  }
}

export function useAuth() {
  const [user, setUser] = useState<GoogleUser | null>(loadUser);

  const login = useCallback((googleUser: GoogleUser) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(googleUser));
    setUser(googleUser);
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setUser(null);
    // Revoke the Google session if GIS is available
    if (typeof window !== 'undefined' && (window as any).google?.accounts?.id) {
      (window as any).google.accounts.id.disableAutoSelect();
    }
  }, []);

  return { user, login, logout };
}
