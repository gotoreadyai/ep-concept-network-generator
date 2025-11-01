// file: src/generation/custom_example_generator.ts
import { generateMarkdown } from '../../llm/openai';
import { getGenreExample, formatGenreExampleForPrompt } from './genre_examples';

export type CustomExampleInput = {
  workTitle: string;
  author: string;
  genre: string;
  styleInspiration: string;
};

function unwrapCodeFence(s: string) {
  const trimmed = s.replace(/\r/g, '').trim();
  const fenced = trimmed.match(/^```[a-zA-Z0-9-]*\n([\s\S]*?)\n```$/);
  if (fenced) return fenced[1].trim();
  return trimmed.replace(/^```[a-zA-Z0-9-]*\n?/, '').replace(/\n?```$/, '').trim();
}

export async function generateCustomExample(input: CustomExampleInput): Promise<string> {
  const genreExample = getGenreExample(input.genre);
  if (!genreExample) {
    throw new Error(`Nieznany gatunek: ${input.genre}`);
  }

  const genrePrompt = formatGenreExampleForPrompt(genreExample);

  const prompt = [
    `Zwróć WYŁĄCZNIE czysty Markdown (bez code fence'ów).`,
    ``,
    `═══════════════════════════════════════════════════════════════`,
    `ZADANIE: CUSTOM PRZYKŁAD DLA KONKRETNEGO DZIEŁA`,
    `═══════════════════════════════════════════════════════════════`,
    ``,
    `DZIEŁO: "${input.workTitle}" — ${input.author}`,
    `STYL: ${input.styleInspiration}`,
    ``,
    `Wygeneruj JEDNĄ przykładową scenę (10-15 linijek) dla tego dzieła.`,
    `Ta scena będzie WZORCEM dla wszystkich rozdziałów.`,
    ``,
    genrePrompt,
    ``,
    `═══════════════════════════════════════════════════════════════`,
    `KRYTYCZNE WYMAGANIA`,
    `═══════════════════════════════════════════════════════════════`,
    ``,
    `1. Użyj PRAWDZIWYCH POSTACI z dzieła`,
    `   - Nie używaj placeholderów [PROTAGONIST]`,
    `   - Użyj prawdziwych imion`,
    ``,
    `2. Użyj PRAWDZIWYCH miejsc/sytuacji z dzieła`,
    `   - Konkretne lokacje`,
    `   - Prawdopodobna sytuacja`,
    ``,
    `3. Zachowaj PROPORCJE z przykładu gatunkowego`,
    `   - 70% dialogu (jeśli scena realistyczna)`,
    `   - Krótkie kwestie (1-2 zdania)`,
    `   - Cisze, przerwy`,
    ``,
    `4. Zachowaj STRUKTURĘ z przykładu gatunkowego`,
    `   - Gesty między kwestiami`,
    `   - Reakcje fizyczne = emocje`,
    `   - Napięcia przez akcję, nie opisy`,
    ``,
    `5. DŁUGOŚĆ: 10-15 linijek (KRÓTKO!)`,
    `   - To tylko przykład, nie pełny rozdział`,
    ``,
    `6. TON: ${input.styleInspiration}`,
    `   - Zachowaj klimat tego autora/stylu`,
    ``,
    `═══════════════════════════════════════════════════════════════`,
    `WZORUJ SIĘ NA STRUKTURZE POWYŻEJ, ALE UŻYJ PRAWDZIWYCH POSTACI`,
    `═══════════════════════════════════════════════════════════════`,
    ``,
    `Format (przykład):`,
    ``,
    `*[Konkretne miejsce z dzieła; pora; postacie z dzieła]*`,
    ``,
    `(Dialog + gesty + cisze - jak w przykładzie gatunkowym)`,
    ``,
    `TERAZ WYGENERUJ TĘ SCENĘ.`,
  ].join('\n');

  console.log(`🎨 Generuję custom przykład dla: "${input.workTitle}"...`);
  console.log(`   Gatunek: ${input.genre}`);
  console.log(`   Styl: ${input.styleInspiration}`);

  const raw = await generateMarkdown(prompt);
  const cleaned = unwrapCodeFence(raw);

  console.log(`✅ Custom przykład wygenerowany (${cleaned.split('\n').length} linijek)`);

  return cleaned;
}