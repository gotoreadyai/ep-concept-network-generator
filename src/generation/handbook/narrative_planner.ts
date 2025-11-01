// file: src/generation/narrative_planner.ts
import { generateJson } from '../../llm/openai';

export type NarrativeVoice = 'pure_scenes' | 'diary_and_scenes' | 'letters_and_scenes' | 'experimental';
export type ChapterType = 'scene' | 'diary' | 'letter' | 'monologue' | 'newspaper' | 'found_document';
export type POV = '3rd_person' | '1st_person_protagonist' | '1st_person_observer' | '2nd_person';

export type ChapterPlan = {
  index: number;
  title: string;
  description: string;
  type: ChapterType;
  pov: POV;
  povCharacter?: string;
  tone?: string;
};

export type NarrativePlan = {
  narrativeVoice: NarrativeVoice;
  narrativeVoiceReasoning: string;
  styleInspiration: string;
  styleReasoning: string;
  overallTone: string;
  chapters: ChapterPlan[];
};

export async function planNarrativeStructure(
  workTitle: string,
  author: string,
  desiredChapters: number
): Promise<NarrativePlan> {
  const prompt = {
    task: "Plan narrative structure for literary adaptation",
    instructions: [
      "Jesteś ekspertem od adaptacji literackich dla młodzieży (maturzyści 17-19 lat).",
      "Twoje adaptacje są WCIĄGAJĄCE, EMOCJONALNE i RÓŻNORODNE stylistycznie.",
      "Analizujesz oryginalne dzieło i projektujesz strukturę która MAKSYMALIZUJE IMMERSJĘ.",
      "",
      "KLUCZOWE: Immersja = emocje przez DIALOGI i GESTY, nie opisy stanów.",
      "Planuj typy rozdziałów TAK, by naprzemiennie budować i rozładowywać napięcie.",
    ],
    work: {
      title: workTitle,
      author: author,
    },
    targetChapters: desiredChapters,
    decisions: {
      "1_narrative_voice": {
        description: "Jaki główny 'narrative voice'?",
        options: {
          pure_scenes: "Tylko sceny (dialog+akcja) - uniwersalne, bezpieczne",
          diary_and_scenes: "Dziennik obserwatora + sceny - ŚWIETNE dla dzieł z narratorem-świadkiem",
          letters_and_scenes: "Listy + sceny - DOBRE dla romansów, intryg",
          experimental: "Collage (gazety, dokumenty, monologi) - ryzykowne, tylko modernizm",
        },
        reasoning: "Wyjaśnij DLACZEGO ten voice (2-3 zdania)",
      },
      "2_style_inspiration": {
        description: "Inspiracja stylistyczna (2-3 współczesnych autorów)",
        examples: {
          realism_19th: "Prus + touches of Pratchett warmth",
          psychological: "Dostoyevsky depth + modern noir",
          fantasy: "Rowling adventure + Pratchett humor",
          modernist: "Kafka alienation + Lem precision",
        },
        reasoning: "Wyjaśnij DLACZEGO (2-3 zdania)",
      },
      "3_overall_tone": {
        description: "Dominujący ton",
        examples: ["melancholic", "tense", "adventurous", "dark_psychological", "humorous", "romantic"],
      },
      "4_chapter_structure": {
        description: `Zaplanuj ${desiredChapters} rozdziałów - MIX TYPÓW buduje rytm!`,
        format: {
          index: "number (1-based)",
          title: "Tytuł (krótki, intrygujący)",
          description: "1-2 zdania co się dzieje (AKCJA, nie analiza)",
          type: "scene | diary | letter | monologue | newspaper | found_document",
          pov: "3rd_person | 1st_person_protagonist | 1st_person_observer | 2nd_person",
          povCharacter: "jeśli 1st person - kto? (np. 'Rzecki', 'Wokulski')",
          tone: "opcjonalnie: jeśli odbiega od overall_tone",
        },
        critical_guidelines: [
          "",
          "═══════════════════════════════════════════════════════════════",
          "KLUCZOWE ZASADY PLANOWANIA:",
          "═══════════════════════════════════════════════════════════════",
          "",
          "1. ROZDZIAŁ 1: ZAWSZE 'scene' + '3rd_person'",
          "   (bezpieczne wprowadzenie w świat)",
          "",
          "2. EMOCJONALNE MOMENTY → diary/letter/monologue",
          "   - Po konfrontacji → dziennik obserwatora",
          "   - Po wyznaniu miłości → list (odpowiedź/odrzucenie)",
          "   - Kryzys wewnętrzny → monolog",
          "   ",
          "3. KONTEKST SPOŁECZNY → newspaper/found_document",
          "   - Skandal → artykuł gazetowy",
          "   - Dowód na poświęcenie → księga rachunkowa",
          "   ",
          "4. RYTM: scene → emocje → scene → kontekst → scene",
          "   Co 2-3 rozdziały: zmień typ (odśwież narrację)",
          "   ",
          "5. PRZYKŁAD DOBREGO MIXU (12 rozdziałów):",
          "   Ch 1: scene (intro)",
          "   Ch 2: scene (pierwsza konfrontacja)",
          "   Ch 3: diary (świadek opisuje co widział)",
          "   Ch 4: scene (dalsze komplikacje)",
          "   Ch 5: letter (ważna wiadomość/odrzucenie)",
          "   Ch 6: scene (reakcja na list)",
          "   Ch 7: diary (obserwator znowu komentuje)",
          "   Ch 8: monologue (kryzys wewnętrzny protagonisty)",
          "   Ch 9: newspaper (skandal wychodzi na jaw)",
          "   Ch 10: scene (publiczna konfrontacja)",
          "   Ch 11: found_document (dowody, liczby)",
          "   Ch 12: diary (zamknięcie, refleksja)",
          "",
          "6. NIE przesadzaj z experimental:",
          "   - Max 2-3 rozdziały newspaper/found_document na 12",
          "   - Diary: 2-4 rozdziały OK (ale nie pod rząd!)",
          "   - Letter: 1-2 rozdziały (w kluczowych momentach)",
          "   - Monologue: 1-2 rozdziały (tylko dla protagonisty)",
          "",
          "7. TYTUŁY = INTRYGUJĄCE, nie akademickie:",
          "   ✓ DOBRE: 'Wpadka w towarzystwie', 'Cisza przed burzą'",
          "   ✗ ZŁE: 'Rozdział o konflikcie klasowym', 'Analiza postaci'",
          "",
          "═══════════════════════════════════════════════════════════════",
        ],
      },
    },
    output_format: {
      narrativeVoice: "one of: pure_scenes | diary_and_scenes | letters_and_scenes | experimental",
      narrativeVoiceReasoning: "string (2-3 sentences)",
      styleInspiration: "string (e.g. 'Prus realism + Pratchett warmth')",
      styleReasoning: "string (2-3 sentences)",
      overallTone: "string",
      chapters: [
        {
          index: 1,
          title: "string (intrygujący!)",
          description: "string (akcja, nie analiza)",
          type: "scene",
          pov: "3rd_person",
          povCharacter: "optional string",
          tone: "optional string",
        },
        "... more chapters",
      ],
    },
  };

  console.log(`🎭 Planuję strukturę narracyjną dla: "${workTitle}" (${author})...`);

  try {
    const plan = await generateJson<NarrativePlan>(JSON.stringify(prompt, null, 2));

    if (!plan.chapters || plan.chapters.length === 0) {
      throw new Error('AI nie zwróciło rozdziałów');
    }

    // Walidacja: Ch 1 = scene + 3rd person
    if (plan.chapters[0].type !== 'scene' || plan.chapters[0].pov !== '3rd_person') {
      console.warn('⚠️  Poprawiam Rozdział 1 na scene + 3rd_person (wymagane)');
      plan.chapters[0].type = 'scene';
      plan.chapters[0].pov = '3rd_person';
    }

    console.log(`✅ Plan gotowy:`);
    console.log(`   Voice: ${plan.narrativeVoice}`);
    console.log(`   Style: ${plan.styleInspiration}`);
    console.log(`   Tone: ${plan.overallTone}`);
    console.log(`   Rozdziały: ${plan.chapters.length}`);

    const typeCounts = plan.chapters.reduce((acc, ch) => {
      acc[ch.type] = (acc[ch.type] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    console.log(`   Mix typów:`, typeCounts);

    return plan;
  } catch (err) {
    console.error('❌ Błąd planowania, używam fallback (pure_scenes)');
    return {
      narrativeVoice: 'pure_scenes',
      narrativeVoiceReasoning: 'Fallback - bezpieczna struktura',
      styleInspiration: 'Classic literary realism',
      styleReasoning: 'Fallback - uniwersalny',
      overallTone: 'balanced',
      chapters: Array.from({ length: desiredChapters }, (_, i) => ({
        index: i + 1,
        title: `Rozdział ${i + 1}`,
        description: 'Kontynuacja akcji',
        type: 'scene' as ChapterType,
        pov: '3rd_person' as POV,
      })),
    };
  }
}