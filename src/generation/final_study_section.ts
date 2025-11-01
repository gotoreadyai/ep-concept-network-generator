// file: src/generation/final_study_section.ts
import { generateMarkdown } from '../llm/openai';

export type ChapterSummary = {
  index: number;
  title: string;
  keyEvents: string[]; // 2-3 kluczowe wydarzenia
  keyQuotes: string[]; // 1-2 parafrazy warte zapamiętania
};

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
    `STRUKTURA`,
    `═══════════════════════════════════════════════════════════════`,
    ``,
    `# 🎓 SEKCJA MATURALNA`,
    ``,
    `## 🎯 Tezy główne (3)`,
    ``,
    `Każda teza:`,
    `- **[Nazwa tezy]** — 1 zdanie wyjaśnienia`,
    `  → Zobacz: Rozdział X (co się tam dzieje), Rozdział Y (co się tam dzieje)`,
    ``,
    `PRZYKŁAD DOBRY:`,
    `- **Miłość jako obsesja destrukcyjna** — Wokulski traci zdrowy osąd dla uczucia do Izabeli.`,
    `  → Zobacz: Rozdział 2 (dziennik Rzeckiego o zmianie Wokulskiego), Rozdział 5 (dar mimo chłodu Izabeli)`,
    ``,
    `PRZYKŁAD ZŁY (za rozwlekły):`,
    `- **Miłość jako obsesja** — Główny bohater doświadcza głębokiej transformacji psychologicznej...`,
    ``,
    `---`,
    ``,
    `## 🗺️ Mapa motywów (5-7)`,
    ``,
    `Każdy motyw:`,
    `- **[Motyw]** (Rozdziały: X, Y, Z) — 1 zdanie co reprezentuje`,
    ``,
    `PRZYKŁAD:`,
    `- **Sklep** (Rozdziały: 1, 7, 11) — Symbol pracy i tożsamości Wokulskiego; przestrzeń bezpieczna vs obce salony`,
    `- **Salon** (Rozdziały: 2, 4, 8) — Świat pozorów, konwenansów i wykluczenia`,
    ``,
    `---`,
    ``,
    `## 💬 Top 10 cytatów/scen do matury`,
    ``,
    `Format:`,
    `1. **[Parafraza sceny]** (Rozdział X) — dlaczego ważne (1 zdanie)`,
    ``,
    `PRZYKŁAD DOBRY:`,
    `1. **Wokulski stoi przy oknie i patrzy na pałac** (Rozdział 1) — Tęsknota za niedostępnym światem arystokracji`,
    `2. **Rzecki w dzienniku: "Boję się, nigdy nie widziałem go takiego"** (Rozdział 2) — Moment rozpoznania obsesji`,
    ``,
    `PRZYKŁAD ZŁY (za ogólny):`,
    `1. **Opis sytuacji gospodarczej** (Rozdział 3) — Kontekst historyczny`,
    ``,
    `NIE cytuj dosłownie długich fragmentów - PARAFRAZY!`,
    ``,
    `---`,
    ``,
    `## ❓ Pytania egzaminacyjne (8-10)`,
    ``,
    `Format:`,
    `**Q: [Pytanie w stylu matury]**`,
    `A: [Odpowiedź 2-3 zdania MAX. Konkretnie, z odniesieniem do rozdziałów.]`,
    ``,
    `PRZYKŁAD DOBRY:`,
    `**Q: Dlaczego miłość Wokulskiego jest tragiczna?**`,
    `A: Bo łączy dwoje ludzi z różnych światów. Izabela nigdy nie wyjdzie poza swoją klasę (Rozdział 3: obiad u Łęckich), Wokulski nigdy w nią nie wejdzie (Rozdział 8: odrzucenie w salonie). To jak próba połączenia wody i oleju.`,
    ``,
    `PRZYKŁAD ZŁY (za długi):`,
    `**Q: Omów problem miłości w dziele.**`,
    `A: Miłość w dziele przedstawiona jest jako skomplikowany problem społeczny i psychologiczny. Autor ukazuje różne aspekty uczucia, jego destrukcyjny wpływ na psychikę bohatera, oraz niemożność przełamania barier klasowych...`,
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
    `TERAZ NAPISZ SEKCJĘ MATURALNĄ według powyższej struktury.`,
    `PAMIĘTAJ: Lekko, przystępnie, konkretnie!`,
    `═══════════════════════════════════════════════════════════════`,
  ].join('\n');

  console.log(`📚 Generuję sekcję maturalną...`);
  const raw = await generateMarkdown(prompt);

  // Upewnij się że zaczyna się od nagłówka
  let cleaned = raw.trim();
  if (!/^#\s+/.test(cleaned)) {
    cleaned = `# 🎓 SEKCJA MATURALNA\n\n${cleaned}`;
  }

  return cleaned + '\n';
}