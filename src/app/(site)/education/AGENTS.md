# Education

Rules for this area. The root `AGENTS.md` applies too.

## Education (`src/app/(site)/education/` - routes `/education`, `/education/[academy]/[course]/[module]/[lesson]`)
- **Academies** of courses → modules → lessons. First one: the **Entrepreneur Academy**, taken over from builders-hub (4 courses, 12 modules, 113 lessons; slugs unchanged, so `/academy/entrepreneur/*` there maps 1:1 to `/education/entrepreneur/*`). Content only - no badges, certificates or saved progress.
- **Content is files in git**, one folder per academy: `_content/<academy>/academy.json` (title, tagline, description + the tree courses → modules → lessons with title/description, in reading order), one plain `.md` per lesson, `quizzes.json`, `flashcards.json`. A lesson file must be listed in `academy.json` to exist. **Adding an academy:** a new folder + one entry in `ACADEMIES` (`_lib/content.ts`); `tests/education.test.ts` validates every folder automatically.
- Lesson Markdown is plain GFM - **no MDX, no raw HTML** (not rendered). Widgets are one-line directives: `::youtube[id]`, `::quiz[id]`, `::flashcards[set]` (`splitLesson`); they also set the lesson's icon (`lessonKind`). The test checks every file exists, every directive resolves and no HTML is left.
- Lesson bodies are read from disk per request (`readLesson`; directive counts once per process, `lessonCounts`); `outputFileTracingIncludes` in `next.config.ts` ships them in the standalone build. YouTube via `youtube-nocookie.com` (CSP `frame-src`).
- Quizzes grade client-side (`isCorrect`); "try another question" cycles the alternates (`quizVariant`); option order is a seeded shuffle (`optionOrder`, stable across SSR/hydration).
