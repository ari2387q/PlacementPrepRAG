import { useEffect, useMemo, useState } from 'react';
import {
  ArrowUpRight,
  Bell,
  Calendar,
  CheckCircle2,
  Code2,
  ExternalLink,
  FileText,
  Flame,
  GitBranch,
  Globe,
  LayoutDashboard,
  LogOut,
  MessageSquare,
  Minus,
  Plus,
  RefreshCw,
  Save,
  Settings,
  Sparkles,
  Trash2,
  Trophy,
  Upload,
  AlertTriangle
} from 'lucide-react';
import type { GoogleUser } from '../hooks/useAuth';
import { AuthModal } from './AuthModal';
import { triggerCelebration } from '../utils/confetti';

const API = import.meta.env.VITE_API_URL || 'https://placementpreprag.onrender.com';

export type DashboardSection =
  | 'overview'
  | 'github'
  | 'leetcode'
  | 'resources'
  | 'notifications'
  | 'resume'
  | 'settings';

type GitHubData = {
  connected: boolean;
  profile?: { login: string; name: string; avatar_url: string; html_url: string };
  repositories?: { name: string; description: string | null; url: string; language: string | null; stars: number; updated_at: string | null }[];
  recent_public_events?: number;
  activity_weeks?: { date: string; count: number; color: string }[][];
  activity_total?: number;
  activity_colors?: string[];
  activity_totals?: { commits: number; pull_requests: number; issues: number };
  recent_commits?: { sha: string; message: string; repository: string; url: string; occurred_at: string }[];
  pull_requests?: { title: string; url: string; repository: string; state: string; occurred_at: string }[];
  cached?: boolean;
  stale?: boolean;
};

type LCStats = {
  profile_url: string;
  easy: number;
  medium: number;
  hard: number;
  topics?: Record<string, number>;
  daily_solves?: Record<string, number>;
  updated_at: string;
};

type ResumeReport = {
  ats_score: number;
  verdict: string;
  category_scores: { core_cs: number; projects: number; skills: number; formatting: number };
  strengths: string[];
  improvements: string[];
  bullet_rewrites: { original: string; improved: string; reason: string }[];
  custom_interview_questions: string[];
};

interface Props {
  section: DashboardSection;
  onSectionChange: (section: DashboardSection) => void;
  onOpenAssistant: (prompt?: string) => void;
  user: GoogleUser | null;
  login: (user: GoogleUser) => void;
  logout: () => void;
  showLogin: boolean;
  setShowLogin: (show: boolean) => void;
}

// ── Curated Resources (17 trusted placement & tech websites) ──────────────────
const PLACEMENT_RESOURCES = [
  // DSA Practice
  {
    name: 'GeeksforGeeks',
    url: 'https://www.geeksforgeeks.org',
    category: 'DSA Practice',
    description: 'Gold standard for CS theory, company-wise interview archives, and placement roadmaps.',
    badge: 'Theory & Archives'
  },
  {
    name: 'NeetCode',
    url: 'https://neetcode.io',
    category: 'DSA Practice',
    description: 'Structured roadmap for DSA patterns, Blind 75, NeetCode 150, and video explanations.',
    badge: 'DSA Patterns'
  },
  {
    name: 'LeetCode',
    url: 'https://leetcode.com',
    category: 'DSA Practice',
    description: 'Global benchmark platform for technical coding interview problem sets and contests.',
    badge: 'Coding Contests'
  },
  {
    name: 'Codeforces',
    url: 'https://codeforces.com',
    category: 'DSA Practice',
    description: 'Competitive programming rounds to hone algorithmic thinking and speed under pressure.',
    badge: 'Competitive'
  },
  {
    name: 'HackerRank',
    url: 'https://www.hackerrank.com',
    category: 'DSA Practice',
    description: 'Online coding assessments, skill certifications, and university campus contests.',
    badge: 'Assessments'
  },

  // Aptitude & Mock Tests
  {
    name: 'IndiaBIX',
    url: 'https://www.indiabix.com',
    category: 'Aptitude & Tests',
    description: 'Quantitative aptitude, logical reasoning, verbal ability, and technical CS MCQs.',
    badge: 'Campus Aptitude'
  },
  {
    name: 'PrepInsta',
    url: 'https://prepinsta.com',
    category: 'Aptitude & Tests',
    description: 'Placement syllabus, mock tests, and previous papers for TCS NQT, Infosys, and Wipro.',
    badge: 'Service Companies'
  },
  {
    name: 'Sanfoundry',
    url: 'https://sanfoundry.com',
    category: 'Aptitude & Tests',
    description: '100,000+ deep-dive MCQs for Operating Systems, DBMS, Computer Networks, and OOPs.',
    badge: 'Core CS MCQs'
  },
  {
    name: 'Testbook',
    url: 'https://testbook.com',
    category: 'Aptitude & Tests',
    description: 'Speed test practice, timed sectional tests, and general aptitude question banks.',
    badge: 'Mock Tests'
  },

  // Tech News & System Design
  {
    name: 'ByteByteGo',
    url: 'https://bytebytego.com',
    category: 'Tech News & Design',
    description: 'Clear, visual system design explanations by Alex Xu covering modern distributed systems.',
    badge: 'System Design'
  },
  {
    name: 'Hacker News',
    url: 'https://news.ycombinator.com',
    category: 'Tech News & Design',
    description: 'Real-time engineering discussions, emerging open-source technologies, and tech culture.',
    badge: 'Tech Culture'
  },
  {
    name: 'Dev.to',
    url: 'https://dev.to',
    category: 'Tech News & Design',
    description: 'Practical developer tutorials, project showcases, and software career insights.',
    badge: 'Dev Community'
  },
  {
    name: 'High Scalability',
    url: 'https://highscalability.com',
    category: 'Tech News & Design',
    description: 'Real-world architecture breakdowns of Netflix, Google, YouTube, and Twitter scale.',
    badge: 'Architecture'
  },
  {
    name: 'TechCrunch',
    url: 'https://techcrunch.com',
    category: 'Tech News & Design',
    description: 'Global venture capital, startup acquisitions, AI breakthroughs, and industry trends.',
    badge: 'Industry News'
  },

  // Placement & Job Portals
  {
    name: 'Internshala',
    url: 'https://internshala.com',
    category: 'Job Portals',
    description: 'India’s top portal for verified software internships, early-career jobs, and stipends.',
    badge: 'Internships'
  },
  {
    name: 'Unstop',
    url: 'https://unstop.com',
    category: 'Job Portals',
    description: 'College hackathons, company hiring challenges, case competitions, and campus drives.',
    badge: 'Hackathons'
  },
  {
    name: 'Naukri.com',
    url: 'https://www.naukri.com',
    category: 'Job Portals',
    description: 'Leading job search platform in India for graduate engineer trainees and fresher hiring.',
    badge: 'Fresher Hiring'
  },
  {
    name: 'Wellfound (AngelList)',
    url: 'https://wellfound.com',
    category: 'Job Portals',
    description: 'Direct access to founding teams and engineers at fast-growing modern tech startups.',
    badge: 'Startups'
  }
];

// Default LeetCode Topics for Topic CRUD
const DEFAULT_TOPICS = [
  'Arrays & Hashing',
  'Two Pointers & Sliding Window',
  'Linked Lists',
  'Trees & BST',
  'Graphs (BFS/DFS)',
  'Dynamic Programming',
  'Binary Search & Stack',
  'SQL & System Design'
];

