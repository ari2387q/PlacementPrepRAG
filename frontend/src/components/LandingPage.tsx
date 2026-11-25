import { useEffect, useRef, useState } from 'react';
import { AuthModal } from './AuthModal';
import type { GoogleUser } from '../hooks/useAuth';

interface LandingPageProps {
  onEnter: () => void;
  onLogin: (user: GoogleUser) => void;
}

const FEATURES = [
  {
    icon: '🧠',
    title: 'RAG-Powered Q&A',
    desc: 'Ask anything on DSA, OS, DBMS, System Design — grounded in your own uploaded docs.',
  },
  {
    icon: '📄',
    title: 'Document Intelligence',
    desc: 'Upload PDFs or notes and instantly generate quizzes and flashcards from them.',
  },
  {
    icon: '⚡',
    title: 'Quiz & Flashcards',
    desc: 'Reinforce concepts with AI-generated MCQs and spaced-repetition flashcards.',
  },
  {
    icon: '🔗',
    title: 'GitHub Integration',
    desc: 'Connect your GitHub to track repos and get coding interview context from your projects.',
  },
];

const TOPICS = ['DSA', 'System Design', 'OS', 'DBMS', 'OOPs', 'CN', 'Behavioural', 'SQL'];

export function LandingPage({ onEnter, onLogin }: LandingPageProps) {
  const [authOpen, setAuthOpen] = useState(false);
  const [visible, setVisible] = useState(false);
  const heroRef = useRef<HTMLDivElement>(null);
  const featuresRef = useRef<HTMLDivElement>(null);
  const [featuresVisible, setFeaturesVisible] = useState(false);

  useEffect(() => {
    // Trigger hero fade-in
    const t = setTimeout(() => setVisible(true), 80);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    const el = featuresRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setFeaturesVisible(true); },
      { threshold: 0.15 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  function handleLogin(user: GoogleUser) {
    onLogin(user);
    setAuthOpen(false);
  }

  return (
    <div className="min-h-screen bg-white text-gray-900 overflow-x-hidden font-sans">

      {/* ── Navbar ── */}
      <nav className="fixed top-0 inset-x-0 z-50 flex items-center justify-between px-6 md:px-12 py-4 bg-white/80 backdrop-blur border-b border-gray-100">
        <span className="text-lg font-bold tracking-tight text-rose-500">PlacementPrep<span className="text-gray-900">AI</span></span>
        <div className="flex gap-3">
          <button
            onClick={() => setAuthOpen(true)}
            className="text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors px-3 py-1.5"
          >
            Sign in
          </button>
          <button
            onClick={onEnter}
            className="text-sm font-semibold bg-rose-500 hover:bg-rose-600 text-white px-4 py-1.5 rounded-full transition-all duration-200 shadow-sm hover:shadow-md"
          >
            Try it free
          </button>
        </div>
      </nav>

      {/* ── Hero ── */}
      <section
        ref={heroRef}
        className={`relative flex flex-col items-center justify-center min-h-screen px-6 pt-20 pb-16 text-center transition-all duration-700 ease-out ${
          visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'
        }`}
      >
        {/* Background blobs */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute -top-32 -left-32 w-[480px] h-[480px] bg-rose-100 rounded-full blur-3xl opacity-50 animate-[blob_8s_ease-in-out_infinite]" />
          <div className="absolute top-20 -right-20 w-[380px] h-[380px] bg-orange-100 rounded-full blur-3xl opacity-40 animate-[blob_10s_ease-in-out_infinite_2s]" />
          <div className="absolute bottom-10 left-1/3 w-[300px] h-[300px] bg-pink-100 rounded-full blur-3xl opacity-30 animate-[blob_12s_ease-in-out_infinite_4s]" />
        </div>

        <div className="relative z-10 max-w-3xl mx-auto">
          <span className="inline-block text-xs font-semibold tracking-widest text-rose-500 uppercase mb-5 px-3 py-1 bg-rose-50 rounded-full border border-rose-100">
            AI-Powered · RAG · Free
          </span>

          <h1 className="text-5xl md:text-6xl font-extrabold leading-tight text-gray-900 mb-6">
            Crack placements<br />
            <span className="text-rose-500">smarter, faster.</span>
          </h1>

          <p className="text-lg md:text-xl text-gray-500 leading-relaxed mb-10 max-w-2xl mx-auto">
            Your AI prep buddy for DSA, System Design, OS, DBMS and more — with document uploads, quizzes, and flashcards. All in one place.
          </p>

          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <button
              onClick={onEnter}
              className="px-8 py-3.5 bg-rose-500 hover:bg-rose-600 text-white font-semibold rounded-full text-base shadow-md hover:shadow-lg transition-all duration-200 hover:-translate-y-0.5"
            >
              Start for free →
            </button>
            <button
              onClick={() => setAuthOpen(true)}
              className="px-8 py-3.5 border border-gray-200 hover:border-gray-300 text-gray-700 font-semibold rounded-full text-base transition-all duration-200 hover:-translate-y-0.5 hover:shadow-sm"
            >
              Sign in with Google
            </button>
          </div>

          {/* Topic pills */}
          <div className="mt-12 flex flex-wrap justify-center gap-2">
            {TOPICS.map((t, i) => (
              <span
                key={t}
                style={{ animationDelay: `${i * 80}ms` }}
                className="text-xs font-medium px-3 py-1 bg-gray-50 border border-gray-100 text-gray-500 rounded-full animate-[fadeUp_0.5s_ease-out_forwards] opacity-0"
              >
                {t}
              </span>
            ))}
          </div>
        </div>

        {/* Scroll cue */}
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1 text-gray-300 animate-bounce">
          <div className="w-5 h-8 rounded-full border-2 border-gray-200 flex items-start justify-center pt-1.5">
            <div className="w-1 h-2 bg-gray-300 rounded-full" />
          </div>
        </div>
      </section>

      {/* ── Features ── */}
      <section ref={featuresRef} className="py-24 px-6 bg-gray-50">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-3xl md:text-4xl font-bold text-center text-gray-900 mb-4">
            Everything you need to prep
          </h2>
          <p className="text-center text-gray-400 mb-16 text-base">No fluff. Just what gets you placed.</p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            {FEATURES.map((f, i) => (
              <div
                key={f.title}
                style={{ transitionDelay: `${i * 100}ms` }}
                className={`bg-white rounded-2xl p-6 border border-gray-100 shadow-sm hover:shadow-md transition-all duration-500 hover:-translate-y-1 ${
                  featuresVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
                }`}
              >
                <span className="text-3xl mb-4 block">{f.icon}</span>
                <h3 className="text-base font-semibold text-gray-900 mb-1">{f.title}</h3>
                <p className="text-sm text-gray-400 leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="py-24 px-6 text-center">
        <div className="max-w-xl mx-auto">
          <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">Ready to start?</h2>
          <p className="text-gray-400 mb-8">Free forever for core features. No credit card.</p>
          <button
            onClick={onEnter}
            className="px-10 py-4 bg-rose-500 hover:bg-rose-600 text-white font-semibold rounded-full text-base shadow-md hover:shadow-lg transition-all duration-200 hover:-translate-y-0.5"
          >
            Open the app →
          </button>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="border-t border-gray-100 py-6 text-center text-xs text-gray-300">
        PlacementPrepAI · Built with ❤️ for placement season
      </footer>

      {authOpen && (
        <AuthModal
          isOpen={authOpen}
          onClose={() => setAuthOpen(false)}
          user={null}
          onLoginSuccess={handleLogin}
          onLogout={() => setAuthOpen(false)}
        />
      )}

      <style>{`
        @keyframes blob {
          0%, 100% { transform: translate(0, 0) scale(1); }
          33% { transform: translate(20px, -20px) scale(1.05); }
          66% { transform: translate(-10px, 10px) scale(0.97); }
        }
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(10px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
