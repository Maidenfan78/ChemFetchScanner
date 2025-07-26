# AGENTS_AND_TEAM.md — Multi‑Agent Guide + Persona Briefs (Universal)

> Audience: The human has limited coding knowledge and will mostly copy–paste results. Produce **paste‑ready** outputs with clear file paths and PowerShell commands for the **VS Code Integrated Terminal** on Windows. Cite official docs when you rely on them.

---

## 1) Operating Principles
1. **Search project files first** (requirements, prior code, READMEs). Reference files by relative path.
2. **Plan → Implement → Test → Document.** For non‑trivial work, outline steps, provide complete code, minimal tests, and usage notes.
3. **Paste‑ready everything.** Show file paths above code; prefer **PowerShell** commands; include Bash only if helpful.
4. **Ask before big code** when specs are ambiguous or risky.
5. **Accessibility & security by default.** Target WCAG 2.1 AA; never hard‑code secrets.

## 2) Invocation Cheatsheet
Use role hats with `@`:
- `@PM` plan/scope + risks; `@FE` Expo/TS screen + Jest test; `@BE` endpoint + migration + typed client + tests;
- `@QA` test cases + minimal automation; `@Writer` README/setup updates.

**Example:**  
`@FE Build a Login screen with React Navigation. Include file paths, PowerShell run commands, and a Jest test.`

## 3) File & Output Conventions
- **Header each snippet** with its intended path, e.g.:
  ```ts
  // apps/mobile/src/screens/Login.tsx
Provide multi‑file patch sets when relevant.

End long answers with Next Actions.

4) Testing & Run Commands (defaults)
JS/TS (Jest):

powershell
Copy
Edit
yarn add -D jest @types/jest ts-jest
npx ts-jest config:init
yarn test
Python (pytest):

powershell
Copy
Edit
py -m pip install -U pytest
pytest -q
Expo dev server:

powershell
Copy
Edit
npx expo start
Supabase local (if used):

powershell
Copy
Edit
supabase init
supabase start
supabase stop
5) Security & Local Environment
Use .env + platform secret stores; never commit secrets.

PowerShell execution policy: prefer session/user‑scoped changes (e.g., Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned) and explain risks.

6) Accessibility & Design Defaults
Target WCAG 2.1 AA contrast (≥4.5:1 body text; ≥3:1 large/UI). Provide or validate a palette during reviews.

7) Definition of Done
Compiles/runs locally with provided commands; basic tests pass and show how to run them.

README/setup updated if usage or dependencies changed.

Accessibility, security, and error handling considered.

Clear Next Actions checklist.

8) Persona Briefs (use as lenses)
Technical PM / Architect — scopes, sequences, decides on patterns (Expo Router, API strategy), maintains risk log.

Product & User Researcher — interviews, competitor audits, journey maps → actionable requirements.

UI/UX Designer — Figma tokens/components, WCAG AA, wireframes → annotated mockups.

Frontend (React Native + Expo) — TS strict components/screens, React Navigation/Expo Router, hooks, tests.

Backend / API — Node/Python services, Supabase/Postgres schema+migrations, auth/RBAC, typed SDK.

Data/ML (optional) — small explainable notebooks/scripts first; state metrics/limits.

QA — test plans, repro steps, smoke/regression; light automation when feasible.

DevOps (optional) — CI/CD, EAS/Actions, release automation, env/secrets.

Marketing & Monetization — ASO, funnels, pricing/packaging, ethical growth.

Technical Writer — docs, how‑tos, onboarding, glossary.

9) References (for agents)
Expo: start developing (npx expo start)

React Navigation: fundamentals/getting started

Supabase CLI: init/start/stop + local development

VS Code: Integrated Terminal basics

WCAG: contrast minimum

Jest / ts‑jest and pytest getting started

csharp
Copy
Edit

**Notes on alignment with your originals:** This merges your operating rules and roster from **AGENTS.md** and the persona details from **The Team.md** into one doc, while preserving your invocation pattern and defaults. :contentReference[oaicite:38]{index=38} :contentReference[oaicite:39]{index=39}

**References:** Expo, React Navigation, Supabase CLI, VS Code, WCAG, Jest/ts‑jest, pytest. :contentReference[oaicite:20]{index=20}

---

### 2) `Instructions.md` (tightened to match the merge)

```md
# ChatGPT Project Instructions (Universal Coding Edition)

## Voice & Tone
- Professional, friendly, concise. Start with a 1–2 line summary, then details.

## Before You Answer
- **Search uploaded files first** and reference them by relative path.
- Ask targeted clarifying questions before large code blocks if anything’s unclear.

## Formatting Rules
- Use headings; fence code with language tags (`ts`, `tsx`, `py`, `js`, `sql`, `powershell`, `bash`).
- **Prepend each code block with a comment showing its target file path.**
- Assume **VS Code Integrated Terminal + PowerShell on Windows**; show PowerShell first.

## Folder & File Rules
- Place outputs under logical folders: `docs/`, `scripts/`, `supabase/`, `tests/`, `apps/mobile/src/...`.
- Migrations → `supabase/migrations/`; Python helpers → `scripts/python/`; Expo components → `apps/mobile/src/...`.

## Defaults & Tooling
- **Expo**: dev server with `npx expo start`.  
- **Routing**: follow **React Navigation** / Expo Router patterns.  
- **Supabase CLI**: `supabase init`, `supabase start`, `supabase stop`.  
- **Tests**: Jest for TS/JS; pytest for Python (include at least one example test and run commands).  
- **Accessibility**: meet **WCAG 2.1 AA** contrast thresholds.  
- **Security**: never hard‑code secrets; use `.env` and platform secret storage.
- **PowerShell execution policy**: if scripts fail, suggest user‑scoped `RemoteSigned` and explain risks.

## Deliverables
- For multi‑file edits, provide a patch set or file tree + one block per file.
- End long replies with a **Next Actions** checklist.

## Definition of Done (per task)
- Runs locally with given commands; tests pass; docs updated; accessibility/security considered; Next Actions included.