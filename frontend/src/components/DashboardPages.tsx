import React, { useEffect, useState } from 'react';
import { Activity, BookOpen, Code2, GitBranch, LayoutDashboard, LogOut, RefreshCw, Settings, Sparkles, ExternalLink, Save, Trash2 } from 'lucide-react';
import type { GoogleUser } from '../hooks/useAuth';
import { AuthModal } from './AuthModal';

const API = import.meta.env.VITE_API_URL || 'https://placementpreprag.onrender.com';
export type DashboardSection = 'overview' | 'github' | 'leetcode' | 'settings';

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
  contribution_data_available?: boolean;
  contribution_data_limited?: boolean;
  synced_at?: string;
  cached?: boolean;
  stale?: boolean;
};
type LCStats = { profile_url: string; easy: number; medium: number; hard: number; updated_at: string };

interface Props {
  section: DashboardSection;
  onSectionChange: (section: DashboardSection) => void;
  onOpenAssistant: () => void;
  user: GoogleUser | null;
  login: (user: GoogleUser) => void;
  logout: () => void;
  showLogin: boolean;
  setShowLogin: (show: boolean) => void;
}

export function DashboardPages({ section, onSectionChange, onOpenAssistant, user, login, logout, showLogin, setShowLogin }: Props) {
  const [github, setGithub] = useState<GitHubData | null>(null);
  const [leetcode, setLeetcode] = useState<LCStats | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [profileUrl, setProfileUrl] = useState('');
  const [counts, setCounts] = useState({ easy: '0', medium: '0', hard: '0' });

  const headers: Record<string, string> = user ? { Authorization: `Bearer ${user.token}` } : {};
  const loadGitHub = async (refresh = false) => {
    if (!user) return;
    const response = await fetch(`${API}/integrations/github${refresh ? '?refresh=true' : ''}`, { headers });
    const data = await response.json();
    if (!response.ok) throw new Error(data.detail || 'Could not load GitHub data');
    setGithub(data);
  };
  const loadLeetCode = async () => {
    if (!user) return;
    const response = await fetch(`${API}/integrations/leetcode`, { headers });
    const data = await response.json();
    if (!response.ok) throw new Error(data.detail || 'Could not load LeetCode stats');
    setLeetcode(data.stats || null);
    if (data.stats) {
      setProfileUrl(data.stats.profile_url);
      setCounts({ easy: String(data.stats.easy), medium: String(data.stats.medium), hard: String(data.stats.hard) });
    }
  };

  useEffect(() => {
    if (!user) return;
    const timer = window.setTimeout(() => {
      Promise.all([loadGitHub(), loadLeetCode()]).catch((error: unknown) => setNotice(error instanceof Error ? error.message : 'Could not load integration data'));
    }, 0);
    return () => window.clearTimeout(timer);
  // load functions intentionally follow account identity, not their local state setters.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.sub, user?.token]);

  useEffect(() => {
    const onOAuthComplete = (event: MessageEvent) => {
      if (event.origin !== window.location.origin || event.data?.type !== 'github-oauth-complete') return;
      setNotice(event.data.status === 'connected' ? 'GitHub connected.' : 'GitHub connection did not complete. Check your OAuth configuration and try again.');
      if (event.data.status === 'connected') loadGitHub(true).catch((error: unknown) => setNotice(error instanceof Error ? error.message : 'Could not load GitHub data'));
    };
    window.addEventListener('message', onOAuthComplete);
    return () => window.removeEventListener('message', onOAuthComplete);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.sub, user?.token]);

  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    const status = query.get('github_oauth');
    if (!status) return;
    window.opener?.postMessage({ type: 'github-oauth-complete', status }, window.location.origin);
    window.history.replaceState({}, '', window.location.pathname);
    if (window.opener) window.close();
  }, []);

  async function connectGitHub() {
    if (!user) { setShowLogin(true); return; }
    const popup = window.open('', 'github-oauth', 'popup,width=620,height=760');
    setBusy(true); setNotice('');
    try {
      const response = await fetch(`${API}/integrations/github/connect`, { method: 'POST', headers });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || 'Could not start GitHub connection');
      if (popup) popup.location.href = data.authorization_url;
      else window.location.href = data.authorization_url;
    } catch (error) {
      popup?.close();
      setNotice(error instanceof Error ? error.message : 'Could not start GitHub connection');
    } finally { setBusy(false); }
  }

  async function disconnectGitHub() {
    if (!user) return;
    setBusy(true);
    try {
      await fetch(`${API}/integrations/github`, { method: 'DELETE', headers });
      setGithub({ connected: false }); setNotice('GitHub disconnected.');
    } catch { setNotice('Could not disconnect GitHub. Try again.'); }
    finally { setBusy(false); }
  }

  async function saveLeetCode(event: React.FormEvent) {
    event.preventDefault();
    if (!user) { setShowLogin(true); return; }
    setBusy(true); setNotice('');
    try {
      const response = await fetch(`${API}/integrations/leetcode`, {
        method: 'PUT', headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ profile_url: profileUrl, easy: Number(counts.easy), medium: Number(counts.medium), hard: Number(counts.hard) }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || 'Could not save LeetCode stats');
      setLeetcode(data.stats); setNotice('LeetCode stats saved.');
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Could not save LeetCode stats'); }
    finally { setBusy(false); }
  }

  async function clearLeetCode() {
    if (!user) return;
    setBusy(true);
    try {
      await fetch(`${API}/integrations/leetcode`, { method: 'DELETE', headers });
      setLeetcode(null); setProfileUrl(''); setCounts({ easy: '0', medium: '0', hard: '0' }); setNotice('LeetCode stats removed.');
    } catch { setNotice('Could not remove LeetCode stats. Try again.'); }
    finally { setBusy(false); }
  }

  const nav = [
    { id: 'overview' as const, title: 'Overview', icon: LayoutDashboard },
    { id: 'github' as const, title: 'GitHub', icon: GitBranch },
    { id: 'leetcode' as const, title: 'LeetCode', icon: Code2 },
    { id: 'settings' as const, title: 'Settings', icon: Settings },
  ];
  const card = 'glass-panel rounded-3xl border border-themeBorder/70 p-6';
  const action = 'inline-flex items-center gap-2 rounded-xl bg-themeAccent px-4 py-2.5 text-sm font-bold text-white transition hover:brightness-110 disabled:opacity-50';

  return <div className="min-h-screen w-screen overflow-y-auto bg-themeBg p-4 text-themeTextPrimary md:p-8">
    <AuthModal isOpen={showLogin} onClose={() => setShowLogin(false)} user={user} onLoginSuccess={login} onLogout={logout} />
    <div className="mx-auto max-w-6xl">
      <header className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-tr from-themeAccent to-indigo-500"><Sparkles className="h-5 w-5 text-white" /></div>
          <div><h1 className="text-xl font-extrabold">PrepAI Dashboard</h1><p className="text-xs text-themeTextSecondary">Placement preparation workspace</p></div>
        </div>
        <button className={action} onClick={onOpenAssistant}><BookOpen size={16} /> AI Assistant</button>
      </header>
      <nav className="mb-8 flex flex-wrap gap-2">{nav.map(item => <button key={item.id} onClick={() => onSectionChange(item.id)} className={`inline-flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-semibold ${section === item.id ? 'border-themeAccent bg-themeAccent/15 text-themeTextPrimary' : 'border-themeBorder bg-themeCard/50 text-themeTextSecondary hover:text-themeTextPrimary'}`}><item.icon size={16} />{item.title}</button>)}</nav>
      {!user && <div className={`${card} mb-6 flex flex-wrap items-center justify-between gap-4`}><div><h2 className="font-bold">Sign in to connect your accounts</h2><p className="mt-1 text-sm text-themeTextSecondary">Your dashboard data is private to your account.</p></div><button className={action} onClick={() => setShowLogin(true)}>Sign in</button></div>}
      {notice && <div role="status" className="mb-5 rounded-xl border border-themeBorder bg-themeCard px-4 py-3 text-sm">{notice}</div>}

      {section === 'overview' && <>
        <div className={`${card} mb-6`}><p className="mb-2 text-xs font-bold uppercase tracking-[.18em] text-themeAccent">Your preparation hub</p><h2 className="text-3xl font-extrabold">{user ? `Welcome, ${user.name || 'back'}` : 'Build your placement routine'}</h2><p className="mt-2 max-w-2xl text-themeTextSecondary">Continue interview prep, keep your coding progress in view, and review your public development activity.</p><button className={`${action} mt-5`} onClick={onOpenAssistant}><Sparkles size={16} /> Ask the placement assistant</button></div>
        <div className="grid gap-5 md:grid-cols-2">
          <button onClick={() => onSectionChange('github')} className={`${card} text-left transition hover:border-themeAccent/60`}><GitBranch className="mb-4 text-themeAccent" /><h3 className="text-lg font-bold">GitHub</h3><p className="mt-1 text-sm text-themeTextSecondary">{github?.connected ? `Connected as @${github.profile?.login}` : 'Connect to see repositories and recent public activity.'}</p><span className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-themeAccent">Open GitHub <ExternalLink size={14} /></span></button>
          <button onClick={() => onSectionChange('leetcode')} className={`${card} text-left transition hover:border-themeAccent/60`}><Code2 className="mb-4 text-themeAccent" /><h3 className="text-lg font-bold">LeetCode</h3><p className="mt-1 text-sm text-themeTextSecondary">{leetcode ? `${leetcode.easy + leetcode.medium + leetcode.hard} problems recorded` : 'Add your solved counts to track coding practice.'}</p><span className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-themeAccent">Open LeetCode <ExternalLink size={14} /></span></button>
          <div className={`${card} md:col-span-2`}><div className="flex items-center gap-2"><Activity className="text-themeAccent" size={18} /><h3 className="font-bold">GitHub activity this year</h3></div>{github?.connected ? <div className="mt-3 flex flex-wrap gap-x-6 gap-y-2 text-sm text-themeTextSecondary"><span><b className="text-themeTextPrimary">{github.activity_totals?.commits ?? 0}</b> commits</span><span><b className="text-themeTextPrimary">{github.activity_totals?.pull_requests ?? 0}</b> pull requests</span><span><b className="text-themeTextPrimary">{github.activity_totals?.issues ?? 0}</b> issues</span><span>{github.recent_public_events ?? 0} recent public events</span></div> : <p className="mt-3 text-sm text-themeTextSecondary">Connect GitHub to see contribution totals and activity.</p>}</div>
        </div>
      </>}

      {section === 'github' && <div className="grid gap-5 lg:grid-cols-[.8fr_1.2fr]">
        <section className={card}><GitBranch className="mb-4 text-themeAccent" /><h2 className="text-xl font-bold">GitHub</h2><p className="mt-2 text-sm text-themeTextSecondary">Connect with read-only access to your profile, public repositories, and recent public activity. Your token is encrypted before storage.</p>
          {github?.connected ? <div className="mt-5 flex items-center gap-3">{github.profile?.avatar_url && <img src={github.profile.avatar_url} alt="" className="h-12 w-12 rounded-full" />}<div><b>{github.profile?.name}</b><p className="text-sm text-themeTextSecondary">@{github.profile?.login}</p></div></div> : null}
          {github?.connected ? <div className="mt-5 flex flex-wrap gap-2"><a className={action} href={github.profile?.html_url} target="_blank" rel="noreferrer">View profile <ExternalLink size={15} /></a><button className="rounded-xl border border-themeBorder px-4 py-2.5 text-sm" disabled={busy} onClick={disconnectGitHub}><Trash2 size={15} className="mr-2 inline" />Disconnect</button></div> : <button className={`${action} mt-5`} disabled={busy} onClick={connectGitHub}>{busy ? 'Connecting…' : 'Connect GitHub'}</button>}
          {github?.connected && <button className="mt-3 flex items-center gap-2 text-sm text-themeTextSecondary hover:text-themeTextPrimary" disabled={busy} onClick={() => loadGitHub(true).catch((e: Error) => setNotice(e.message))}><RefreshCw size={14} /> Refresh data</button>}
          <p className="mt-5 text-xs leading-relaxed text-themeTextSecondary">The contribution calendar and totals use GitHub’s contribution data. Recent commit details come from public events; private contribution counts depend on your GitHub profile setting. Disconnect removes the stored authorization.</p>
        </section>
        <section className={card}><div className="mb-4 flex items-center justify-between"><h2 className="text-xl font-bold">Recent public repositories</h2>{github?.cached && <span className="text-xs text-themeTextSecondary">{github.stale ? 'Showing saved data' : 'Cached'}</span>}</div>
          {!github?.connected ? <p className="text-sm text-themeTextSecondary">Connect GitHub to load repository details.</p> : !github.repositories?.length ? <p className="text-sm text-themeTextSecondary">No public repositories found.</p> : <div className="space-y-3">{github.repositories.map(repo => <a key={repo.url} href={repo.url} target="_blank" rel="noreferrer" className="block rounded-2xl border border-themeBorder bg-themeCard/50 p-4 hover:border-themeAccent/50"><div className="flex items-start justify-between gap-4"><div><h3 className="font-bold">{repo.name}</h3><p className="mt-1 text-sm text-themeTextSecondary">{repo.description || 'No description'}</p></div><ExternalLink size={15} className="shrink-0 text-themeAccent" /></div><p className="mt-3 text-xs text-themeTextSecondary">{repo.language || 'Unknown language'} · ★ {repo.stars} · Updated {repo.updated_at ? new Date(repo.updated_at).toLocaleDateString() : 'unknown'}</p></a>)}</div>}
        </section>
        {github?.connected && <section className={`${card} lg:col-span-2`}>
          <div className="flex flex-wrap items-end justify-between gap-3"><div><h2 className="text-xl font-bold">Contribution calendar</h2><p className="mt-1 text-sm text-themeTextSecondary">{github.activity_total ?? 0} contributions in the last year</p></div><div className="flex items-center gap-1.5 text-[10px] text-themeTextSecondary"><span>Less</span>{(github.activity_colors?.length ? github.activity_colors : ['#161b22', '#0e4429', '#006d32', '#26a641', '#39d353']).map(color => <span key={color} className="h-3 w-3 rounded-sm" style={{ backgroundColor: color }} />)}<span>More</span></div></div>
          {github.activity_weeks?.length ? <div className="mt-5 overflow-x-auto pb-2"><div className="flex min-w-max gap-1">{github.activity_weeks.map((week, weekIndex) => <div key={weekIndex} className="grid grid-rows-7 gap-1">{week.map((day, dayIndex) => <span key={`${day.date}-${dayIndex}`} title={`${day.date}: ${day.count} contributions`} aria-label={`${day.date}: ${day.count} contributions`} className="h-3 w-3 rounded-[3px]" style={{ backgroundColor: day.color }} />)}</div>)}</div></div> : <p className="mt-5 text-sm text-themeTextSecondary">{github.contribution_data_limited ? 'Contribution calendar is temporarily unavailable; public repository activity is still shown.' : 'No contribution calendar data was returned.'}</p>}
          {github.contribution_data_limited && <p className="mt-2 text-xs text-themeTextSecondary">Some GitHub contribution data could not be loaded. Try refreshing.</p>}
        </section>}
        {github?.connected && <section className={card}><h2 className="mb-4 text-xl font-bold">Recent pull requests</h2>{github.pull_requests?.length ? <div className="space-y-3">{github.pull_requests.map(pr => <a key={pr.url} href={pr.url} target="_blank" rel="noreferrer" className="block rounded-2xl border border-themeBorder bg-themeCard/50 p-4 hover:border-themeAccent/50"><div className="flex justify-between gap-3"><b className="text-sm">{pr.title}</b><ExternalLink size={14} className="shrink-0 text-themeAccent" /></div><p className="mt-2 text-xs capitalize text-themeTextSecondary">{pr.repository} · {pr.state} · {pr.occurred_at ? new Date(pr.occurred_at).toLocaleDateString() : ''}</p></a>)}</div> : <p className="text-sm text-themeTextSecondary">No pull requests found in the recent contribution window.</p>}</section>}
        {github?.connected && <section className={card}><h2 className="mb-4 text-xl font-bold">Recent public commits</h2>{github.recent_commits?.length ? <div className="space-y-3">{github.recent_commits.map((commit, index) => <a key={`${commit.sha}-${index}`} href={commit.url} target="_blank" rel="noreferrer" className="block rounded-2xl border border-themeBorder bg-themeCard/50 p-4 hover:border-themeAccent/50"><b className="block truncate text-sm">{commit.message || 'Commit'}</b><p className="mt-2 text-xs text-themeTextSecondary">{commit.repository} · {commit.sha} · {commit.occurred_at ? new Date(commit.occurred_at).toLocaleDateString() : ''}</p></a>)}</div> : <p className="text-sm text-themeTextSecondary">No recent public commit events found.</p>}</section>}
      </div>}

      {section === 'leetcode' && <div className="grid gap-5 md:grid-cols-2">
        <section className={card}><Code2 className="mb-4 text-themeAccent" /><h2 className="text-xl font-bold">LeetCode progress</h2><p className="mt-2 text-sm leading-relaxed text-themeTextSecondary">Enter the counts from your LeetCode profile. LeetCode does not provide a supported public API for this dashboard, so these figures are saved as self-reported and are never scraped.</p>
          <form className="mt-6 space-y-4" onSubmit={saveLeetCode}><label className="block text-sm font-semibold">Profile URL<input className="mt-1.5 w-full rounded-xl border border-themeBorder bg-themeBg px-3 py-2.5 text-sm" value={profileUrl} onChange={e => setProfileUrl(e.target.value)} placeholder="https://leetcode.com/u/your-name/" required /></label><div className="grid grid-cols-3 gap-3">{(['easy', 'medium', 'hard'] as const).map(level => <label key={level} className="text-sm font-semibold capitalize">{level}<input type="number" min="0" max="100000" className="mt-1.5 w-full rounded-xl border border-themeBorder bg-themeBg px-3 py-2.5" value={counts[level]} onChange={e => setCounts({ ...counts, [level]: e.target.value })} /></label>)}</div><div className="flex flex-wrap gap-2"><button className={action} disabled={busy}><Save size={15} />Save progress</button>{leetcode && <button type="button" className="rounded-xl border border-themeBorder px-4 py-2.5 text-sm" disabled={busy} onClick={clearLeetCode}>Remove data</button>}</div></form>
        </section>
        <section className={`${card} flex flex-col justify-center`}><p className="text-xs font-bold uppercase tracking-[.18em] text-themeAccent">Your saved totals</p><div className="my-5 text-5xl font-extrabold">{leetcode ? leetcode.easy + leetcode.medium + leetcode.hard : 0}</div><p className="text-sm text-themeTextSecondary">Problems marked solved · self-reported</p><div className="mt-6 grid grid-cols-3 gap-3">{(['easy', 'medium', 'hard'] as const).map(level => <div key={level} className="rounded-2xl border border-themeBorder bg-themeCard/60 p-4"><p className="text-xs capitalize text-themeTextSecondary">{level}</p><b className="mt-1 block text-2xl">{leetcode?.[level] ?? 0}</b></div>)}</div>{leetcode?.updated_at && <p className="mt-4 text-xs text-themeTextSecondary">Updated {new Date(leetcode.updated_at).toLocaleString()}</p>}</section>
      </div>}

      {section === 'settings' && <section className={`${card} max-w-2xl`}><Settings className="mb-4 text-themeAccent" /><h2 className="text-xl font-bold">Account settings</h2>{user ? <><div className="mt-5 flex items-center gap-3">{user.picture && <img className="h-12 w-12 rounded-full" src={user.picture} alt="" />}<div><p className="font-bold">{user.name}</p><p className="text-sm text-themeTextSecondary">{user.email}</p></div></div><button className="mt-6 inline-flex items-center gap-2 rounded-xl border border-themeBorder px-4 py-2.5 text-sm" onClick={logout}><LogOut size={15} />Sign out</button></> : <p className="mt-3 text-sm text-themeTextSecondary">You are using the dashboard without an account. Sign in to save integrations to your profile.</p>}</section>}
      <footer className="mt-8 flex items-center gap-2 text-xs text-themeTextSecondary"><Activity size={14} /> Dashboard data is scoped to your signed-in account.</footer>
    </div>
  </div>;
}