export function DashboardPages({
  section,
  onSectionChange,
  onOpenAssistant,
  user,
  login,
  logout,
  showLogin,
  setShowLogin
}: Props) {
  const [github, setGithub] = useState<GitHubData | null>(null);
  const [leetcode, setLeetcode] = useState<LCStats | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');

  // LeetCode State
  const [profileUrl, setProfileUrl] = useState('');
  const [counts, setCounts] = useState({ easy: '0', medium: '0', hard: '0' });
  const [topics, setTopics] = useState<Record<string, number>>({});
  const [newTopicName, setNewTopicName] = useState('');
  const [dailySolves, setDailySolves] = useState<Record<string, number>>({});
  const [selectedCalendarDate, setSelectedCalendarDate] = useState<string>(
    new Date().toISOString().split('T')[0]
  );

  // Heatmap View Mode State: 'combined' | 'tab'
  const [githubHeatmapMode, setGithubHeatmapMode] = useState<'combined' | 'tab'>('combined');
  const [leetcodeHeatmapMode, setLeetcodeHeatmapMode] = useState<'combined' | 'tab'>('combined');

  // Resources Filter State
  const [resourceFilter, setResourceFilter] = useState<string>('All');

  // Resume Scorer State
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [targetRole, setTargetRole] = useState('Software Development Engineer');
  const [resumeEvaluating, setResumeEvaluating] = useState(false);
  const [resumeReport, setResumeReport] = useState<ResumeReport | null>(null);
  const [resumeError, setResumeError] = useState('');

  // Email Notification Preferences State
  const [emailSyncEnabled, setEmailSyncEnabled] = useState(true);
  const [trackedSenders, setTrackedSenders] = useState<Record<string, boolean>>({
    unstop: true,
    naukri: true,
    internshala: true,
    leetcode_contests: true
  });

  const headers: Record<string, string> = useMemo(() => {
    const h: Record<string, string> = {};
    if (user?.token) {
      h.Authorization = `Bearer ${user.token}`;
    }
    return h;
  }, [user]);

  // Load GitHub Data
  const loadGitHub = async (refresh = false) => {
    if (!user) return;
    try {
      const response = await fetch(`${API}/integrations/github${refresh ? '?refresh=true' : ''}`, { headers });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || 'Could not load GitHub data');
      setGithub(data);
    } catch (err: any) {
      setNotice(err.message || 'Failed to load GitHub');
    }
  };

  // Load LeetCode Data
  const loadLeetCode = async () => {
    if (!user) return;
    try {
      const response = await fetch(`${API}/integrations/leetcode`, { headers });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || 'Could not load LeetCode stats');
      if (data.stats) {
        setLeetcode(data.stats);
        setProfileUrl(data.stats.profile_url || '');
        setCounts({
          easy: String(data.stats.easy ?? 0),
          medium: String(data.stats.medium ?? 0),
          hard: String(data.stats.hard ?? 0)
        });
        setTopics(data.stats.topics && Object.keys(data.stats.topics).length ? data.stats.topics : (
          DEFAULT_TOPICS.reduce((acc, t) => ({ ...acc, [t]: 0 }), {})
        ));
        setDailySolves(data.stats.daily_solves || {});
      } else {
        // Initialize default topics
        setTopics(DEFAULT_TOPICS.reduce((acc, t) => ({ ...acc, [t]: 0 }), {}));
      }
    } catch (err: any) {
      setNotice(err.message || 'Failed to load LeetCode');
    }
  };

  useEffect(() => {
    if (user) {
      loadGitHub().catch(() => {});
      loadLeetCode().catch(() => {});
    }
  }, [user]);

  // GitHub OAuth popup listener
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin || event.data?.type !== 'github-oauth-complete') return;
      if (event.data.status === 'success') {
        loadGitHub(true);
        setNotice('GitHub connected successfully!');
      } else {
        setNotice(`GitHub connection failed: ${event.data.status || 'unknown error'}`);
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  const connectGitHub = async () => {
    if (!user) {
      setShowLogin(true);
      return;
    }
    const popup = window.open('', 'github-oauth', 'popup,width=620,height=760');
    setBusy(true);
    try {
      const response = await fetch(`${API}/integrations/github/connect`, { method: 'POST', headers });
      const data = await response.json();
      if (!response.ok || !data.auth_url) throw new Error(data.detail || 'Failed to start GitHub authorization');
      if (popup) popup.location.href = data.auth_url;
    } catch (e: any) {
      popup?.close();
      setNotice(e.message || 'Could not open GitHub authorization window');
    } finally {
      setBusy(false);
    }
  };

  const disconnectGitHub = async () => {
    setBusy(true);
    try {
      await fetch(`${API}/integrations/github`, { method: 'DELETE', headers });
      setGithub({ connected: false });
      setNotice('GitHub disconnected.');
    } catch (e: any) {
      setNotice(e.message || 'Failed to disconnect GitHub');
    } finally {
      setBusy(false);
    }
  };

  // Save LeetCode stats + topics + daily solves
  const saveLeetCode = async (customTopics = topics, customDaily = dailySolves, showCelebration = true) => {
    if (!user) {
      setShowLogin(true);
      return;
    }
    setBusy(true);
    try {
      const payload = {
        profile_url: profileUrl.trim(),
        easy: Number(counts.easy) || 0,
        medium: Number(counts.medium) || 0,
        hard: Number(counts.hard) || 0,
        topics: customTopics,
        daily_solves: customDaily
      };
      const response = await fetch(`${API}/integrations/leetcode`, {
        method: 'PUT',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || 'Could not save LeetCode stats');
      setLeetcode(data.stats);
      setNotice('LeetCode progress saved!');
      if (showCelebration) {
        triggerCelebration(0.5, 0.5);
      }
    } catch (e: any) {
      setNotice(e.message || 'Failed to save LeetCode stats');
    } finally {
      setBusy(false);
    }
  };

  const clearLeetCode = async () => {
    setBusy(true);
    try {
      await fetch(`${API}/integrations/leetcode`, { method: 'DELETE', headers });
      setLeetcode(null);
      setProfileUrl('');
      setCounts({ easy: '0', medium: '0', hard: '0' });
      setTopics(DEFAULT_TOPICS.reduce((acc, t) => ({ ...acc, [t]: 0 }), {}));
      setDailySolves({});
      setNotice('LeetCode data removed.');
    } catch (e: any) {
      setNotice(e.message || 'Failed to remove LeetCode data');
    } finally {
      setBusy(false);
    }
  };

  // Topic Stepper helper
  const updateTopicCount = (topic: string, delta: number) => {
    const updated = { ...topics, [topic]: Math.max(0, (topics[topic] || 0) + delta) };
    setTopics(updated);
    // Also record solve in today's daily_solves if delta > 0
    let updatedDaily = { ...dailySolves };
    if (delta > 0) {
      const today = new Date().toISOString().split('T')[0];
      updatedDaily[today] = (updatedDaily[today] || 0) + delta;
      setDailySolves(updatedDaily);
      triggerCelebration(0.6, 0.4);
    }
    saveLeetCode(updated, updatedDaily, delta > 0);
  };

  const addCustomTopic = () => {
    const trimmed = newTopicName.trim();
    if (!trimmed || topics[trimmed] !== undefined) return;
    const updated = { ...topics, [trimmed]: 0 };
    setTopics(updated);
    setNewTopicName('');
    saveLeetCode(updated, dailySolves, false);
  };

  const removeTopic = (topic: string) => {
    const updated = { ...topics };
    delete updated[topic];
    setTopics(updated);
    saveLeetCode(updated, dailySolves, false);
  };

  // Calendar day logger
  const logSolveForDate = (dateStr: string, countDelta: number) => {
    const current = dailySolves[dateStr] || 0;
    const nextVal = Math.max(0, current + countDelta);
    const updatedDaily = { ...dailySolves, [dateStr]: nextVal };
    setDailySolves(updatedDaily);
    if (countDelta > 0) {
      triggerCelebration(0.5, 0.5);
    }
    saveLeetCode(topics, updatedDaily, countDelta > 0);
  };

  // Resume Evaluator Call
  const evaluateResume = async () => {
    if (!resumeFile) return;
    setResumeEvaluating(true);
    setResumeError('');
    setResumeReport(null);

    try {
      const formData = new FormData();
      formData.append('file', resumeFile);

      // Upload file to ephemeral RAM store
      const uploadRes = await fetch(`${API}/upload`, {
        method: 'POST',
        headers: user ? { Authorization: `Bearer ${user.token}` } : {},
        body: formData
      });
      const uploadData = await uploadRes.json();
      if (!uploadRes.ok) throw new Error(uploadData.detail || 'Resume upload failed');

      const sessionId = uploadData.session_id;
      const docToken = uploadData.document_token;

      // Score resume
      const scoreRes = await fetch(`${API}/document/score-resume`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(docToken ? { 'X-Document-Token': docToken } : {}),
          ...(user ? { Authorization: `Bearer ${user.token}` } : {})
        },
        body: JSON.stringify({ session_id: sessionId, target_role: targetRole })
      });
      const scoreData = await scoreRes.json();
      if (!scoreRes.ok) throw new Error(scoreData.detail || 'Resume scoring failed');

      setResumeReport(scoreData);
      triggerCelebration(0.5, 0.4);
    } catch (err: any) {
      setResumeError(err.message || 'Could not analyze resume');
    } finally {
      setResumeEvaluating(false);
    }
  };

  // Compute Streak metrics (Current & Longest) from combined GitHub + LeetCode
  const { currentStreak, maxStreak, combinedWeeks } = useMemo(() => {
    const ghWeeks = github?.activity_weeks || [];
    if (!ghWeeks.length) {
      return { currentStreak: 0, maxStreak: 0, combinedWeeks: [] };
    }

    // Merge day by day
    const mergedWeeks = ghWeeks.map(week =>
      week.map(day => {
        const ghCount = day.count || 0;
        const lcCount = dailySolves[day.date] || 0;
        const totalCount = ghCount + lcCount;

        // Choose color based on intensity
        let combinedColor = '#f1f5f9';
        if (totalCount > 0 && totalCount <= 2) combinedColor = '#fbcfe8'; // light rose
        else if (totalCount > 2 && totalCount <= 5) combinedColor = '#f43f5e'; // rose
        else if (totalCount > 5) combinedColor = '#be123c'; // deep rose

        return {
          date: day.date,
          ghCount,
          lcCount,
          totalCount,
          ghColor: day.color,
          combinedColor
        };
      })
    );

    // Calculate streaks across chronological days
    const allDays = mergedWeeks.flat();
    let current = 0;
    let max = 0;
    let temp = 0;

    for (let i = 0; i < allDays.length; i++) {
      if (allDays[i].totalCount > 0) {
        temp++;
        if (temp > max) max = temp;
      } else {
        temp = 0;
      }
    }

    // Current streak (counting backwards from today)
    const today = new Date().toISOString().split('T')[0];
    const todayIndex = allDays.findIndex(d => d.date === today);
    const endIndex = todayIndex !== -1 ? todayIndex : allDays.length - 1;

    for (let i = endIndex; i >= 0; i--) {
      if (allDays[i].totalCount > 0) {
        current++;
      } else if (i === endIndex) {
        // Today has 0 so far, check yesterday
        continue;
      } else {
        break;
      }
    }

    return { currentStreak: current, maxStreak: max, combinedWeeks: mergedWeeks };
  }, [github?.activity_weeks, dailySolves]);

  // Clean, modern light card styling
  const card = 'rounded-3xl border border-themeBorder bg-white/85 dark:bg-slate-900/85 backdrop-blur-md p-6 shadow-[0_4px_20px_-4px_rgba(0,0,0,0.05)] transition-all duration-300 hover:shadow-[0_8px_30px_-4px_rgba(0,0,0,0.08)]';
  const actionBtn = 'inline-flex items-center gap-2 rounded-xl bg-themeAccent px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:opacity-90 active:scale-95 transition-all';
  const secondaryBtn = 'inline-flex items-center gap-2 rounded-xl border border-themeBorder bg-themeCard/60 px-4 py-2.5 text-sm font-medium hover:border-themeAccent/40 hover:bg-themeCard active:scale-95 transition-all';

  // Navigation Items
  const navItems = [
    { id: 'overview' as const, label: 'Overview', icon: LayoutDashboard },
    { id: 'github' as const, label: 'GitHub', icon: GitBranch },
    { id: 'leetcode' as const, label: 'LeetCode', icon: Code2 },
    { id: 'resources' as const, label: 'Links & Prep', icon: Globe },
    { id: 'notifications' as const, label: 'Contests & Alerts', icon: Bell },
    { id: 'resume' as const, label: 'Resume Scorer', icon: FileText },
    { id: 'settings' as const, label: 'Settings', icon: Settings }
  ];

  return (
    <div className="min-h-screen bg-themeBg text-themeTextPrimary">
      <AuthModal
        isOpen={showLogin}
        onClose={() => setShowLogin(false)}
        user={user}
        onLoginSuccess={login}
        onLogout={logout}
      />

      {/* Top Application Bar */}
      <header className="sticky top-0 z-30 border-b border-themeBorder bg-white/80 dark:bg-slate-900/80 backdrop-blur-md px-6 py-4">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-themeAccent/15 text-themeAccent font-black text-xl">
              P
            </div>
            <div>
              <h1 className="text-lg font-bold leading-none tracking-tight">Placement-Prep</h1>
              <p className="text-xs text-themeTextSecondary mt-0.5">Campus Placement & Engineering Readiness</p>
            </div>
          </div>

          {/* Quick Action: Jump to AI Agent */}
          <div className="flex items-center gap-2.5">
            <button
              onClick={() => onOpenAssistant()}
              className="inline-flex items-center gap-2 rounded-2xl bg-themeAccent/10 border border-themeAccent/20 px-4 py-2 text-xs font-semibold text-themeAccent hover:bg-themeAccent hover:text-white transition-all shadow-sm"
            >
              <MessageSquare size={14} />
              AI Assistant
            </button>

            {user ? (
              <button
                onClick={() => onSectionChange('settings')}
                className="flex items-center gap-2 rounded-2xl border border-themeBorder bg-themeCard/60 px-3 py-1.5 text-xs hover:border-themeAccent/40 transition-all"
              >
                {user.picture ? (
                  <img src={user.picture} alt="" className="h-6 w-6 rounded-full" />
                ) : (
                  <span className="h-6 w-6 rounded-full bg-themeAccent text-white flex items-center justify-center font-bold text-[10px]">
                    {user.name?.[0] || 'U'}
                  </span>
                )}
                <span className="hidden sm:inline font-medium">{user.name?.split(' ')[0]}</span>
              </button>
            ) : (
              <button
                onClick={() => setShowLogin(true)}
                className="rounded-xl bg-themeAccent px-3.5 py-2 text-xs font-semibold text-white shadow-sm hover:opacity-95"
              >
                Sign In
              </button>
            )}
          </div>
        </div>

        {/* Horizontal Navigation Pills */}
        <div className="mx-auto mt-4 flex max-w-7xl items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
          {navItems.map(item => {
            const Icon = item.icon;
            const active = section === item.id;
            return (
              <button
                key={item.id}
                onClick={() => onSectionChange(item.id)}
                className={`inline-flex items-center gap-2 rounded-2xl px-4 py-2 text-xs font-semibold whitespace-nowrap transition-all ${
                  active
                    ? 'bg-themeAccent text-white shadow-sm shadow-themeAccent/20 scale-[1.02]'
                    : 'text-themeTextSecondary hover:text-themeTextPrimary hover:bg-themeCard/60'
                }`}
              >
                <Icon size={14} />
                {item.label}
              </button>
            );
          })}
        </div>
      </header>

      {/* Main Content Area */}
      <main className="mx-auto max-w-7xl p-4 sm:p-6 lg:p-8">
        {notice && (
          <div className="mb-6 flex items-center justify-between rounded-2xl border border-themeAccent/20 bg-themeAccent/10 px-4 py-3 text-xs text-themeTextPrimary animate-in fade-in duration-200">
            <span>{notice}</span>
            <button onClick={() => setNotice('')} className="font-bold hover:opacity-80">✕</button>
          </div>
        )}

        {/* ── OVERVIEW TAB ────────────────────────────────────────────────────────── */}
        {section === 'overview' && (
          <div className="space-y-6">
            {/* Metric Stat Cards */}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className={card}>
                <div className="flex items-center justify-between text-themeTextSecondary">
                  <span className="text-xs font-semibold uppercase tracking-wider">GitHub Commits</span>
                  <GitBranch size={16} className="text-themeAccent" />
                </div>
                <div className="mt-3 text-3xl font-extrabold">{github?.activity_totals?.commits ?? 0}</div>
                <p className="mt-1 text-xs text-themeTextSecondary">Recorded in past year</p>
              </div>

              <div className={card}>
                <div className="flex items-center justify-between text-themeTextSecondary">
                  <span className="text-xs font-semibold uppercase tracking-wider">LeetCode Solved</span>
                  <Code2 size={16} className="text-themeAccent" />
                </div>
                <div className="mt-3 text-3xl font-extrabold">
                  {leetcode ? leetcode.easy + leetcode.medium + leetcode.hard : 0}
                </div>
                <p className="mt-1 text-xs text-themeTextSecondary">Self-reported & verified</p>
              </div>

              <div className={card}>
                <div className="flex items-center justify-between text-themeTextSecondary">
                  <span className="text-xs font-semibold uppercase tracking-wider">Current Streak</span>
                  <Flame size={16} className="text-amber-500" />
                </div>
                <div className="mt-3 text-3xl font-extrabold flex items-baseline gap-1.5">
                  {currentStreak} <span className="text-sm font-normal text-themeTextSecondary">days</span>
                </div>
                <p className="mt-1 text-xs text-themeTextSecondary">Active preparation streak</p>
              </div>

              <div className={card}>
                <div className="flex items-center justify-between text-themeTextSecondary">
                  <span className="text-xs font-semibold uppercase tracking-wider">Longest Streak</span>
                  <Trophy size={16} className="text-yellow-500" />
                </div>
                <div className="mt-3 text-3xl font-extrabold flex items-baseline gap-1.5">
                  {maxStreak} <span className="text-sm font-normal text-themeTextSecondary">days</span>
                </div>
                <p className="mt-1 text-xs text-themeTextSecondary">Personal peak consistency</p>
              </div>
            </div>

            {/* Quick Link Cards to Key Features */}
            <div className="grid gap-5 md:grid-cols-3">
              <div
                onClick={() => onSectionChange('github')}
                className={`${card} cursor-pointer group hover:border-themeAccent/50`}
              >
                <div className="flex items-center justify-between">
                  <GitBranch className="text-themeAccent" size={20} />
                  <ArrowUpRight size={16} className="text-themeTextSecondary group-hover:text-themeAccent transition-colors" />
                </div>
                <h3 className="mt-4 font-bold text-base">GitHub Activity</h3>
                <p className="mt-1 text-xs text-themeTextSecondary leading-relaxed">
                  {github?.connected ? `@${github.profile?.login} connected` : 'Connect your account to sync public repositories and commits.'}
                </p>
              </div>

              <div
                onClick={() => onSectionChange('leetcode')}
                className={`${card} cursor-pointer group hover:border-themeAccent/50`}
              >
                <div className="flex items-center justify-between">
                  <Code2 className="text-themeAccent" size={20} />
                  <ArrowUpRight size={16} className="text-themeTextSecondary group-hover:text-themeAccent transition-colors" />
                </div>
                <h3 className="mt-4 font-bold text-base">LeetCode Tracker</h3>
                <p className="mt-1 text-xs text-themeTextSecondary leading-relaxed">
                  Log custom DSA topics with stepper counters, celebratory confetti, and daily calendar solves.
                </p>
              </div>

              <div
                onClick={() => onSectionChange('resume')}
                className={`${card} cursor-pointer group hover:border-themeAccent/50`}
              >
                <div className="flex items-center justify-between">
                  <FileText className="text-themeAccent" size={20} />
                  <ArrowUpRight size={16} className="text-themeTextSecondary group-hover:text-themeAccent transition-colors" />
                </div>
                <h3 className="mt-4 font-bold text-base">AI Resume Scorer</h3>
                <p className="mt-1 text-xs text-themeTextSecondary leading-relaxed">
                  Upload your resume PDF to receive ATS readiness score, STAR bullet polish, and custom mock questions.
                </p>
              </div>
            </div>

            {/* Overview Combined Calendar View */}
            {combinedWeeks.length > 0 && (
              <section className={card}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="text-base font-bold">Unified 52-Week Activity Heatmap</h2>
                    <p className="text-xs text-themeTextSecondary mt-0.5">
                      Combines GitHub commits with LeetCode problem solves
                    </p>
                  </div>
                  <div className="flex items-center gap-2 text-[10px] text-themeTextSecondary">
                    <span>Less</span>
                    {['#f1f5f9', '#fbcfe8', '#f43f5e', '#be123c'].map(c => (
                      <span key={c} className="h-3 w-3 rounded-[3px] border border-black/5" style={{ backgroundColor: c }} />
                    ))}
                    <span>More</span>
                  </div>
                </div>

                <div className="mt-5 overflow-x-auto pb-2 scrollbar-none">
                  <div className="flex min-w-max gap-1">
                    {combinedWeeks.map((week, wIdx) => (
                      <div key={wIdx} className="grid grid-rows-7 gap-1">
                        {week.map((day, dIdx) => (
                          <span
                            key={`${day.date}-${dIdx}`}
                            title={`${day.date}: ${day.ghCount} commits, ${day.lcCount} LeetCode solves`}
                            className="h-3 w-3 rounded-[3px] transition-transform hover:scale-125 hover:z-10"
                            style={{ backgroundColor: day.combinedColor }}
                          />
                        ))}
                      </div>
                    ))}
                  </div>
                </div>
              </section>
            )}
          </div>
        )}

        {/* ── GITHUB TAB ──────────────────────────────────────────────────────────── */}
        {section === 'github' && (
          <div className="space-y-6">
            <div className="grid gap-6 lg:grid-cols-[.85fr_1.15fr]">
              {/* Account Connect Status */}
              <section className={card}>
                <div className="flex items-center gap-3">
                  <GitBranch className="text-themeAccent" size={24} />
                  <div>
                    <h2 className="text-base font-bold">GitHub Integration</h2>
                    <p className="text-xs text-themeTextSecondary">Sync repos, PRs, and commit history</p>
                  </div>
                </div>

                {github?.connected ? (
                  <div className="mt-5 space-y-4">
                    <div className="flex items-center gap-3 rounded-2xl bg-themeCard/60 p-3 border border-themeBorder">
                      {github.profile?.avatar_url && (
                        <img src={github.profile.avatar_url} alt="" className="h-12 w-12 rounded-full" />
                      )}
                      <div>
                        <b className="text-sm">{github.profile?.name || github.profile?.login}</b>
                        <p className="text-xs text-themeTextSecondary">@{github.profile?.login}</p>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2 pt-2">
                      <a
                        className={secondaryBtn}
                        href={github.profile?.html_url}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Open Profile <ExternalLink size={14} />
                      </a>
                      <button
                        className="rounded-xl border border-red-200 bg-red-50 dark:bg-red-950/30 text-red-600 px-3.5 py-2 text-xs font-semibold hover:bg-red-100 transition-all"
                        disabled={busy}
                        onClick={disconnectGitHub}
                      >
                        <Trash2 size={13} className="mr-1.5 inline" /> Disconnect
                      </button>
                      <button
                        className="rounded-xl border border-themeBorder px-3.5 py-2 text-xs font-semibold text-themeTextSecondary hover:text-themeTextPrimary transition-all"
                        disabled={busy}
                        onClick={() => loadGitHub(true)}
                      >
                        <RefreshCw size={13} className="mr-1.5 inline" /> Refresh
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="mt-6 text-center py-6">
                    <p className="text-xs text-themeTextSecondary max-w-sm mx-auto">
                      Connect your GitHub profile via secure OAuth to showcase your repositories, pull requests, and commit calendar.
                    </p>
                    <button className={`${actionBtn} mt-5`} disabled={busy} onClick={connectGitHub}>
                      {busy ? 'Connecting…' : 'Connect GitHub'}
                    </button>
                  </div>
                )}
              </section>

              {/* Repositories Feed */}
              <section className={card}>
                <h3 className="font-bold text-sm mb-3">Recent Public Repositories</h3>
                {!github?.connected ? (
                  <p className="text-xs text-themeTextSecondary">Connect GitHub to load your repositories.</p>
                ) : !github.repositories?.length ? (
                  <p className="text-xs text-themeTextSecondary">No public repositories found.</p>
                ) : (
                  <div className="space-y-2.5 max-h-[280px] overflow-y-auto pr-1">
                    {github.repositories.map(repo => (
                      <a
                        key={repo.url}
                        href={repo.url}
                        target="_blank"
                        rel="noreferrer"
                        className="block rounded-2xl border border-themeBorder bg-themeCard/50 p-3.5 hover:border-themeAccent/50 transition-all group"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <h4 className="font-bold text-xs group-hover:text-themeAccent transition-colors">
                            {repo.name}
                          </h4>
                          <ArrowUpRight size={14} className="text-themeTextSecondary group-hover:text-themeAccent transition-colors shrink-0" />
                        </div>
                        <p className="mt-1 text-[11px] text-themeTextSecondary line-clamp-1">
                          {repo.description || 'No description'}
                        </p>
                        <div className="mt-2 flex items-center gap-3 text-[10px] text-themeTextSecondary font-medium">
                          <span>{repo.language || 'Code'}</span>
                          <span>★ {repo.stars}</span>
                        </div>
                      </a>
                    ))}
                  </div>
                )}
              </section>
            </div>

            {/* Heatmap Section with Dropdown */}
            {github?.connected && (
              <section className={card}>
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-themeBorder pb-4">
                  <div>
                    <h3 className="text-base font-bold">Activity Heatmap</h3>
                    <p className="text-xs text-themeTextSecondary">
                      {githubHeatmapMode === 'combined'
                        ? 'Displaying Combined GitHub Commits + LeetCode Solves'
                        : 'Displaying GitHub Contributions Only'}
                    </p>
                  </div>

                  {/* Heatmap Mode Dropdown */}
                  <div className="flex items-center gap-3">
                    <select
                      value={githubHeatmapMode}
                      onChange={e => setGithubHeatmapMode(e.target.value as 'combined' | 'tab')}
                      className="rounded-xl border border-themeBorder bg-themeCard/80 px-3 py-1.5 text-xs font-semibold text-themeTextPrimary focus:outline-none focus:border-themeAccent cursor-pointer"
                    >
                      <option value="combined">Combined (GitHub + LeetCode)</option>
                      <option value="tab">GitHub Activity Only</option>
                    </select>

                    <div className="flex items-center gap-1.5 text-[10px] text-themeTextSecondary">
                      <span>Less</span>
                      {(githubHeatmapMode === 'combined'
                        ? ['#f1f5f9', '#fbcfe8', '#f43f5e', '#be123c']
                        : ['#f1f5f9', '#bbf7d0', '#4ade80', '#16a34a']
                      ).map(c => (
                        <span key={c} className="h-3 w-3 rounded-[3px] border border-black/5" style={{ backgroundColor: c }} />
                      ))}
                      <span>More</span>
                    </div>
                  </div>
                </div>

                <div className="mt-5 overflow-x-auto pb-2 scrollbar-none">
                  <div className="flex min-w-max gap-1">
                    {combinedWeeks.map((week, wIdx) => (
                      <div key={wIdx} className="grid grid-rows-7 gap-1">
                        {week.map((day, dIdx) => {
                          const bg =
                            githubHeatmapMode === 'combined'
                              ? day.combinedColor
                              : day.ghCount > 0
                              ? day.ghCount > 4
                                ? '#16a34a'
                                : '#4ade80'
                              : '#f1f5f9';
                          return (
                            <span
                              key={`${day.date}-${dIdx}`}
                              title={`${day.date}: ${day.ghCount} commits ${
                                githubHeatmapMode === 'combined' ? `+ ${day.lcCount} LeetCode` : ''
                              }`}
                              className="h-3 w-3 rounded-[3px] transition-transform hover:scale-125"
                              style={{ backgroundColor: bg }}
                            />
                          );
                        })}
                      </div>
                    ))}
                  </div>
                </div>
              </section>
            )}

            {/* Commits & PRs Grid */}
            {github?.connected && (
              <div className="grid gap-6 md:grid-cols-2">
                <section className={card}>
                  <h3 className="font-bold text-sm mb-3">Recent Pull Requests</h3>
                  {github.pull_requests?.length ? (
                    <div className="space-y-2.5 max-h-[240px] overflow-y-auto pr-1">
                      {github.pull_requests.map((pr, idx) => (
                        <a
                          key={`${pr.url}-${idx}`}
                          href={pr.url}
                          target="_blank"
                          rel="noreferrer"
                          className="block rounded-2xl border border-themeBorder bg-themeCard/40 p-3 hover:border-themeAccent/50 transition-all"
                        >
                          <b className="text-xs font-semibold block line-clamp-1">{pr.title}</b>
                          <p className="mt-1 text-[10px] text-themeTextSecondary capitalize">
                            {pr.repository} · {pr.state}
                          </p>
                        </a>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-themeTextSecondary">No recent pull requests recorded.</p>
                  )}
                </section>

                <section className={card}>
                  <h3 className="font-bold text-sm mb-3">Recent Public Commits</h3>
                  {github.recent_commits?.length ? (
                    <div className="space-y-2.5 max-h-[240px] overflow-y-auto pr-1">
                      {github.recent_commits.map((c, idx) => (
                        <a
                          key={`${c.sha}-${idx}`}
                          href={c.url}
                          target="_blank"
                          rel="noreferrer"
                          className="block rounded-2xl border border-themeBorder bg-themeCard/40 p-3 hover:border-themeAccent/50 transition-all"
                        >
                          <b className="text-xs font-semibold block line-clamp-1">{c.message || 'Commit'}</b>
                          <p className="mt-1 text-[10px] text-themeTextSecondary">
                            {c.repository} · {c.sha.slice(0, 7)}
                          </p>
                        </a>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-themeTextSecondary">No recent public commit events found.</p>
                  )}
                </section>
              </div>
            )}
          </div>
        )}

        {/* ── LEETCODE TAB ────────────────────────────────────────────────────────── */}
        {section === 'leetcode' && (
          <div className="space-y-6">
            {/* Top Totals & Profile Bar */}
            <div className="grid gap-6 lg:grid-cols-[1.1fr_.9fr]">
              <section className={card}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Code2 className="text-themeAccent" size={24} />
                    <div>
                      <h2 className="text-base font-bold">LeetCode Problem Progress</h2>
                      <p className="text-xs text-themeTextSecondary">Track custom topics, difficulty breakdown, and daily solves</p>
                    </div>
                  </div>
                  {leetcode && (
                    <button
                      onClick={clearLeetCode}
                      disabled={busy}
                      className="text-xs text-red-500 hover:underline"
                    >
                      Clear Data
                    </button>
                  )}
                </div>

                <div className="mt-5 space-y-4">
                  <div>
                    <label className="text-xs font-semibold text-themeTextSecondary">Profile URL</label>
                    <input
                      className="mt-1 w-full rounded-xl border border-themeBorder bg-themeBg px-3.5 py-2 text-xs focus:outline-none focus:border-themeAccent"
                      placeholder="https://leetcode.com/u/your-username/"
                      value={profileUrl}
                      onChange={e => setProfileUrl(e.target.value)}
                    />
                  </div>

                  <div className="grid grid-cols-3 gap-3">
                    {(['easy', 'medium', 'hard'] as const).map(lvl => (
                      <div key={lvl}>
                        <label className="text-xs font-semibold capitalize text-themeTextSecondary">{lvl}</label>
                        <input
                          type="number"
                          min="0"
                          className="mt-1 w-full rounded-xl border border-themeBorder bg-themeBg px-3 py-2 text-xs font-bold text-center"
                          value={counts[lvl]}
                          onChange={e => setCounts({ ...counts, [lvl]: e.target.value })}
                        />
                      </div>
                    ))}
                  </div>

                  <div className="flex items-center gap-2 pt-2">
                    <button className={actionBtn} disabled={busy} onClick={() => saveLeetCode(topics, dailySolves, true)}>
                      <Save size={14} /> Save Profile & Counts
                    </button>
                  </div>
                </div>
              </section>

              {/* Total Summary Card */}
              <section className={`${card} flex flex-col justify-center text-center`}>
                <span className="text-[11px] font-bold uppercase tracking-widest text-themeAccent">
                  Total Solved Problems
                </span>
                <div className="my-3 text-5xl font-black">
                  {(Number(counts.easy) || 0) + (Number(counts.medium) || 0) + (Number(counts.hard) || 0)}
                </div>
                <div className="grid grid-cols-3 gap-2 mt-4">
                  <div className="rounded-2xl border border-emerald-200 bg-emerald-50/60 dark:bg-emerald-950/20 p-2.5">
                    <span className="text-[10px] font-bold text-emerald-600 uppercase">Easy</span>
                    <b className="block text-lg font-extrabold text-emerald-700 dark:text-emerald-400">
                      {counts.easy}
                    </b>
                  </div>
                  <div className="rounded-2xl border border-amber-200 bg-amber-50/60 dark:bg-amber-950/20 p-2.5">
                    <span className="text-[10px] font-bold text-amber-600 uppercase">Medium</span>
                    <b className="block text-lg font-extrabold text-amber-700 dark:text-amber-400">
                      {counts.medium}
                    </b>
                  </div>
                  <div className="rounded-2xl border border-rose-200 bg-rose-50/60 dark:bg-rose-950/20 p-2.5">
                    <span className="text-[10px] font-bold text-rose-600 uppercase">Hard</span>
                    <b className="block text-lg font-extrabold text-rose-700 dark:text-rose-400">
                      {counts.hard}
                    </b>
                  </div>
                </div>
              </section>
            </div>

            {/* Interactive Topic CRUD with Celebratory Animations */}
            <section className={card}>
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-themeBorder pb-4">
                <div>
                  <h3 className="text-base font-bold">Topic-Wise Problem Tracker</h3>
                  <p className="text-xs text-themeTextSecondary">
                    Increment solves with celebratory confetti on each milestone
                  </p>
                </div>

                {/* Add Topic Input */}
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    placeholder="New topic name…"
                    className="rounded-xl border border-themeBorder bg-themeBg px-3 py-1.5 text-xs focus:outline-none focus:border-themeAccent"
                    value={newTopicName}
                    onChange={e => setNewTopicName(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && addCustomTopic()}
                  />
                  <button
                    onClick={addCustomTopic}
                    className="rounded-xl bg-themeAccent/15 text-themeAccent px-3 py-1.5 text-xs font-semibold hover:bg-themeAccent hover:text-white transition-all"
                  >
                    <Plus size={14} className="inline mr-1" /> Add
                  </button>
                </div>
              </div>

              {/* Topics Grid */}
              <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {Object.entries(topics).map(([topic, solved]) => (
                  <div
                    key={topic}
                    className="flex items-center justify-between rounded-2xl border border-themeBorder bg-themeCard/40 p-3.5 hover:border-themeAccent/40 transition-all"
                  >
                    <div className="min-w-0 pr-2">
                      <span className="font-semibold text-xs block truncate" title={topic}>
                        {topic}
                      </span>
                      <span className="text-[11px] text-themeTextSecondary">
                        {solved} solved
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        onClick={() => updateTopicCount(topic, -1)}
                        className="h-7 w-7 rounded-lg border border-themeBorder flex items-center justify-center hover:bg-themeCard text-themeTextSecondary hover:text-themeTextPrimary transition-all"
                        title="Minus 1"
                      >
                        <Minus size={12} />
                      </button>
                      <button
                        onClick={() => updateTopicCount(topic, 1)}
                        className="h-7 w-8 rounded-lg bg-themeAccent/10 border border-themeAccent/20 text-themeAccent text-xs font-bold hover:bg-themeAccent hover:text-white transition-all shadow-sm active:scale-90"
                        title="Add 1"
                      >
                        +1
                      </button>
                      <button
                        onClick={() => updateTopicCount(topic, 5)}
                        className="h-7 w-8 rounded-lg bg-themeAccent text-white text-[10px] font-bold hover:opacity-90 transition-all shadow-sm active:scale-90"
                        title="Add 5"
                      >
                        +5
                      </button>
                      <button
                        onClick={() => removeTopic(topic)}
                        className="h-7 w-7 rounded-lg text-themeTextSecondary hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/20 flex items-center justify-center transition-all ml-1"
                        title="Remove topic"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {/* Daily Solves Calendar Widget & Heatmap with Dropdown */}
            <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
              {/* LeetCode Dedicated Date Logger */}
              <section className={card}>
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <Calendar size={18} className="text-themeAccent" />
                    <h3 className="font-bold text-sm">Log Daily Solves</h3>
                  </div>
                  <span className="text-xs text-themeTextSecondary">
                    Selected: {selectedCalendarDate}
                  </span>
                </div>

                <div className="flex items-center gap-3">
                  <input
                    type="date"
                    value={selectedCalendarDate}
                    onChange={e => setSelectedCalendarDate(e.target.value)}
                    className="rounded-xl border border-themeBorder bg-themeBg px-3 py-2 text-xs font-medium focus:outline-none focus:border-themeAccent"
                  />
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => logSolveForDate(selectedCalendarDate, 1)}
                      className={actionBtn}
                    >
                      <Plus size={14} /> Log +1 Solve
                    </button>
                    <button
                      onClick={() => logSolveForDate(selectedCalendarDate, -1)}
                      className={secondaryBtn}
                    >
                      <Minus size={14} />
                    </button>
                  </div>
                </div>

                <div className="mt-4 rounded-2xl bg-themeCard/40 border border-themeBorder p-3 flex items-center justify-between">
                  <span className="text-xs text-themeTextSecondary">Solves recorded on {selectedCalendarDate}:</span>
                  <b className="text-sm text-themeAccent font-extrabold">
                    {dailySolves[selectedCalendarDate] || 0} problems
                  </b>
                </div>
              </section>

              {/* LeetCode Heatmap Dropdown */}
              <section className={card}>
                <div className="flex items-center justify-between border-b border-themeBorder pb-3 mb-4">
                  <div>
                    <h3 className="font-bold text-sm">LeetCode Heatmap</h3>
                    <p className="text-[11px] text-themeTextSecondary">Activity breakdown</p>
                  </div>
                  <select
                    value={leetcodeHeatmapMode}
                    onChange={e => setLeetcodeHeatmapMode(e.target.value as 'combined' | 'tab')}
                    className="rounded-xl border border-themeBorder bg-themeCard/80 px-2.5 py-1.5 text-xs font-semibold focus:outline-none focus:border-themeAccent cursor-pointer"
                  >
                    <option value="combined">Combined Activity</option>
                    <option value="tab">LeetCode Solves Only</option>
                  </select>
                </div>

                <div className="overflow-x-auto pb-2 scrollbar-none">
                  <div className="flex min-w-max gap-1">
                    {combinedWeeks.slice(-26).map((week, wIdx) => (
                      <div key={wIdx} className="grid grid-rows-7 gap-1">
                        {week.map((day, dIdx) => {
                          const bg =
                            leetcodeHeatmapMode === 'combined'
                              ? day.combinedColor
                              : day.lcCount > 0
                              ? day.lcCount > 3
                                ? '#e11d48'
                                : '#fda4af'
                              : '#f1f5f9';
                          return (
                            <span
                              key={`${day.date}-${dIdx}`}
                              title={`${day.date}: ${day.lcCount} LeetCode solves`}
                              className="h-3 w-3 rounded-[3px] transition-transform hover:scale-125"
                              style={{ backgroundColor: bg }}
                            />
                          );
                        })}
                      </div>
                    ))}
                  </div>
                </div>
              </section>
            </div>
          </div>
        )}

        {/* ── RESOURCES & IMPORTANT LINKS TAB ─────────────────────────────────────── */}
        {section === 'resources' && (
          <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h2 className="text-xl font-bold">Curated Placement & Tech Resources</h2>
                <p className="text-xs text-themeTextSecondary mt-0.5">
                  17 verified platforms for coding practice, aptitude preparation, tech news, and job drives
                </p>
              </div>

              {/* Category Filter Pills */}
              <div className="flex flex-wrap items-center gap-1.5">
                {['All', 'DSA Practice', 'Aptitude & Tests', 'Tech News & Design', 'Job Portals'].map(cat => (
                  <button
                    key={cat}
                    onClick={() => setResourceFilter(cat)}
                    className={`rounded-xl px-3 py-1.5 text-xs font-semibold transition-all ${
                      resourceFilter === cat
                        ? 'bg-themeAccent text-white shadow-sm'
                        : 'bg-themeCard/60 border border-themeBorder text-themeTextSecondary hover:text-themeTextPrimary'
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>

            {/* Resources Grid */}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {PLACEMENT_RESOURCES.filter(
                r => resourceFilter === 'All' || r.category === resourceFilter
              ).map(res => (
                <a
                  key={res.name}
                  href={res.url}
                  target="_blank"
                  rel="noreferrer"
                  className={`${card} flex flex-col justify-between group hover:border-themeAccent/60 hover:-translate-y-1 transition-all`}
                >
                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-themeAccent bg-themeAccent/10 px-2.5 py-1 rounded-lg">
                        {res.badge}
                      </span>
                      <div className="flex items-center gap-1 text-xs font-semibold text-themeAccent group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform">
                        <span>Visit</span>
                        <ArrowUpRight size={14} />
                      </div>
                    </div>
                    <h3 className="mt-3.5 font-bold text-sm text-themeTextPrimary">{res.name}</h3>
                    <p className="mt-1.5 text-xs text-themeTextSecondary leading-relaxed">
                      {res.description}
                    </p>
                  </div>
                  <div className="mt-4 pt-3 border-t border-themeBorder/60 flex items-center justify-between text-[11px] text-themeTextSecondary">
                    <span className="font-medium">{res.category}</span>
                    <span className="text-[10px] opacity-75">{res.url.replace('https://', '')}</span>
                  </div>
                </a>
              ))}
            </div>
          </div>
        )}

        {/* ── NOTIFICATIONS & CONTESTS TAB ────────────────────────────────────────── */}
        {section === 'notifications' && (
          <div className="space-y-6">
            <div className="grid gap-6 lg:grid-cols-[1.1fr_.9fr]">
              {/* Weekly Contests Feed */}
              <section className={card}>
                <div className="flex items-center gap-3 mb-4">
                  <Trophy className="text-themeAccent" size={22} />
                  <div>
                    <h2 className="text-base font-bold">Weekly Coding Contests</h2>
                    <p className="text-xs text-themeTextSecondary">Recurring competitive programming rounds</p>
                  </div>
                </div>

                <div className="space-y-3">
                  {[
                    {
                      platform: 'LeetCode',
                      name: 'Weekly Contest',
                      schedule: 'Every Sunday · 8:00 AM IST',
                      url: 'https://leetcode.com/contest/',
                      badge: 'Rated'
                    },
                    {
                      platform: 'LeetCode',
                      name: 'Biweekly Contest',
                      schedule: 'Alternate Saturdays · 8:00 PM IST',
                      url: 'https://leetcode.com/contest/',
                      badge: 'Rated'
                    },
                    {
                      platform: 'Codeforces',
                      name: 'Div. 2 / Div. 3 Rounds',
                      schedule: 'Weekly Slots · 8:05 PM IST',
                      url: 'https://codeforces.com/contests',
                      badge: 'Algorithmic'
                    },
                    {
                      platform: 'CodeChef',
                      name: 'Starters Contest',
                      schedule: 'Every Wednesday · 8:00 PM IST',
                      url: 'https://www.codechef.com/contests',
                      badge: 'Fast'
                    }
                  ].map((contest, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between rounded-2xl border border-themeBorder bg-themeCard/40 p-4 hover:border-themeAccent/40 transition-all"
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <b className="text-xs font-bold">{contest.platform} {contest.name}</b>
                          <span className="text-[10px] font-semibold bg-themeAccent/10 text-themeAccent px-2 py-0.5 rounded-md">
                            {contest.badge}
                          </span>
                        </div>
                        <p className="mt-1 text-xs text-themeTextSecondary">{contest.schedule}</p>
                      </div>

                      <a
                        href={contest.url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 rounded-xl bg-themeAccent/10 px-3 py-1.5 text-xs font-semibold text-themeAccent hover:bg-themeAccent hover:text-white transition-all shrink-0"
                      >
                        Register <ArrowUpRight size={13} />
                      </a>
                    </div>
                  ))}
                </div>
              </section>

              {/* Email Notifications & Drive Alerts */}
              <section className={card}>
                <div className="flex items-center gap-3 mb-4">
                  <Bell className="text-themeAccent" size={22} />
                  <div>
                    <h2 className="text-base font-bold">Placement Inboxes & Alerts</h2>
                    <p className="text-xs text-themeTextSecondary">Curate opportunities from selected senders</p>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="flex items-center justify-between rounded-2xl border border-themeBorder bg-themeCard/40 p-3.5">
                    <div>
                      <b className="text-xs font-bold block">Opportunity Radar</b>
                      <span className="text-[11px] text-themeTextSecondary">Filter hiring drives and hackathons</span>
                    </div>
                    <button
                      onClick={() => setEmailSyncEnabled(!emailSyncEnabled)}
                      className={`h-6 w-11 rounded-full p-0.5 transition-colors ${
                        emailSyncEnabled ? 'bg-themeAccent' : 'bg-slate-300 dark:bg-slate-700'
                      }`}
                    >
                      <div
                        className={`h-5 w-5 rounded-full bg-white transition-transform ${
                          emailSyncEnabled ? 'translate-x-5' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-themeTextSecondary block">
                      Tracked Service Senders:
                    </label>
                    {[
                      { key: 'unstop', label: 'Unstop (Hiring Challenges & Hackathons)' },
                      { key: 'naukri', label: 'Naukri.com (Campus Drives & SDE Openings)' },
                      { key: 'internshala', label: 'Internshala (Software Engineering Internships)' },
                      { key: 'leetcode_contests', label: 'LeetCode (Weekly Contest Reminders)' }
                    ].map(sender => (
                      <label
                        key={sender.key}
                        className="flex items-center gap-2.5 rounded-xl border border-themeBorder bg-themeCard/30 px-3 py-2 text-xs cursor-pointer hover:border-themeAccent/40 transition-all"
                      >
                        <input
                          type="checkbox"
                          checked={trackedSenders[sender.key] ?? false}
                          onChange={e =>
                            setTrackedSenders({ ...trackedSenders, [sender.key]: e.target.checked })
                          }
                          className="rounded text-themeAccent focus:ring-0"
                        />
                        <span className="font-medium text-xs">{sender.label}</span>
                      </label>
                    ))}
                  </div>

                  {/* Sample Opportunity Highlights */}
                  <div className="mt-4 pt-4 border-t border-themeBorder space-y-2">
                    <span className="text-[11px] font-bold text-themeTextSecondary uppercase tracking-wider block">
                      Latest Detected Opportunities
                    </span>
                    <div className="rounded-xl border border-themeBorder bg-themeCard/40 p-3 text-xs">
                      <b className="block text-themeAccent font-semibold">TCS National Qualifier Test (NQT)</b>
                      <p className="text-[11px] text-themeTextSecondary mt-0.5">Registration window open for 2026 Batch</p>
                    </div>
                    <div className="rounded-xl border border-themeBorder bg-themeCard/40 p-3 text-xs">
                      <b className="block text-themeAccent font-semibold">Amazon Future Engineer Hiring</b>
                      <p className="text-[11px] text-themeTextSecondary mt-0.5">Application deadline approaching on Unstop</p>
                    </div>
                  </div>
                </div>
              </section>
            </div>
          </div>
        )}

        {/* ── RESUME SCORER TAB ───────────────────────────────────────────────────── */}
        {section === 'resume' && (
          <div className="space-y-6">
            <div className="grid gap-6 lg:grid-cols-[.9fr_1.1fr]">
              {/* Upload Zone */}
              <section className={card}>
                <div className="flex items-center gap-3 mb-4">
                  <FileText className="text-themeAccent" size={24} />
                  <div>
                    <h2 className="text-base font-bold">AI Resume Review & ATS Scorer</h2>
                    <p className="text-xs text-themeTextSecondary">
                      Evaluated by Groq LLM against top campus placement benchmarks
                    </p>
                  </div>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="text-xs font-semibold text-themeTextSecondary">Target Role</label>
                    <input
                      className="mt-1 w-full rounded-xl border border-themeBorder bg-themeBg px-3.5 py-2 text-xs focus:outline-none focus:border-themeAccent"
                      value={targetRole}
                      onChange={e => setTargetRole(e.target.value)}
                      placeholder="e.g. Software Development Engineer"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-themeTextSecondary block mb-1.5">
                      Upload Resume PDF
                    </label>
                    <label className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-themeBorder bg-themeCard/40 p-6 text-center cursor-pointer hover:border-themeAccent transition-all">
                      <Upload size={24} className="text-themeAccent mb-2" />
                      <span className="text-xs font-semibold">
                        {resumeFile ? resumeFile.name : 'Choose PDF resume or drag here'}
                      </span>
                      <span className="text-[10px] text-themeTextSecondary mt-1">
                        In-memory evaluation · Never saved to physical disk
                      </span>
                      <input
                        type="file"
                        accept="application/pdf"
                        className="hidden"
                        onChange={e => e.target.files?.[0] && setResumeFile(e.target.files[0])}
                      />
                    </label>
                  </div>

                  {resumeError && (
                    <p className="text-xs text-red-500 font-semibold">{resumeError}</p>
                  )}

                  <button
                    onClick={evaluateResume}
                    disabled={!resumeFile || resumeEvaluating}
                    className={`${actionBtn} w-full justify-center py-3`}
                  >
                    {resumeEvaluating ? (
                      <>
                        <RefreshCw size={14} className="animate-spin" /> Analyzing with Groq LLM…
                      </>
                    ) : (
                      <>
                        <Sparkles size={14} /> Score My Resume
                      </>
                    )}
                  </button>
                </div>
              </section>

              {/* Score & Verdict Card */}
              <section className={`${card} flex flex-col justify-center items-center text-center`}>
                {resumeReport ? (
                  <div className="w-full space-y-4">
                    <span className="text-xs font-bold uppercase tracking-widest text-themeAccent">
                      ATS Readiness Score
                    </span>
                    <div className="text-6xl font-black text-themeAccent">
                      {resumeReport.ats_score}
                      <span className="text-xl text-themeTextSecondary font-normal">/100</span>
                    </div>
                    <span className="inline-block rounded-full bg-themeAccent/15 px-3.5 py-1 text-xs font-bold text-themeAccent">
                      {resumeReport.verdict}
                    </span>

                    {/* Category Breakdown */}
                    <div className="grid grid-cols-2 gap-2.5 mt-4 text-left">
                      {Object.entries(resumeReport.category_scores || {}).map(([cat, val]) => (
                        <div key={cat} className="rounded-2xl border border-themeBorder bg-themeCard/40 p-3">
                          <span className="text-[10px] uppercase font-bold text-themeTextSecondary block capitalize">
                            {cat.replace('_', ' ')}
                          </span>
                          <b className="text-base font-extrabold">{val}%</b>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-10">
                    <Sparkles size={36} className="text-themeAccent/30 mx-auto mb-3" />
                    <p className="text-xs text-themeTextSecondary max-w-xs">
                      Upload your resume PDF to receive an instant ATS score, category breakdown, and STAR bullet rewrites.
                    </p>
                  </div>
                )}
              </section>
            </div>

            {/* Resume Insights & STAR Rewrites */}
            {resumeReport && (
              <div className="space-y-6">
                <div className="grid gap-6 md:grid-cols-2">
                  <section className={card}>
                    <h3 className="font-bold text-sm mb-3 flex items-center gap-2">
                      <CheckCircle2 size={16} className="text-emerald-500" /> Key Strengths
                    </h3>
                    <ul className="space-y-2">
                      {resumeReport.strengths.map((str, idx) => (
                        <li key={idx} className="text-xs text-themeTextSecondary flex items-start gap-2">
                          <span className="text-emerald-500 font-bold">✓</span> {str}
                        </li>
                      ))}
                    </ul>
                  </section>

                  <section className={card}>
                    <h3 className="font-bold text-sm mb-3 flex items-center gap-2">
                      <AlertTriangle size={16} className="text-amber-500" /> Priority Improvements
                    </h3>
                    <ul className="space-y-2">
                      {resumeReport.improvements.map((imp, idx) => (
                        <li key={idx} className="text-xs text-themeTextSecondary flex items-start gap-2">
                          <span className="text-amber-500 font-bold">!</span> {imp}
                        </li>
                      ))}
                    </ul>
                  </section>
                </div>

                {/* STAR Method Bullet Rewrites */}
                {resumeReport.bullet_rewrites?.length > 0 && (
                  <section className={card}>
                    <h3 className="font-bold text-base mb-4">STAR-Method Bullet Polish</h3>
                    <div className="space-y-4">
                      {resumeReport.bullet_rewrites.map((rw, i) => (
                        <div key={i} className="rounded-2xl border border-themeBorder bg-themeCard/40 p-4 space-y-2">
                          <div>
                            <span className="text-[10px] font-bold text-red-500 uppercase">Original Bullet:</span>
                            <p className="text-xs text-themeTextSecondary mt-0.5">{rw.original}</p>
                          </div>
                          <div className="pt-2 border-t border-themeBorder/60">
                            <span className="text-[10px] font-bold text-emerald-600 uppercase">STAR Rewritten Bullet:</span>
                            <p className="text-xs font-semibold text-themeTextPrimary mt-0.5">{rw.improved}</p>
                          </div>
                          <p className="text-[11px] text-themeAccent font-medium pt-1">💡 Recruiter Impact: {rw.reason}</p>
                        </div>
                      ))}
                    </div>
                  </section>
                )}

                {/* Custom Interview Questions for Candidate */}
                {resumeReport.custom_interview_questions?.length > 0 && (
                  <section className={card}>
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="font-bold text-base">Custom Mock Interview Questions</h3>
                      <button
                        onClick={() =>
                          onOpenAssistant(
                            `Conduct a mock interview for the role of ${targetRole} based on my resume projects and questions: ${resumeReport.custom_interview_questions.join(
                              '; '
                            )}`
                          )
                        }
                        className={actionBtn}
                      >
                        <MessageSquare size={14} /> Practice with AI Assistant
                      </button>
                    </div>

                    <div className="space-y-2.5">
                      {resumeReport.custom_interview_questions.map((q, idx) => (
                        <div
                          key={idx}
                          className="flex items-start justify-between gap-3 rounded-2xl border border-themeBorder bg-themeCard/40 p-3.5 hover:border-themeAccent/40 transition-all"
                        >
                          <span className="text-xs text-themeTextPrimary font-medium">
                            {idx + 1}. {q}
                          </span>
                          <button
                            onClick={() => onOpenAssistant(`Explain the best way to answer this interview question: "${q}"`)}
                            className="text-xs text-themeAccent font-semibold shrink-0 hover:underline"
                          >
                            Ask AI →
                          </button>
                        </div>
                      ))}
                    </div>
                  </section>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── SETTINGS TAB ────────────────────────────────────────────────────────── */}
        {section === 'settings' && (
          <section className={`${card} max-w-2xl`}>
            <Settings className="mb-4 text-themeAccent" size={24} />
            <h2 className="text-lg font-bold">Account Settings</h2>
            {user ? (
              <>
                <div className="mt-5 flex items-center gap-3">
                  {user.picture ? (
                    <img className="h-12 w-12 rounded-full" src={user.picture} alt="" />
                  ) : (
                    <div className="h-12 w-12 rounded-full bg-themeAccent text-white flex items-center justify-center font-bold">
                      {user.name?.[0]}
                    </div>
                  )}
                  <div>
                    <p className="font-bold text-sm">{user.name}</p>
                    <p className="text-xs text-themeTextSecondary">{user.email}</p>
                  </div>
                </div>
                <button
                  className="mt-6 inline-flex items-center gap-2 rounded-xl border border-themeBorder px-4 py-2 text-xs font-semibold hover:border-red-300 hover:text-red-600 transition-all"
                  onClick={logout}
                >
                  <LogOut size={14} /> Sign out
                </button>
              </>
            ) : (
              <div className="mt-4">
                <p className="text-xs text-themeTextSecondary">
                  You are using Placement-Prep in guest mode. Sign in to synchronize your GitHub and LeetCode activity across devices.
                </p>
                <button className={`${actionBtn} mt-4`} onClick={() => setShowLogin(true)}>
                  Sign In with Google
                </button>
              </div>
            )}
          </section>
        )}
      </main>
    </div>
  );
}
