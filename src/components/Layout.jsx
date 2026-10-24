import { NavLink, useNavigate } from 'react-router-dom';
import { useState } from 'react';

export const NAV_ITEMS = [
  ['/library', 'menu_book', 'Library (PDF & Books)'],
  ['/ai', 'psychology', 'AI Knowledge Engine'],
  ['/index', 'view_list', 'Medical Index & Topics'],
  ['/practice', 'quiz', 'Practice & Modules'],
  ['/test', 'assignment_turned_in', 'Test Runner & Exam'],
  ['/mistakes', 'edit_note', 'Mistake Notebook & Review'],
  ['/progress', 'analytics', 'Performance Analytics'],
  ['/highlights', 'bookmarks', 'Highlights & Saved'],
  ['/browser', 'upload_file', 'Clinical Browser'],
  ['/settings', 'tune', 'Settings & AI Engine'],
];

const item = 'flex items-center gap-space-md px-space-md py-space-sm rounded-lg transition-colors';

export default function Layout({ title, subtitle, actions, children }) {
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  return (
    <div className="bg-background font-body-compact text-on-surface antialiased min-h-screen">
      <aside className="fixed left-0 top-0 h-full w-64 bg-surface-container-low shadow-[0_1px_8px_rgba(0,0,0,0.04)] z-50 flex flex-col">
        <div className="p-space-lg flex items-center gap-space-sm">
          <div className="w-9 h-9 rounded-lg bg-primary-container text-on-primary flex items-center justify-center">
            <span className="material-symbols-outlined text-[20px]">ecg_heart</span>
          </div>
          <div className="flex flex-col">
            <span className="font-headline-h2 text-headline-h2 tracking-tight text-primary leading-none">NEET PG Prep</span>
            <span className="font-badge-label text-badge-label uppercase text-on-surface-variant tracking-wider mt-space-xs">NEET PG · INI-CET</span>
          </div>
        </div>
        <nav className="flex flex-col px-space-md gap-space-xs pb-space-lg overflow-y-auto">
          {NAV_ITEMS.map(([to, icon, label]) => (
            <NavLink key={to} to={to}
              className={({ isActive }) => `${item} ${isActive ? 'bg-primary-container text-on-primary font-bold' : 'text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface'}`}>
              <span className="material-symbols-outlined text-[20px]">{icon}</span>
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>
      </aside>
      <div className="pl-64">
        <header className="fixed top-0 left-64 right-0 h-16 bg-surface-container-lowest/90 backdrop-blur-xl shadow-[0_1px_8px_rgba(0,0,0,0.04)] z-40 flex items-center px-gutter-desktop">
          <form className="flex items-center flex-1 max-w-xl" onSubmit={(e) => { e.preventDefault(); navigate('/search?q=' + encodeURIComponent(q)); }}>
            <div className="w-full flex items-center bg-surface-container-low rounded-lg px-space-md py-space-xs gap-space-sm">
              <span className="material-symbols-outlined text-[20px] text-on-surface-variant">search</span>
              <input value={q} onChange={(e) => setQ(e.target.value)} type="search" placeholder="Search your library, questions and notes..."
                className="w-full bg-transparent border-none outline-none font-body-compact text-body-compact text-on-surface placeholder:text-on-surface-variant" />
            </div>
          </form>
        </header>
        <main className="w-full pt-16 bg-background px-gutter-desktop min-h-screen">
          <div className="flex flex-col w-full pb-margin-desktop gap-space-xl pt-space-xl">
            <div className="flex items-center justify-between gap-space-md">
              <div>
                <h1 className="font-headline-h1 text-headline-h1 text-primary tracking-tight">{title}</h1>
                {subtitle && <p className="font-body-compact text-body-compact text-on-surface-variant mt-0.5">{subtitle}</p>}
              </div>
              {actions}
            </div>
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}

export const card = 'bg-surface-container-lowest rounded-xl p-space-xl shadow-sm flex flex-col gap-space-md border border-outline-variant/40';
export const btnPrimary = 'flex items-center gap-space-xs bg-secondary text-on-secondary px-space-lg py-space-sm rounded-lg font-caption-meta text-caption-meta font-bold hover:brightness-110 disabled:opacity-50';
export const btnGhost = 'flex items-center gap-space-xs bg-surface-container-lowest border border-outline-variant px-space-lg py-space-sm rounded-lg font-caption-meta text-caption-meta font-bold text-on-surface hover:border-secondary disabled:opacity-50';
export const input = 'w-full bg-surface-container-lowest border border-outline-variant rounded-lg px-space-md py-space-sm font-body-compact text-body-compact outline-none focus:border-secondary';
