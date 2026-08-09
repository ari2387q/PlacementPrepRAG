import React, { useEffect, useRef } from 'react';
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
          theme: 'filled_black',
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

  const handleCredentialResponse = async (response: { credential: string }) => {
    const idToken = response.credential;

    // Decode the JWT payload (base64) to get basic user info immediately
    try {
      const payloadBase64 = idToken.split('.')[1];
      const payloadJson = atob(payloadBase64.replace(/-/g, '+').replace(/_/g, '/'));
      const payload = JSON.parse(payloadJson);

      const googleUser: GoogleUser = {
        name: payload.name ?? 'User',
        email: payload.email ?? '',
        picture: payload.picture ?? '',
        token: idToken,
      };

      // Optionally verify token on backend
      try {
        const baseUrl = import.meta.env.VITE_API_URL || 'https://placementpreprag.onrender.com';
        const res = await fetch(`${baseUrl}/auth/google`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id_token: idToken }),
        });
        if (res.ok) {
          const data = await res.json();
          googleUser.name = data.name ?? googleUser.name;
          googleUser.email = data.email ?? googleUser.email;
          googleUser.picture = data.picture ?? googleUser.picture;
        }
      } catch {
        // Backend verification optional — proceed with decoded payload
      }

      onLoginSuccess(googleUser);
      onClose();
    } catch (err) {
      console.error('Failed to decode Google token', err);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[998] flex items-center justify-center p-4"
      style={{ animation: 'fadeIn 0.15s ease-out' }}
    >
      <div className="absolute inset-0 bg-black/70 backdrop-blur-md" onClick={onClose} />

      <div
        className="relative z-10 w-full max-w-sm rounded-2xl border border-themeBorder/60 bg-themeCard/95 backdrop-blur-2xl shadow-2xl flex flex-col overflow-hidden"
        style={{ animation: 'slideUp 0.2s cubic-bezier(0.16, 1, 0.3, 1)' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-themeBorder/40">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-tr from-themeAccent to-indigo-500 flex items-center justify-center">
              <Shield className="w-3.5 h-3.5 text-white" />
            </div>
            <span className="text-sm font-bold text-themeTextPrimary">
              {user ? 'Your Account' : 'Sign In'}
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-themeTextSecondary hover:text-themeTextPrimary hover:bg-themeBg/60 transition-colors"
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
                    className="w-20 h-20 rounded-full border-2 border-themeAccent/40 shadow-lg shadow-themeAccent/10"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <div className="w-20 h-20 rounded-full bg-themeAccent/20 border-2 border-themeAccent/40 flex items-center justify-center">
                    <UserIcon className="w-8 h-8 text-themeAccent" />
                  </div>
                )}
                <span className="absolute bottom-0.5 right-0.5 w-3.5 h-3.5 rounded-full bg-emerald-500 border-2 border-themeCard" />
              </div>

              <div className="text-center space-y-1">
                <p className="font-bold text-themeTextPrimary text-sm">{user.name}</p>
                <p className="flex items-center gap-1.5 text-xs text-themeTextSecondary">
                  <Mail className="w-3 h-3" /> {user.email}
                </p>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-[10px] text-emerald-400 font-semibold">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                  Signed in with Google
                </span>
              </div>

              <button
                onClick={() => { onLogout(); onClose(); }}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl border border-rose-500/30 text-rose-400 hover:bg-rose-500/10 text-xs font-semibold transition-all"
              >
                <LogOut className="w-3.5 h-3.5" />
                Sign Out
              </button>
            </>
          ) : (
            /* Login state */
            <>
              <div className="text-center space-y-1.5">
                <div className="w-12 h-12 mx-auto rounded-2xl bg-gradient-to-tr from-themeAccent/20 to-indigo-500/20 border border-themeAccent/30 flex items-center justify-center mb-3">
                  <LogIn className="w-5 h-5 text-themeAccent" />
                </div>
                <h3 className="text-sm font-bold text-themeTextPrimary m-0">Sign in to PlacementPrep AI</h3>
                <p className="text-xs text-themeTextSecondary leading-relaxed">
                  Your chat history and preferences will be saved across devices.
                </p>
              </div>

              {clientId ? (
                <div ref={googleBtnRef} className="flex justify-center" />
              ) : (
                <div className="w-full px-4 py-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-xs text-amber-300 text-center leading-relaxed">
                  ⚙️ Google OAuth is not configured yet.<br />
                  Please set <code className="font-mono text-amber-200">VITE_GOOGLE_CLIENT_ID</code> in your <code className="font-mono text-amber-200">.env.local</code> file.
                </div>
              )}

              <p className="text-[10px] text-themeTextSecondary text-center leading-relaxed">
                By signing in you agree to Google's Terms of Service.<br />
                We only store your name, email, and profile picture.
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
