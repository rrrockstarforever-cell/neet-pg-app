import { useEffect } from 'react';
import { Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import meta from './screens.meta.json';

const modules = import.meta.glob('./screens/*.jsx', { eager: true });

// Route table: path -> generated screen component.
const ROUTES = {
  '/library': 'LibraryOcrKnowledge',
  '/ai': 'AiChatKnowledgeEngine',
  '/index': 'MasterMedicalIndexTopics',
  '/practice': 'PracticeModuleBuilder',
  '/test': 'TestRunnerActiveExam',
  '/mistakes': 'MistakeNotebookReview',
  '/progress': 'ClinicalProgressAccuracy',
  '/highlights': 'ClinicalHighlightsSavedPassages',
  '/browser': 'ClinicalResearchBrowser',
  '/settings': 'SettingsAiEngine',
  '/search': 'SemanticMedicalSearchSynonymEngine',
};

// Sidebar label (lower-case substring) -> path. Stitch exports every link as href="#".
const NAV = [
  ['library', '/library'],
  ['ai knowledge', '/ai'],
  ['ask your books', '/ai'],
  ['medical index', '/index'],
  ['practice', '/practice'],
  ['test runner', '/test'],
  ['mistake', '/mistakes'],
  ['performance', '/progress'],
  ['highlights', '/highlights'],
  ['clinical browser', '/browser'],
  ['settings', '/settings'],
  ['review solutions', '/mistakes'],
  ['review answers', '/mistakes'],
];

function Shell({ name }) {
  const mod = Object.entries(modules).find(([k]) => k.endsWith(`/${name}.jsx`))?.[1];
  const navigate = useNavigate();
  const { pathname } = useLocation();
  useEffect(() => { window.scrollTo(0, 0); }, [pathname]);
  if (!mod) return null;
  const Screen = mod.default;
  const onClick = (e) => {
    const a = e.target.closest('a');
    if (!a) return;
    const href = a.getAttribute('href');
    if (href && href !== '#') return;
    e.preventDefault();
    const label = a.textContent.toLowerCase();
    const hit = NAV.find(([k]) => label.includes(k));
    if (hit) navigate(hit[1]);
  };
  return (
    <div className={mod.bodyClass} style={{ minHeight: '100vh' }} onClick={onClick}>
      <Screen />
    </div>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/library" replace />} />
      {Object.entries(ROUTES).map(([path, name]) => (
        <Route key={path} path={path} element={<Shell name={name} />} />
      ))}
      <Route path="*" element={<Navigate to="/library" replace />} />
    </Routes>
  );
}
