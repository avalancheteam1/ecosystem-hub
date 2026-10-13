# Entrepreneur Academy

Status: implemented (2026-10-11) - `/education/entrepreneur`, no saved quiz progress, flashcards kept. See the Education section in AGENTS.md.

## Why

builders-hub had an Entrepreneur Academy, and we got permission to take it over completely. It fits the hub's education area. We only want the content: courses, lessons, videos and quizzes. Badges, certificates and the rest of builders-hub's academy machinery stay behind. builders-hub was slow to build mainly because of fumadocs + MDX across thousands of pages. This version avoids that on purpose.

## What the course is

Source: `~/git/builders-hub/content/academy/entrepreneur/`

- **4 courses / 11 modules / ~105 lessons**, ~20k words:
  - Foundations of a Web3 Venture: legal, security, business model canvas, user personas
  - Go-to-Market: GTM strategies, sales, pricing
  - Web3 Community Architect: community building, tokenomics
  - Fundraising & Finance: fundraising, grants, pitching
- No images. Lessons are prose plus a few MDX components:

| Component | Count | In the hub |
|---|---|---|
| `<YouTube id>` | 65 | small `youtube-nocookie` iframe |
| `<Callout>` | 29 | GFM alerts (`> [!NOTE]`); `react-markdown` + `remark-gfm` are already installed |
| `<Quiz quizId>` | 55 | data already JSON: `components/quizzes/data/courses/{foundations-web3-venture,go-to-market,web3-community-architect,fundraising-finance}.json` (question, options, `correctAnswers[]`, hint, explanation, alternates) |
| `<Flashcard flashcardSetId>` | 12 | data already JSON: `components/flashcards/flashcardData.json` |
| `<CertificatePage>` | 4 | dropped |

- The builders-hub quiz never saved progress. The only API calls came from the badge hook (`useBadgeAward`).

## Plan

1. **Content as files in git, not in the DB.** A one-off conversion script turns the MDX into plain `.md`:
   - front-matter: title, description, YouTube id
   - `<Callout>` → `> [!NOTE]`
   - inline styled `<p>` captions → plain Markdown
   - extract the 4 quiz JSONs + the entrepreneur flashcard sets
   - folder order (`01-…`) replaces fumadocs `meta.json` navigation
   - fix internal links (`/academy/entrepreneur/...` → new paths); drop certificate pages and "unlock the certificate" paragraphs
2. **One area**, `src/app/(site)/education/`, with one catch-all page `/education/entrepreneur/[course]/[module]/[lesson]`. It renders with the existing `<Markdown>` plus a hub-styled `Quiz` and `Flashcards` component (~150 lines each). `generateStaticParams` over ~105 lessons builds in seconds. A course index page lists modules and lessons.
3. **CSP**: `src/proxy.ts` has no `frame-src`, so add `frame-src https://www.youtube-nocookie.com` or the videos are blocked.
4. Add sitemap entries and a `CODEOWNERS` block. No DB, permissions or jobs in v1.
5. Test: a quiz grading rule (multi-answer = exact set match) in `tests/education.test.ts`. The conversion script checks that every `quizId` and flashcard set resolves.

Effort: ~1–2 days, mostly checking the conversion output.

## Open decisions

- **Quiz progress**: none (like builders-hub), `localStorage` (per browser), or a `QuizAttempt` table for signed-in users. Lean: none or `localStorage` for v1. A table only pays off if "completed the course" becomes a signal, e.g. on projects or grant applications.
- **Flashcards**: keep them or cut them? They're optional practice before each quiz; cutting them saves one component.
- **URL**: `/education/entrepreneur/...` (AGENTS.md's "education" area) or `/academy/...` (builders-hub's name, easier redirects).

## Out of scope

- Badges, certificates, learning-tree UI, OG images, admin editor. Edit content by PR on the Markdown.
- Other builders-hub academy courses (Avalanche L1, team1 member courses). Same pipeline later if wanted.
