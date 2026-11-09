import { useState, useCallback } from 'react';

export interface GoogleUser {
  sub: string;
  name: string;
  email: string;
  picture: string;
  token: string; // Google ID token (credential)
}

const STORAGE_KEY = 'placement_prep_user_session';

function getStoredUser(): GoogleUser | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const user = JSON.parse(raw) as GoogleUser;
    if (!user.token) return null;

    // Check JWT expiry
    const payloadPart = user.token.split('.')[1];
    if (payloadPart) {
      // Handle base64url decoding
      const base64 = payloadPart.replace(/-/g, '+').replace(/_/g, '/');
      const payload = JSON.parse(decodeURIComponent(escape(atob(base64))));
      if (payload.exp && Date.now() >= payload.exp * 1000) {
        // Token has expired
        localStorage.removeItem(STORAGE_KEY);
        return null;
      }
    }
    return user;
  } catch {
    localStorage.removeItem(STORAGE_KEY);
    return null;
  }
}

export function useAuth() {
  const [user, setUser] = useState<GoogleUser | null>(() => getStoredUser());

  const login = useCallback((googleUser: GoogleUser) => {
    setUser(googleUser);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(googleUser));
    } catch (err) {
      console.warn('Failed to persist user session', err);
    }
  }, []);

  const logout = useCallback(() => {
    setUser(null);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (err) {
      console.warn('Failed to remove user session', err);
    }
    // Revoke the Google session if GIS is available
    const google = (window as Window & {
      google?: { accounts?: { id?: { disableAutoSelect?: () => void } } };
    }).google;
    if (google?.accounts?.id?.disableAutoSelect) {
      google.accounts.id.disableAutoSelect();
    }
  }, []);

  return { user, login, logout };
}
