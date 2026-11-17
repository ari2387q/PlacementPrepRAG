import React, { useEffect, useRef, useState } from 'react';
import { X, LogIn, LogOut, User as UserIcon, Mail, Shield } from 'lucide-react';
import type { GoogleUser } from '../hooks/useAuth';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: GoogleUser | null;
  onLoginSuccess: (user: GoogleUser) => void;
  onLogout: () => void;
}

declare global {
  interface Window {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    google?: any;
    handleGoogleCredentialResponse?: (response: { credential: string }) => void;
  }
}

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  onClose,
  user,
  onLoginSuccess,
  onLogout,
}) => {
  const googleBtnRef = useRef<HTMLDivElement>(null);
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';
  const [authError, setAuthError] = useState<string | null>(null);

  async function handleCredentialResponse(response: { credential: string }) {
    const idToken = response.credential;
    try {
      setAuthError(null);
      const baseUrl = import.meta.env.VITE_API_URL || 'https://placementpreprag.onrender.com';
      const res = await fetch(`${baseUrl}/auth/google`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id_token: idToken }),
      });
      if (!res.ok) throw new Error('Google sign-in could not be verified by the server. Check the OAuth setup and try again.');
      const data = await res.json();
      const googleUser: GoogleUser = {
        sub: data.sub,
        name: data.name ?? 'User',
        email: data.email ?? '',
        picture: data.picture ?? '',
        token: idToken,
      };
      if (!googleUser.sub || !googleUser.email) throw new Error('Google returned an incomplete account profile.');
      onLoginSuccess(googleUser);
      onClose();
    } catch (err) {
      console.error('Google sign-in verification failed', err);
      setAuthError(err instanceof Error ? err.message : 'Google sign-in failed. Please try again.');
    }
  }

  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, onClose]);

  // Initialize Google Sign-In button when modal opens and user is not logged in
  useEffect(() => {
    if (!isOpen || user || !clientId) return;

    const init = () => {
      if (!window.google?.accounts?.id) return;
      window.google.accounts.id.initialize({
        client_id: clientId,
        callback: handleCredentialResponse,
        auto_select: false,
        cancel_on_tap_outside: false,
      });

      if (googleBtnRef.current) {
        window.google.accounts.id.renderButton(googleBtnRef.current, {
          type: 'standard',
          shape: 'pill',
          theme: 'outline',
          size: 'large',
          text: 'signin_with',
          logo_alignment: 'left',
          width: 280,
        });
      }
    };

    // GIS may not be loaded yet – wait for it
    if (window.google?.accounts?.id) {
      init();
    } else {
      const interval = setInterval(() => {
        if (window.google?.accounts?.id) {
          clearInterval(interval);
          init();
        }
      }, 200);
      return () => clearInterval(interval);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, user, clientId]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[998] flex items-center justify-center p-4"
      style={{ animation: 'fadeIn 0.15s ease-out' }}
    >
      <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={onClose} />

      <div
        className="relative z-10 w-full max-w-sm rounded-3xl border border-slate-200 bg-white shadow-2xl flex flex-col overflow-hidden"
        style={{ animation: 'slideUp 0.2s cubic-bezier(0.16, 1, 0.3, 1)' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/80">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-themeAccent/15 border border-themeAccent/30 flex items-center justify-center text-themeAccent font-bold">
              <Shield className="w-4 h-4" />
            </div>
            <span className="text-sm font-bold text-slate-900">
              {user ? 'Your Account' : 'Sign In'}
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-6 flex flex-col items-center gap-5">
          {user ? (
            /* Logged-in state */
            <>
              {/* Avatar */}
              <div className="relative">
                {user.picture ? (
                  <img
                    src={user.picture}
                    alt={user.name}
                    className="w-20 h-20 rounded-full border-2 border-themeAccent shadow-md"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <div className="w-20 h-20 rounded-full bg-themeAccent/20 border-2 border-themeAccent/40 flex items-center justify-center text-themeAccent">
                    <UserIcon className="w-8 h-8" />
                  </div>
                )}
                <span className="absolute bottom-0.5 right-0.5 w-4 h-4 rounded-full bg-emerald-500 border-2 border-white" />
              </div>

              <div className="text-center space-y-1">
                <p className="font-bold text-slate-900 text-sm">{user.name}</p>
                <p className="flex items-center justify-center gap-1.5 text-xs text-slate-600">
                  <Mail className="w-3.5 h-3.5" /> {user.email}
                </p>
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-[11px] text-emerald-800 font-bold mt-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-600" />
                  Signed in with Google
                </span>
              </div>

              <button
                onClick={() => { onLogout(); onClose(); }}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100 text-xs font-semibold transition-all shadow-2xs"
              >
                <LogOut className="w-3.5 h-3.5" />
                Sign Out
              </button>
            </>
          ) : (
            /* Login state */
            <>
              <div className="text-center space-y-1.5">
                <div className="w-12 h-12 mx-auto rounded-2xl bg-themeAccent/15 border border-themeAccent/30 flex items-center justify-center mb-3 text-themeAccent">
                  <LogIn className="w-6 h-6" />
                </div>
                <h3 className="text-sm font-bold text-slate-900 m-0">Sign in to Placement-Prep</h3>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Your chat history and preparation progress will sync securely across your devices.
                </p>
              </div>

              {clientId ? (
                <div ref={googleBtnRef} className="flex justify-center" />
              ) : (
                <div className="w-full px-4 py-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900 text-center leading-relaxed font-medium">
                  ⚙️ Google OAuth is not configured yet.<br />
                  Please set <code className="font-mono text-amber-950 font-bold">VITE_GOOGLE_CLIENT_ID</code> in your <code className="font-mono text-amber-950 font-bold">.env.local</code> file.
                </div>
              )}

              {authError && (
                <div role="alert" className="w-full px-4 py-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-800 text-center font-semibold">
                  {authError}
                </div>
              )}

              <p className="text-[11px] text-slate-500 text-center leading-relaxed">
                By signing in you agree to Google's Terms of Service.<br />
                We only store your name, email, and avatar.
              </p>
            </>
          )}
        </div>
      </div>

      <style>{`
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(16px) scale(0.97); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>
    </div>
  );
};
