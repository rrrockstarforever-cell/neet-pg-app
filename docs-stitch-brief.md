# NEET PG Prep: Stitch Redesign Brief

Source: `app-extracted/` (v0.3.8, Electron + built React/Vite frontend). Items marked **[inferred]** come from the minified bundle and strings, not from source. Confirm them by screenshotting the running app before generating screens.

## 1. Product
- **Name:** NEET PG Prep (also covers INI-CET)
- **Purpose:** Exam preparation for NEET-PG / INI-CET medical postgraduate entrance candidates (Indian medical graduates).
- **Platform:** Windows desktop app (Electron wrapper), dark-friendly, 1366x768 to 1920x1080 target, keyboard-friendly.
- **Users:** Medical graduates studying for high-stakes exams, often long sessions, many hours per day.

## 2. Design Direction (from owner)
- Manga-style visual study materials: **illustrated characters and panels**, not text-only or emoji-based layouts.
- Use illustrated mascot/character accents (study companion, mentor, mascot per subject), comic-panel layouts for content sections, speech-bubble style hints or callouts for tips and mnemonics.
- Medical subject imagery (anatomy, organs, pathology) should be illustrated, not photographic.
- Calm, low-fatigue palette for long study sessions. Offer light and dark themes.
- Keep text readable: high contrast, clear hierarchy, generous line height for medical terminology.

## 3. Screens and Features

| Screen / area | What it does | Source hint |
|---|---|---|
| Sign-in / Account | Sign-in with AI providers (Codex, xAI, Claude) via device or code flow, pending/complete states | `oauth.mjs`, string "Sign in", "Login" |
| Home / Dashboard **[inferred]** | Entry point: subjects, progress, continue-where-left-off | "Progress" |
| Subject list | Subjects such as Forensic Medicine, Obstetrics & Gynaecology, and others | "Subject", bundle strings |
| Library | Study documents, cards for each document, figures, index of chapters | "Library" x11, `doc-card`, `index-row`, `index-line`, `fig-img` |
| PDF reader | Page sheets, toolbar, zoom/page controls | `pdf-toolbar`, `pdf-sheet`, `pdfpage-sheet` |
| Chapter index | Expandable index rows and chevrons | `index-row`, `index-chev` |
| Mock tests / MCQ practice | Question with options, "Your answer", explanation panel, Mixed mode, timer, results | "Mock" x12, "Practice", "Timer", "Result", `mcq-opt`, `mcq-exp` |
| Key points | Concise bullet summaries per topic | `key-points` |
| Notes | Personal notes | "Notes" x8 |
| Search | Global search across library and questions | "Search" x8, `sel-input` |
| Import | Import PDFs / documents, OCR (Tesseract, English traineddata) | "Import" x5, `tess/`, `tessdata/` |
| AI Ask / Chat | Ask an AI assistant about a topic, with answer streaming | "Ask" x7, `/oauth/chat` |
| Web research | Pull online references for a query | `/web/research` |
| Settings | Themes, provider accounts, sign out per provider, preferences | "Settings" x14 |
| Study timer / session controls | Focus timer, Pomodoro-style **[inferred]** | "Timer" |
| Blocklist (Focus mode) | Blocks distracting sites during study; list of domains. Surface as a "Focus Mode" toggle. | `electron/blocklist.json` |

Reusable components: `toggle-button`, `icon-btn`, `nav-item` (sidebar), `section-head`, `mp-row`/`mp-search`/`mp-btn`/`mp-foot` (a list-panel pattern), `doc-card`.

## 4. Constraints for the New Design
- Must keep working with the existing local API routes:
  - `POST /api/oauth/start`, `POST /api/oauth/complete`, `POST /api/oauth/logout`, `POST /api/oauth/chat`, `GET /api/oauth/status`, `GET /api/oauth/poll`, `POST /api/web/research`
- Sign-in flows must still show device codes or a paste-code step, and the pending state needs a visible spinner.
- PDF viewing and OCR text selection must remain usable.
- The window is a fixed desktop Electron window: no mobile breakpoints needed, but support window resizing down to about 1024 px wide.
- Do not depend on external fonts loaded from CDNs that may be blocked in a desktop sandbox; bundle fonts locally.

## 5. Prompts to Paste into Stitch

**Master prompt (run first):**
> Design a Windows desktop study app called "NEET PG Prep" for medical graduates preparing for the NEET-PG exam. Use a manga-inspired visual style: illustrated mascot characters, comic-panel layouts for topic sections, speech-bubble callouts for tips and mnemonics, and illustrated medical subject icons (no emoji). Support light and dark themes with a calm, low-fatigue palette and high-contrast readable text. Desktop window, sidebar navigation, 1440x900. Include a left sidebar with Home, Library, Practice, Notes, Search, Settings, and a Focus Mode toggle.

**Screen prompts (one per screen):**
1. **Home dashboard:** "Dashboard with a greeting from an illustrated study mascot, a 'Continue where you left off' panel, subject tiles (Forensic Medicine, Obstetrics & Gynaecology, ...) each with an illustrated icon and progress bar, and a daily-goal ring."
2. **Library:** "Library grid of study document cards with illustrated thumbnails, a chapter index sidebar with expandable rows, and a search bar at top."
3. **PDF reader:** "Document reader with a comic-style page frame, a slim toolbar (zoom, page number, highlight, bookmark), and a floating 'Ask AI' button."
4. **MCQ practice:** "MCQ screen: question card in a manga panel, four option buttons (A-D), a timer in the corner, a 'Your answer' feedback state, and an expandable explanation panel with key points."
5. **Mock test results:** "Results page with score ring, subject-wise breakdown bars, and a mascot reaction illustration."
6. **AI Ask / chat:** "Chat panel with speech-bubble messages, citation chips, and a provider badge (Codex / xAI / Claude)."
7. **Sign-in / provider accounts:** "Account page with provider cards (Codex, xAI, Claude), status pills (connected / pending / not connected), a device-code panel with copy button, and a paste-code field."
8. **Settings:** "Settings with sections: Appearance (light/dark, accent color), Study (timer length, daily goal), Focus Mode (blocked sites list), Accounts, About."
9. **Import:** "Import screen with drag-and-drop zone for PDFs, OCR progress bar, and an imported files list."

## 6. Next Steps
1. Screenshot the running app's screens and confirm the **[inferred]** items.
2. Run the master prompt in Stitch, then the screen prompts.
3. Export each screen as HTML/CSS (Tailwind) and the design system as DESIGN.md.
4. Rebuild the React components from the exports and wire them to the API routes above.
