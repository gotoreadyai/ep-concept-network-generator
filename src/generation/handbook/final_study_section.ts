// file: src/generation/handbook/final_study_section.ts
import { generateMarkdown } from '../../llm';

export type ChapterSummary = {
  index: number;
  title: string;
  keyEvents: string[]; // 2-3 kluczowe wydarzenia
  keyQuotes: string[]; // 1-2 parafrazy warte zapamiętania
};

/**
 * Linkuje wystąpienia "(Rozdział X)" -> "([Rozdział X](#ch-0X))"
 * Działa zachowawczo: tylko tam, gdzie jest dokładna fraza "Rozdział <liczba>" w nawiasie.
 */
function linkifyChapterRefs(md: string): string {
  return md.replace(/\(Rozdział\s+(\d{1,2})\)/g, (_m, n) => {
    const idx = Number(n);
    const id = `ch-${String(idx).padStart(2, '0')}`;
    return `([Rozdział ${idx}](#${id}))`;
  });
}

/** Panel tokenów do linkowania „Sekcji maturalnej” z poziomu rozdziału. */
export function buildStudyRefsPanelTokens(): string {
  return [
    '<!-- study-refs:panel:start -->',
    '[REF:STUDY:THESES]',
    '[REF:STUDY:MOTIFS]',
    '[REF:STUDY:CHARACTERS]',
    '[REF:STUDY:CONTEXTS]',
    '[REF:STUDY:QUESTIONS]',
    '[REF:STUDY:TOPSCENES]',
    '<!-- study-refs:panel:end -->',
    '',
  ].join('\n');
}

/** Krótki blok „odnośniki globalne” (opcjonalnie dopinany do głównego pliku handbooka). */
export function buildStudyRefsInline(): string {
  return [
    '<!-- study-refs:start -->',
    '➡️ **Sekcja maturalna:**',
    '- [Tezy główne](#study-theses)',
    '- [Motywy](#study-motifs)',
    '- [Postacie i relacje](#study-characters)',
    '- [Konteksty](#study-contexts)',
    '- [Pytania egzaminacyjne](#study-questions)',
    '- [Top 10 cytatów/scen](#study-topscenes)',
    '<!-- study-refs:end -->',
  ].join('\n');
}

function unwrapCodeFence(s: string) {
  const trimmed = s.replace(/\r/g, '').trim();
  const fenced = trimmed.match(/^```[a-zA-Z0-9-]*\n([\s\S]*?)\n```$/);
  if (fenced) return fenced[1].trim();
  return trimmed.replace(/^```[a-zA-Z0-9-]*\n?/, '').replace(/\n?```$/, '').trim();
}

/** Generuje CAŁĄ „Sekcję maturalną” jako zestaw bloków z kotwicami (#study-*) */
export async function generateFinalStudySection(
  workTitle: string,
  author: string,
  chapterSummaries: ChapterSummary[]
): Promise<string> {
  const prompt = [
    `Zwróć WYŁĄCZNIE czysty Markdown (bez code fence'ów).`,
    ``,
    `ZADANIE: Napisz LEKKĄ, PRZYSTĘPNĄ sekcję maturalną dla uczniów.`,
    ``,
    `DZIEŁO: "${workTitle}" — ${author}`,
    `ROZDZIAŁY: ${chapterSummaries.length}`,
    ``,
    `TON: Jak COACH EGZAMINACYJNY, nie jak suchy podręcznik.`,
    `- Konkretnie, zwięźle, bez akademickiego bełkotu`,
    `- Odsyłasz do konkretnych rozdziałów (numery!)`,
    `- Parafrazy zamiast długich cytatów`,
    `- Odpowiedzi na pytania: 2-3 zdania MAX`,
    ``,
    `═══════════════════════════════════════════════════════════════`,
    `STRUKTURA (BLOKI Z KOTWICAMI)`,
    `═══════════════════════════════════════════════════════════════`,
    ``,
    `## 🎯 Tezy główne {#study-theses}`,
    `- **[Nazwa tezy]** — 1 zdanie wyjaśnienia`,
    `  → Zobacz: Rozdział X (co się tam dzieje), Rozdział Y (co się tam dzieje)`,
    ``,
    `## 🗺️ Mapa motywów {#study-motifs}`,
    `- **[Motyw]** (Rozdziały: X, Y, Z) — 1 zdanie co reprezentuje`,
    ``,
    `## 👥 Postacie i relacje {#study-characters}`,
    `- **Bohater** — funkcja; relacje: 1–2 punkty`,
    ``,
    `## 🧭 Konteksty (2–3) {#study-contexts}`,
    `- Historyczno-społeczny — 1–2 zdania`,
    `- Filozoficzny/kulturowy — 1–2 zdania`,
    ``,
    `## ❓ Pytania egzaminacyjne (8–10) {#study-questions}`,
    `**Q: [pytanie]**`,
    `A: 2–3 zdania MAX z odwołaniem do rozdziałów`,
    ``,
    `## 🔟 Top 10 cytatów/scen do matury {#study-topscenes}`,
    `1. **[Parafraza sceny]** (Rozdział X) — dlaczego ważne (1 zdanie)`,
    ``,
    `═══════════════════════════════════════════════════════════════`,
    `MATERIAŁ ŹRÓDŁOWY (streszczenia rozdziałów)`,
    `═══════════════════════════════════════════════════════════════`,
    ``,
    ...chapterSummaries.map(
      (ch) => [
        `### Rozdział ${ch.index}: ${ch.title}`,
        `Kluczowe wydarzenia:`,
        ...ch.keyEvents.map((e) => `- ${e}`),
        `Warte zapamiętania:`,
        ...ch.keyQuotes.map((q) => `- ${q}`),
        ``,
      ].join('\n')
    ),
    ``,
    `═══════════════════════════════════════════════════════════════`,
    `TERAZ WYPEŁNIJ WSZYSTKIE POWYŻSZE BLOKI.`,
    `PAMIĘTAJ: Lekko, przystępnie, konkretnie!`,
    `═══════════════════════════════════════════════════════════════`,
  ].join('\n');

  const raw = await generateMarkdown(prompt);

  // Upewnij się, że bloki mają poprawne kotwice – i autolink „Rozdział X”
  let cleaned = raw.trim();
  cleaned = linkifyChapterRefs(cleaned);

  return cleaned + '\n';
}
