// file: src/generation/genre_examples.ts

export type GenreExample = {
    genre: string;
    description: string;
    structure: string;
    exampleScene: string; // z placeholderami
    keyPrinciples: string[];
  };
  
  export const GENRE_EXAMPLES: Record<string, GenreExample> = {
    realism: {
      genre: 'Realizm (XIX wiek)',
      description: 'Obiektywna narracja, detal społeczny, dialogi naturalne',
      structure: `
  STRUKTURA SCENY REALISTYCZNEJ:
  1. Orientacja w miejscu (1-2 zdania konkretnego opisu)
  2. Dialog (70%) - krótkie kwestie, naturalne
  3. Gesty/reakcje między kwestiami
  4. Niedopowiedzenia, napięcia społeczne
  5. Konkrety zamiast abstrakcji
  `,
      exampleScene: `
  *[Salon [LOCATION]; wieczór; [PROTAGONIST], [LOVE_INTEREST], rodzice]*
  
  [PROTAGONIST] stoi przy oknie. Patrzy na ulicę.
  
  – Wie pan – zaczyna [FATHER] – nasze nazwisko, tradycja... To dla nas ważne.
  – Rozumiem – mówi [PROTAGONIST].
  – Ale wie pan, ludzie gadają – dodaje [FATHER]. – [LOVE_INTEREST] zasługuje na...
  – Na dobrego męża – przerywa [PROTAGONIST]. – Ja też tego chcę.
  
  [LOVE_INTEREST] wstaje od fortepianu. Podchodzi do matki.
  
  – Mamo, źle się czuję. Pójdę do siebie.
  – Już, kochanie? Ale pan [PROTAGONIST]...
  – Przepraszam – mówi [LOVE_INTEREST].
  
  Wychodzi z salonu. [PROTAGONIST] zostaje z jej rodzicami.
  `,
      keyPrinciples: [
        '70% dialogu',
        'Krótkie kwestie (1-2 zdania)',
        'Gesty = emocje ("wstaje", "patrzy")',
        'Cisza przez akcję ("Wychodzi z salonu")',
        'Konkrety zamiast abstrakcji',
      ],
    },
  
    psychological: {
      genre: 'Psychologiczny',
      description: 'Głębia wewnętrzna, dylematy moralne, napięcie psychiczne',
      structure: `
  STRUKTURA SCENY PSYCHOLOGICZNEJ:
  1. Sytuacja zewnętrzna (krótko)
  2. Dialog z podtekstami
  3. Reakcje fizyczne = stany wewnętrzne
  4. Monolog wewnętrzny (krótki) lub cisza znacząca
  5. Gest/decyzja która pokazuje konflikt
  `,
      exampleScene: `
  *[Pokój [PROTAGONIST]; noc; sam]*
  
  [PROTAGONIST] siada przy oknie. W ręku trzyma list.
  
  "[LOVE_INTEREST] napisała: 'Proszę nie przyjeżdżać.' Trzy słowa. Tyle wystarczy?"
  
  Rozrywa list. Potem zbiera kawałki. Układa z powrotem.
  
  "Mogę pojechać. Nikt mi nie zabroni. Ale czy powinienem?"
  
  Patrzy na zegarek. Pociąg o piątej. Ma jeszcze czas.
  
  "Co jeśli... co jeśli ma rację?"
  
  Wstaje. Podchodzi do drzwi. Stoi. Wraca do okna.
  
  Kawałki listu leżą na stole.
  `,
      keyPrinciples: [
        'Monolog wewnętrzny (fragmentaryczny)',
        'Pytania retoryczne',
        'Gesty pokazują wahanie',
        'Cisza = konflikt wewnętrzny',
        'Detale znaczące (zegarek, kawałki listu)',
      ],
    },
  
    fantasy: {
      genre: 'Fantasy / Przygodowy',
      description: 'Akcja, magia jako narzędzie narracyjne, wonder moments',
      structure: `
  STRUKTURA SCENY FANTASY:
  1. Wonder moment (coś niezwykłego)
  2. Dialog - pytania, odkrycia
  3. Akcja fizyczna
  4. Konsekwencje magii/odkrycia
  5. Zakończenie z pytaniem lub cliffhangerem
  `,
      exampleScene: `
  *[Las [LOCATION]; świt; [PROTAGONIST], [MENTOR]]*
  
  Drzewo świeci.
  
  – To niemożliwe – mówi [PROTAGONIST].
  – Wszystko jest możliwe – odpowiada [MENTOR]. – Dotknij.
  
  [PROTAGONIST] wyciąga rękę. Kora jest ciepła. Świecąca linia biegnie w górę, rozgałęzia się.
  
  – Co to robi?
  – Pokazuje drogę.
  – Dokąd?
  
  [MENTOR] nie odpowiada. Patrzy w górę. Linie świetlne prowadzą w głąb lasu.
  
  – Tam jest [ARTIFACT] – mówi w końcu. – Albo było.
  – Co znaczy "było"?
  
  Drzewo przestaje świecić.
  `,
      keyPrinciples: [
        'Wonder moment na początku',
        'Krótkie pytania w dialogu',
        'Akcja = odkrycie',
        'Cliffhanger lub pytanie na końcu',
        'Magia konkretna, nie abstrakcyjna',
      ],
    },
  
    mythology: {
      genre: 'Mitologiczny / Epicki',
      description: 'Ton uroczysty ale przystępny, symbole, wyższa stawka',
      structure: `
  STRUKTURA SCENY MITOLOGICZNEJ:
  1. Miejsce znaczące (symbol)
  2. Dialog ceremonialny ale zrozumiały
  3. Znak/omen/symbol
  4. Decyzja bohatera (wysoka stawka)
  5. Konsekwencja (natychmiastowa lub zapowiedź)
  `,
      exampleScene: `
  *[Świątynia [LOCATION]; północ; [PROTAGONIST], [DEITY/ORACLE]]*
  
  Ogień płonie niebieski.
  
  – Szukasz [QUEST_OBJECT] – mówi [DEITY/ORACLE]. – Dlaczego?
  – Bo muszę – odpowiada [PROTAGONIST].
  – "Muszę" to nie powód. Powód to "dla kogo".
  
  [PROTAGONIST] patrzy w ogień. Widzi tam twarz [LOVE_INTEREST/FAMILY].
  
  – Dla niej.
  – A jeśli cena będzie wyższa niż myślisz?
  
  Cisza. Ogień rośnie.
  
  – Zapłacę.
  
  Ogień zmienia kolor na czerwony. [DEITY/ORACLE] kiwa głową.
  
  – Więc idź. [QUEST_OBJECT] czeka. Ale pamiętaj: bogowie dają, bogowie biorą.
  `,
      keyPrinciples: [
        'Symbole konkretne (ogień, kolor)',
        'Dialog z podtekstem filozoficznym',
        'Decyzja = ofiara',
        'Ton uroczysty ale przystępny',
        'Konsekwencje zapowiedziane',
      ],
    },
  
    romantic: {
      genre: 'Romantyczny',
      description: 'Emocje, niedopowiedzenia, tension przez bliskość/dystans',
      structure: `
  STRUKTURA SCENY ROMANTYCZNEJ:
  1. Bliskość fizyczna (przypadkowa lub celowa)
  2. Dialog z przerwami (wahanie)
  3. Gesty intymne (dotknięcie, wzrok)
  4. Moment prawdy (wyznanie lub ucieczka)
  5. Emocje przez reakcje, nie opisy
  `,
      exampleScene: `
  *[Ogród [LOCATION]; zmierzch; [PROTAGONIST], [LOVE_INTEREST]]*
  
  Stoją blisko. Zbyt blisko.
  
  – Chciałem... – zaczyna [PROTAGONIST].
  – Tak? – pyta [LOVE_INTEREST]. Nie patrzy na niego.
  – Chciałem powiedzieć, że...
  
  Cisza. Wiatr porusza jej włosami.
  
  – Że co? – pyta cicho.
  
  [PROTAGONIST] wyciąga rękę. Dotyka jej ramienia. [LOVE_INTEREST] drży.
  
  – Że cię kocham.
  
  [LOVE_INTEREST] odwraca się. Patrzy na niego. Jej oczy są mokre.
  
  – Nie mów tego – szepce.
  – Dlaczego?
  – Bo wtedy będzie bolało.
  
  Odchodzi. [PROTAGONIST] zostaje sam w ogrodzie.
  `,
      keyPrinciples: [
        'Bliskość fizyczna = napięcie',
        'Krótkie, urwane kwestie',
        'Gesty intymne (dotyk, wzrok)',
        'Łzy bez słowa "płacze"',
        'Odejście/separacja = ból',
      ],
    },
  
    dystopia: {
      genre: 'Dystopijny',
      description: 'Świat opresyjny, dialog minimalistyczny, napięcie przez zagrożenie',
      structure: `
  STRUKTURA SCENY DYSTOPIJNEJ:
  1. Detal świata (konkretny, niepokojący)
  2. Dialog szepcany/ostrożny
  3. Zagrożenie (patrol, kamera, donos)
  4. Akcja pod presją czasu
  5. Konsekwencja/ucieczka
  `,
      exampleScene: `
  *[Zaułek [LOCATION]; noc; [PROTAGONIST], [ALLY]]*
  
  Kamera obraca się. Trzy sekundy przerwy.
  
  – Teraz – szepcze [ALLY].
  
  Biegnę. [PROTAGONIST] za nim. Ściana. Dziura w murze.
  
  – Tu.
  
  Przeciskają się. Z drugiej strony słychać kroki.
  
  – [PROTAGONIST] – mówi [ALLY]. – Mam to.
  
  Wyciąga paczkę. [PROTAGONIST] bierze. W środku papier. Zakazany.
  
  – Jak?
  – Nie pytaj. Po prostu czytaj. Zanim znowu przyjdą.
  
  Kroki cichną. Cisza. Potem syrena.
  
  – Uciekaj – mówi [ALLY]. – Teraz.
  
  [PROTAGONIST] biegnie.
  `,
      keyPrinciples: [
        'Detal świata (kamera, patrol)',
        'Dialog minimalistyczny',
        'Presja czasu (kroki, syrena)',
        'Akcja szybka, konkretna',
        'Zagrożenie zawsze obecne',
      ],
    },
  
    modernist: {
      genre: 'Modernistyczny',
      description: 'Fragmentaryczność, strumień świadomości, absurd',
      structure: `
  STRUKTURA SCENY MODERNISTYCZNEJ:
  1. Fragment sytuacji (niekoniecznie jasny kontekst)
  2. Strumień myśli (chaotyczny)
  3. Dialog urywany/absurdalny
  4. Powtórzenia, zapętlenia
  5. Brak tradycyjnego rozwiązania
  `,
      exampleScene: `
  *[Pokój [LOCATION]; czas nieokreślony; [PROTAGONIST]]*
  
  Ściana. Biała. Zawsze biała.
  
  "Powiedziała coś. Co? 'Wróć jutro.' Albo 'Nie wracaj.' Nie pamiętam."
  
  Telefon dzwoni. [PROTAGONIST] nie odbiera.
  
  "Jutro. Jutro jest zawsze. Ale nigdy nie przychodzi."
  
  Telefon przestaje dzwonić. Zaczyna znowu.
  
  – Halo?
  – [PROTAGONIST]? Gdzie jesteś?
  – Tutaj.
  – Gdzie "tutaj"?
  – W pokoju.
  – Jakim pokoju?
  
  [PROTAGONIST] patrzy na ścianę. Biała.
  
  – Nie wiem.
  
  Odkłada słuchawkę. Telefon dzwoni znowu.
  `,
      keyPrinciples: [
        'Fragmentaryczność',
        'Strumień myśli w cudzysłowie',
        'Dialog absurdalny/zapętlony',
        'Powtórzenia (biała ściana, telefon)',
        'Brak jasnego zakończenia',
      ],
    },
  };
  
  export function getGenreExample(genre: string): GenreExample | undefined {
    return GENRE_EXAMPLES[genre.toLowerCase()];
  }
  
  export function detectGenreFromStyle(styleInspiration: string, overallTone: string): string {
    const style = styleInspiration.toLowerCase();
    const tone = overallTone.toLowerCase();
  
    if (style.includes('prus') || style.includes('realism')) return 'realism';
    if (style.includes('dostoyevsky') || style.includes('psychological')) return 'psychological';
    if (style.includes('rowling') || style.includes('fantasy')) return 'fantasy';
    if (style.includes('mythology') || style.includes('epic')) return 'mythology';
    if (tone.includes('romantic') || style.includes('love')) return 'romantic';
    if (style.includes('dystopia') || style.includes('orwell')) return 'dystopia';
    if (style.includes('kafka') || style.includes('modernist')) return 'modernist';
  
    // fallback
    return 'realism';
  }
  
  export function formatGenreExampleForPrompt(example: GenreExample): string {
    return [
      `═══════════════════════════════════════════════════════════════`,
      `WZORZEC GATUNKOWY: ${example.genre}`,
      `═══════════════════════════════════════════════════════════════`,
      ``,
      `OPIS: ${example.description}`,
      ``,
      example.structure,
      ``,
      `PRZYKŁAD Z PLACEHOLDERAMI:`,
      example.exampleScene,
      ``,
      `KLUCZOWE ZASADY:`,
      ...example.keyPrinciples.map((p) => `✓ ${p}`),
      ``,
      `═══════════════════════════════════════════════════════════════`,
    ].join('\n');
  }