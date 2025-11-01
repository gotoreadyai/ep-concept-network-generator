// file: src/generation/study_notes.ts
import { generateMarkdown } from '../../llm/openai';

/** Tryb dołączania notatek do rozdziału. */
export type StudyNotesMode = 'inline' | 'sidecar' | 'none';

export type StudyNotesInput = {
  workTitle: string;
  author: string;
  chapterIndex: number;
  chapterTitle: string;
  chapterMarkdown: string; // pełna scena rozdziału (Markdown)
};

/** Usuwa ewentualne code-fence’y i normalizuje EOL. */
function unwrapCodeFence(s: string) {
  const trimmed = s.replace(/\r/g, '').trim();
  const fenced = trimmed.match(/^```[a-zA-Z0-9-]*\n([\s\S]*?)\n```$/);
  if (fenced) return fenced[1].trim();
  return trimmed.replace(/^```[a-zA-Z0-9-]*\n?/, '').replace(/\n?```$/, '').trim();
}

/** Generuje zwijaną sekcję z notatkami maturalnymi (poza narracją). */
export async function generateStudyNotes(input: StudyNotesInput): Promise<string> {
  const prompt = [
    `Zwróć WYŁĄCZNIE czysty Markdown.`,
    `ŹRÓDŁO: rozdział skrótu dzieła (scena immersyjna).`,
    `Dzieło: "${input.workTitle}" — ${input.author}`,
    `Rozdział ${input.chapterIndex}: "${input.chapterTitle}"`,

    ``,
    `ZADANIE: Sekcja „Notatki maturalne (poza narracją)” – zwięźle i technicznie:`,
    `**Teza (1 zdanie):** …`,
    `**Motywy:** …`,
    `**Konteksty:** …`,
    `**Haki cytatowe (parafrazy + rozdział):** …`,
    `**Pytanie egzaminacyjne → szybka odpowiedź (2–3 zdania):** …`,

    ``,
    `ZASADY:`,
    `- Zwięźle, bez ozdobników.`,
    `- Tylko fakty z lektury; jeśli trzeba, użyj parafraz zamiast długich cytatów.`,
    `- Podawaj rozdział zamiast numeru strony.`,

    ``,
    `ROZDZIAŁ (dla kontekstu):`,
    input.chapterMarkdown,
  ].join('\n');

  const raw = await generateMarkdown(prompt);
  const body = unwrapCodeFence(raw);

  return [
    `<details>`,
    `<summary>Notatki maturalne (poza narracją)</summary>`,
    ``,
    body,
    ``,
    `</details>`,
  ].join('\n');
}
