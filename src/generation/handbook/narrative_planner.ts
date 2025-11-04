// file: src/generation/handbook/narrative_planner.ts
import { generateJson } from '../../llm';

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
  spiritualCore: string;
  interpretiveAxes?: string[];
  chapters: ChapterPlan[];
};

export async function planNarrativeStructure(
  workTitle: string,
  author: string,
  targetChapters: number
): Promise<NarrativePlan> {
  const prompt = {
    task: 'Plan narrative structure for literary adaptation',
    instructions: [
      'Jesteś ekspertem od adaptacji literackich dla młodzieży (maturzyści 17–19 lat).',
      'Twoje adaptacje są WCIĄGAJĄCE, EMOCJONALNE i RÓŻNORODNE stylistycznie.',
      'Analizujesz oryginalne dzieło i projektujesz strukturę, która MAKSYMALIZUJE IMMERSJĘ.',
      '',
      'KLUCZOWE: Immersja = emocje przez DIALOGI i GESTY, nie suche opisy stanów.',
      'Planuj typy rozdziałów tak, by naprzemiennie budować i rozładowywać napięcie.',
      'Duch dzieła (spiritualCore) musi być rozpoznany na etapie planu i później kierować stylem każdej sceny.'
    ],
    work: { title: workTitle, author },
    targetChapters,
    decisions: {
      '1_narrative_voice': {
        description: "Jaki główny 'narrative voice'?",
        options: {
          pure_scenes: 'Tylko sceny (dialog+akcja) — uniwersalne, bezpieczne',
          diary_and_scenes: 'Dziennik obserwatora + sceny — świetne dla dzieł z narratorem-świadkiem',
          letters_and_scenes: 'Listy + sceny — dobre dla romansów, intryg',
          experimental: 'Collage (gazety, dokumenty, monologi) — ryzykowne, tylko gdy uzasadnione'
        },
        reasoning: 'Wyjaśnij DLACZEGO ten voice (2–3 zdania)'
      },
      '2_style_inspiration': {
        description: 'Inspiracja stylistyczna (2–3 współczesnych autorów)',
        examples: {
          realism_19th: 'Prus + odrobina ciepła Pratchetta',
          psychological: 'Dostojewski (głębia) + współczesny noir',
          fantasy: 'Rowling (przygoda) + Pratchett (humor)',
          modernist: 'Kafka (alienacja) + Lem (precyzja)'
        },
        reasoning: 'Wyjaśnij DLACZEGO (2–3 zdania)'
      },
      '3_overall_tone': {
        description: 'Dominujący ton',
        examples: ['melancholic', 'tense', 'adventurous', 'dark_psychological', 'humorous', 'romantic']
      },
      '4_chapter_structure': {
        description: `Zaplanuj ${targetChapters} rozdziałów — MIX TYPÓW buduje rytm!`,
        format: {
          index: 'number (1-based)',
          title: 'Tytuł (krótki, intrygujący)',
          description: '1–2 zdania co się dzieje (AKCJA, nie analiza)',
          type: 'scene | diary | letter | monologue | newspaper | found_document',
          pov: '3rd_person | 1st_person_protagonist | 1st_person_observer | 2nd_person',
          povCharacter: "jeśli 1st person — kto? (np. 'Rzecki', 'Wokulski')",
          tone: 'opcjonalnie: jeśli odbiega od overall_tone'
        },
        critical_guidelines: [
          '',
          '═══════════════════════════════════════════════════════════════',
          'KLUCZOWE ZASADY PLANOWANIA:',
          '═══════════════════════════════════════════════════════════════',
          '',
          '1. Rozdział 1: zawsze scene + 3rd_person (bezpieczne wprowadzenie w świat).',
          '',
          '2. Emocjonalne momenty → diary/letter/monologue.',
          '   - Po konfrontacji → dziennik obserwatora',
          '   - Po wyznaniu miłości → list (odpowiedź/odrzucenie)',
          '   - Kryzys wewnętrzny → monolog',
          '',
          '3. Kontekst społeczny → newspaper/found_document.',
          '   - Skandal → artykuł gazetowy',
          '   - Dowód na poświęcenie → księga rachunkowa',
          '',
          '4. Rytm: scene → emocje → scene → kontekst → scene.',
          '   Co 2–3 rozdziały: zmień typ (odśwież narrację).',
          '',
          '5. Nie przesadzaj z experimental:',
          '   - Max 2–3 rozdziały newspaper/found_document',
          '   - Diary: 2–4 rozdziały OK (ale nie pod rząd!)',
          '   - Letter: 1–2 rozdziały',
          '   - Monologue: 1–2 rozdziały'
        ]
      },
      '5_spiritual_core': {
        description:
          "Opisz w 1–2 zdaniach 'ducha' utworu — wewnętrzny klimat/ideę."
      },
      '6_interpretive_axes': {
        description:
          'Wypisz 2–3 osie interpretacyjne (antynomie/układy napięć).'
      }
    },
    output_format: {
      narrativeVoice: 'pure_scenes | diary_and_scenes | letters_and_scenes | experimental',
      narrativeVoiceReasoning: 'string',
      styleInspiration: 'string',
      styleReasoning: 'string',
      overallTone: 'string',
      spiritualCore: 'string',
      interpretiveAxes: ['string', 'string'],
      chapters: [
        {
          index: 1,
          title: 'string',
          description: 'string',
          type: 'scene',
          pov: '3rd_person',
          povCharacter: 'optional string',
          tone: 'optional string'
        }
      ]
    }
  };

  try {
    const plan = await generateJson<NarrativePlan>(JSON.stringify(prompt, null, 2));

    if (!plan.chapters || plan.chapters.length === 0) {
      throw new Error('AI nie zwróciło rozdziałów');
    }
    // Walidacja: Ch1 = scene + 3rd_person
    if (plan.chapters[0].type !== 'scene' || plan.chapters[0].pov !== '3rd_person') {
      plan.chapters[0].type = 'scene';
      plan.chapters[0].pov = '3rd_person';
    }

    return plan;
  } catch {
    // Fallback: neutralny plan
    return {
      narrativeVoice: 'pure_scenes',
      narrativeVoiceReasoning: 'Fallback — bezpieczna struktura',
      styleInspiration: 'Classic literary realism',
      styleReasoning: 'Fallback — uniwersalny',
      overallTone: 'balanced',
      spiritualCore: 'Pragnienie ładu w świecie pełnym sprzeczności.',
      interpretiveAxes: ['jednostka–społeczeństwo', 'rozsądek–uczucie'],
      chapters: Array.from({ length: targetChapters }, (_, i) => ({
        index: i + 1,
        title: `Rozdział ${i + 1}`,
        description: 'Kontynuacja akcji',
        type: 'scene',
        pov: '3rd_person'
      }))
    };
  }
}
