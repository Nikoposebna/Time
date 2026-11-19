import type { AppLanguage } from '../i18n/translations';

export type CipherAlgorithm =
  | 'caesar'
  | 'vigenere'
  | 'atbash'
  | 'railfence'
  | 'xor_hex'
  | 'base64'
  | 'binary';

export interface CipherLocaleCopy {
  label: string;
  description: string;
  tooltip: string;
  category: string;
}

export interface CipherMeta {
  id: CipherAlgorithm;
  requiresKey: boolean;
  keyType: 'number' | 'text' | 'none';
  defaultKey: string;
  example: string;
  locales: Record<AppLanguage, CipherLocaleCopy>;
}

export const CIPHER_CATALOG: CipherMeta[] = [
  {
    id: 'caesar',
    requiresKey: true,
    keyType: 'number',
    defaultKey: '7',
    example: 'ALFA (+7) → HSMT',
    locales: {
      sr: {
        label: 'Cezarova šifra',
        description: 'Pomera svako slovo abecede za zadati broj pozicija (1–25).',
        tooltip:
          'Monoalfabetska supstitucija gde se svako slovo zamenjuje slovom udaljenim za fiksni pomeraj K po modulu 26. Lako se razbija frekventnom analizom ili proverom svih 25 pomeraja.',
        category: 'Monoalfabetska supstitucija',
      },
      en: {
        label: 'Caesar Shift',
        description: 'Shifts each letter of the alphabet by a fixed offset (1–25).',
        tooltip:
          'Monoalphabetic substitution replacing each letter with one K positions ahead modulo 26. Easily broken via frequency analysis or brute-forcing 25 shifts.',
        category: 'Monoalphabetic Substitution',
      },
      ru: {
        label: 'Шифр Цезаря',
        description: 'Сдвигает каждую букву алфавита на заданное число позиций (1–25).',
        tooltip:
          'Моноалфавитная подстановка со сдвигом каждой буквы на K позиций по модулю 26. Легко взламывается частотным анализом или перебором 25 вариантов.',
        category: 'Моноалфавитная замена',
      },
      zh: {
        label: '凯撒移位密码',
        description: '将字母表中的每个字母按固定偏移量（1–25）循环移位。',
        tooltip:
          '单表替换密码，将每个字母按模 26 向后移动 K 位。通过频率分析或穷举 25 种偏移即可轻松破解。',
        category: '单表替换密码',
      },
      es: {
        label: 'Cifrado César',
        description: 'Desplaza cada letra del alfabeto un número fijo de posiciones (1–25).',
        tooltip:
          'Sustitución monoalfabética que reemplaza cada letra avanzando K posiciones módulo 26. Vulnerable al análisis de frecuencias y fuerza bruta de 25 claves.',
        category: 'Sustitución monoalfabética',
      },
      de: {
        label: 'Caesar-Verschiebung',
        description: 'Verschiebt jeden Buchstaben des Alphabets um eine feste Anzahl Positionen (1–25).',
        tooltip:
          'Monoalphabetische Substitution modulo 26 um den Versatz K. Durch Häufigkeitsanalyse oder Testen aller 25 Verschiebungen leicht zu knacken.',
        category: 'Monoalphabetische Substitution',
      },
      ja: {
        label: 'シーザー暗号',
        description: 'アルファベット各文字を指定位置数（1〜25）だけシフトします。',
        tooltip:
          '各文字を 26 を法として K 文字分ずらす単一換字式暗号です。頻度分析や 25 通りの総当たりで容易に解読できます。',
        category: '単一換字式暗号',
      },
    },
  },
  {
    id: 'vigenere',
    requiresKey: true,
    keyType: 'text',
    defaultKey: 'SOLARIS',
    example: 'ALFA + KOD → KZPK',
    locales: {
      sr: {
        label: 'Vigenère šifra',
        description: 'Polialfabetska supstitucija pomoću ključne reči.',
        tooltip:
          'Koristi ponavljajuću ključnu reč tako da svako slovo poruke dobija drugačiji Cezarov pomeraj (Cᵢ = (Pᵢ + Kᵢ) mod 26). Otpornija je na osnovnu frekventnu analizu od Cezarove šifre.',
        category: 'Polialfabetska supstitucija',
      },
      en: {
        label: 'Vigenère Cipher',
        description: 'Polyalphabetic substitution driven by a repeating keyword.',
        tooltip:
          'Applies a repeating keyword so each plaintext letter receives a different shift (Cᵢ = (Pᵢ + Kᵢ) mod 26), masking single-letter frequency spikes.',
        category: 'Polyalphabetic Substitution',
      },
      ru: {
        label: 'Шифр Виженера',
        description: 'Полиалфавитная замена с использованием повторяющегося ключевого слова.',
        tooltip:
          'Использует ключевое слово, задающее разный сдвиг для каждой буквы (Cᵢ = (Pᵢ + Kᵢ) mod 26), скрывая базовую статистику частот.',
        category: 'Полиалфавитная замена',
      },
      zh: {
        label: '维吉尼亚密码',
        description: '使用重复关键词的多表替换加密算法。',
        tooltip:
          '利用循环关键词为每个明文字母施加不同移位（Cᵢ = (Pᵢ + Kᵢ) mod 26），有效隐藏单字母频率特征。',
        category: '多表替换密码',
      },
      es: {
        label: 'Cifrado Vigenère',
        description: 'Sustitución polialfabética controlada por una palabra clave repetida.',
        tooltip:
          'Aplica una palabra clave cíclica para que cada letra reciba un desplazamiento distinto (Cᵢ = (Pᵢ + Kᵢ) mod 26), ocultando frecuencias simples.',
        category: 'Sustitución polialfabética',
      },
      de: {
        label: 'Vigenère-Chiffre',
        description: 'Polyalphabetische Substitution mithilfe eines wiederholten Schlüsselworts.',
        tooltip:
          'Verwendet ein Schlüsselwort, sodass jeder Buchstabe eine eigene Verschiebung erhält (Cᵢ = (Pᵢ + Kᵢ) mod 26) und einfache Häufigkeitsmuster verschleiert.',
        category: 'Polyalphabetische Substitution',
      },
      ja: {
        label: 'ヴィジュネル暗号',
        description: '繰り返すキーワードを用いた多表式換字暗号です。',
        tooltip:
          'キーワードの各文字でシフト量を変える（Cᵢ = (Pᵢ + Kᵢ) mod 26）ことで、単純な文字頻度分析を防ぎます。',
        category: '多表式換字暗号',
      },
    },
  },
  {
    id: 'atbash',
    requiresKey: false,
    keyType: 'none',
    defaultKey: '',
    example: 'ALFA ↔ ZOUZ',
    locales: {
      sr: {
        label: 'Atbaš ogledalo',
        description: 'Simetrično preslikava A↔Z, B↔Y, C↔X kroz čitavu abecedu.',
        tooltip:
          'Drevna inverzna šifra bez ključa: prvo slovo abecede prelazi u poslednje, drugo u pretposlednje (25 − indeks). Isti postupak služi i za šifrovanje i za dešifrovanje.',
        category: 'Simetrična inverzija',
      },
      en: {
        label: 'Atbash Mirror',
        description: 'Symmetrically reverses the alphabet (A↔Z, B↔Y, C↔X).',
        tooltip:
          'Keyless reciprocal mirror cipher mapping index i to 25 − i. The exact same operation both encrypts and decrypts the message.',
        category: 'Reciprocal Inversion',
      },
      ru: {
        label: 'Зеркало Атбаш',
        description: 'Симметрично отражает алфавит (A↔Z, B↔Y, C↔X).',
        tooltip:
          'Древний шифр без ключа, отображающий букву с индексом i в 25 − i. Одна и та же операция служит для шифрования и расшифровки.',
        category: 'Симметричная инверсия',
      },
      zh: {
        label: '埃特巴什镜像',
        description: '将字母表对称反转映射（A↔Z, B↔Y, C↔X）。',
        tooltip:
          '无需密钥的对称互逆密码，将位置 i 映射到 25 − i。加密与解密执行完全相同的操作。',
        category: '对称反转密码',
      },
      es: {
        label: 'Espejo Atbash',
        description: 'Invierte simétricamente el alfabeto (A↔Z, B↔Y, C↔X).',
        tooltip:
          'Cifrado recíproco sin clave que asigna el índice i a 25 − i. La misma operación cifra y descifra el mensaje.',
        category: 'Inversión recíproca',
      },
      de: {
        label: 'Atbasch-Spiegel',
        description: 'Kehrt das Alphabet symmetrisch um (A↔Z, B↔Y, C↔X).',
        tooltip:
          'Schlüssellose reziproke Chiffre (Index i → 25 − i). Verschlüsselung und Entschlüsselung sind identisch.',
        category: 'Reziproke Inversion',
      },
      ja: {
        label: 'アトバシュ鏡像暗号',
        description: 'アルファベットを対称反転します（A↔Z, B↔Y, C↔X）。',
        tooltip:
          '鍵不要の対称換字暗号で、文字位置 i を 25 − i に変換します。暗号化と復号が同じ操作です。',
        category: '対称反転暗号',
      },
    },
  },
  {
    id: 'railfence',
    requiresKey: true,
    keyType: 'number',
    defaultKey: '3',
    example: 'SIGNAL (3) → SAINLG',
    locales: {
      sr: {
        label: 'Rail Fence (cik-cak)',
        description: 'Transpoziciona šifra koja ispisuje karaktere dijagonalno po šinama.',
        tooltip:
          'Ne menja sama slova, već njihov redosled: tekst se upisuje cik-cak kroz R horizontalnih redova (šina), a zatim čita red po red u šifrat.',
        category: 'Transpoziciona šifra',
      },
      en: {
        label: 'Rail Fence',
        description: 'Transposition cipher writing characters diagonally across rails.',
        tooltip:
          'Permutes character positions without altering symbols by writing diagonally down and up across R rails, then reading row by row.',
        category: 'Transposition Cipher',
      },
      ru: {
        label: 'Частокол (Rail Fence)',
        description: 'Шифр перестановки с диагональной записью символов по R строкам.',
        tooltip:
          'Не меняет сами символы, а переставляет их, записывая зигзагом по R рельсам и считывая построчно.',
        category: 'Шифр перестановки',
      },
      zh: {
        label: '栅栏密码',
        description: '沿多条平行轨道以锯齿形对角写入字符的换位密码。',
        tooltip:
          '不改变字符本身，而是按 R 行波浪形对角排列后逐行读取输出密文。',
        category: '换位密码',
      },
      es: {
        label: 'Rail Fence (zigzag)',
        description: 'Cifrado por transposición que escribe caracteres en diagonal sobre rieles.',
        tooltip:
          'Permuta posiciones sin cambiar símbolos escribiendo en zigzag por R filas y leyendo fila por fila.',
        category: 'Cifrado por transposición',
      },
      de: {
        label: 'Gartenzaun-Chiffre',
        description: 'Transpositionschiffre, die Zeichen diagonal über R Zeilen verteilt.',
        tooltip:
          'Vertauscht Zeichenpositionen im Zickzack über R Schienen und liest anschließend zeilenweise aus.',
        category: 'Transpositionschiffre',
      },
      ja: {
        label: 'レールフェンス暗号',
        description: '文字をジグザグの対角線上に配置して並べ替える転置式暗号です。',
        tooltip:
          '文字自体は変えず、R 本のレールにジグザグに書き込んでから行ごとに読み出します。',
        category: '転置式暗号',
      },
    },
  },
  {
    id: 'xor_hex',
    requiresKey: true,
    keyType: 'text',
    defaultKey: 'KOD99',
    example: 'A ⊕ K → 0A',
    locales: {
      sr: {
        label: 'XOR + Hex tok',
        description: 'Bitovska XOR operacija sa ključem zapisana u heksadecimalnom obliku.',
        tooltip:
          'Svaki bajt poruke kombinuje se ekskluzivnim ILI (XOR) sa bajtovima ključa i prikazuje kao dvokarakterni Hex zapis, kako bi se izbegli nevidljivi kontrolni znaci.',
        category: 'Bitovski protočni tok',
      },
      en: {
        label: 'XOR + Hex Stream',
        description: 'Bitwise XOR with a secret key encoded as uppercase Hex bytes.',
        tooltip:
          'Combines each UTF-8 byte with repeating key bytes via bitwise XOR, formatted as uppercase Hex pairs for safe ASCII and Morse transport.',
        category: 'Bitwise Stream XOR',
      },
      ru: {
        label: 'XOR + Hex поток',
        description: 'Побитовый XOR с секретным ключом в шестнадцатеричном формате.',
        tooltip:
          'Каждый байт сообщения объединяется операцией XOR с байтами ключа и выводится в Hex-виде для безопасной передачи в ASCII и Морзе.',
        category: 'Побитовый потоковый XOR',
      },
      zh: {
        label: 'XOR + 十六进制流',
        description: '使用密钥进行按位异或运算并输出为大写十六进制字节。',
        tooltip:
          '将每个 UTF-8 字节与循环密钥字节执行按位 XOR，并格式化为十六进制对以便安全传输和转摩尔斯码。',
        category: '按位流式 XOR',
      },
      es: {
        label: 'Flujo XOR + Hex',
        description: 'Operación XOR bit a bit con clave secreta codificada en Hex.',
        tooltip:
          'Combina cada byte UTF-8 con la clave mediante XOR y lo formatea en pares hexadecimales seguros para Morse y ASCII.',
        category: 'Flujo XOR bit a bit',
      },
      de: {
        label: 'XOR + Hex-Strom',
        description: 'Bitweises XOR mit geheimem Schlüssel als Hexadezimal-Bytes.',
        tooltip:
          'Verknüpft jedes UTF-8-Byte per XOR mit dem Schlüssel und formatiert das Ergebnis als sichere Hex-Paare.',
        category: 'Bitweiser XOR-Strom',
      },
      ja: {
        label: 'XOR + 16進ストリーム',
        description: '秘密鍵とビット単位 XOR を行い 16進数バイト列で出力します。',
        tooltip:
          '各 UTF-8 バイトを鍵バイトと XOR 演算し、安全な ASCII/モールス転送のため大文字 16進ペアに整形します。',
        category: 'ビット演算 XOR ストリーム',
      },
    },
  },
  {
    id: 'base64',
    requiresKey: false,
    keyType: 'none',
    defaultKey: '',
    example: 'SOS → U09T',
    locales: {
      sr: {
        label: 'Base64 kodiranje',
        description: 'Pretvara tekst u standardni 64-simbolni transportni zapis.',
        tooltip:
          'Determinističko kodiranje (ne tajna šifra) koje deli binarne podatke u grupe od po 6 bita i mapira ih u 64 bezbedna ASCII znaka za prenos kroz tekstualne kanale.',
        category: 'Transportno kodiranje',
      },
      en: {
        label: 'Base64 Encoding',
        description: 'Encodes UTF-8 text into standard Base64 ASCII representation.',
        tooltip:
          'Deterministic encoding (not encryption) that packs binary bytes into 6-bit groups mapped to 64 printable ASCII characters.',
        category: 'Transport Encoding',
      },
      ru: {
        label: 'Кодирование Base64',
        description: 'Преобразует UTF-8 текст в стандартную 64-символьную ASCII-запись.',
        tooltip:
          'Детерминированное кодирование, упаковывающее байты в 6-битные группы из 64 печатных ASCII-символов.',
        category: 'Транспортное кодирование',
      },
      zh: {
        label: 'Base64 编码',
        description: '将 UTF-8 文本编码为标准的 64 字符 ASCII 表示形式。',
        tooltip:
          '确定性传输编码（非加密），将二进制字节按 6 位分组映射到 64 个可打印 ASCII 字符。',
        category: '传输编码',
      },
      es: {
        label: 'Codificación Base64',
        description: 'Codifica texto UTF-8 en representación ASCII estándar de 64 símbolos.',
        tooltip:
          'Codificación determinista que agrupa bytes en bloques de 6 bits mapeados a 64 caracteres ASCII imprimibles.',
        category: 'Codificación de transporte',
      },
      de: {
        label: 'Base64-Kodierung',
        description: 'Kodiert UTF-8-Text in die standardisierte 64-Zeichen-ASCII-Darstellung.',
        tooltip:
          'Deterministische Transportkodierung (keine Verschlüsselung), die Bytes in 6-Bit-Gruppen aus 64 ASCII-Zeichen abbildet.',
        category: 'Transportkodierung',
      },
      ja: {
        label: 'Base64 エンコード',
        description: 'UTF-8 テキストを標準 64 文字の ASCII 表現に変換します。',
        tooltip:
          'バイナリデータを 6 ビット単位で 64 種の印字可能 ASCII 文字へ変換する決定的エンコード方式です。',
        category: 'トランスポート符号化',
      },
    },
  },
  {
    id: 'binary',
    requiresKey: false,
    keyType: 'none',
    defaultKey: '',
    example: 'A → 01000001',
    locales: {
      sr: {
        label: 'Binarni kod (8-bit)',
        description: 'Prikazuje svaki karakter kao osmobitnu binarnu reč.',
        tooltip:
          'Pretvara svaki UTF-8 bajt poruke u niz od osam nula i jedinica (MSB → LSB), što omogućava direktan uvid u računarsku reprezentaciju teksta.',
        category: 'Binarni zapis',
      },
      en: {
        label: '8-Bit Binary',
        description: 'Represents every character as an 8-bit binary byte.',
        tooltip:
          'Converts every UTF-8 byte into an 8-bit binary word (MSB → LSB), exposing raw bit-level representation.',
        category: 'Binary Representation',
      },
      ru: {
        label: 'Двоичный код (8-бит)',
        description: 'Представляет каждый символ в виде 8-битного двоичного байта.',
        tooltip:
          'Преобразует каждый байт UTF-8 в восемь нулей и единиц (MSB → LSB), наглядно показывая битовое представление.',
        category: 'Двоичное представление',
      },
      zh: {
        label: '8位二进制编码',
        description: '将每个字符表示为 8 位二进制字节。',
        tooltip:
          '将每个 UTF-8 字节转换为 8 位 0/1 序列（高位到低位），直观展示数据的底层比特结构。',
        category: '二进制表示',
      },
      es: {
        label: 'Binario (8 bits)',
        description: 'Representa cada carácter como un byte binario de 8 bits.',
        tooltip:
          'Convierte cada byte UTF-8 en palabras de 8 ceros y unos (MSB → LSB) exponiendo la representación binaria.',
        category: 'Representación binaria',
      },
      de: {
        label: '8-Bit-Binärcode',
        description: 'Stellt jedes Zeichen als 8-Bit-Binärwort dar.',
        tooltip:
          'Wandelt jedes UTF-8-Byte in eine Folge aus acht Nullen und Einsen (MSB → LSB) um.',
        category: 'Binärdarstellung',
      },
      ja: {
        label: '8ビット2進コード',
        description: '各文字を 8 ビットの 2 進数バイトとして表示します。',
        tooltip:
          '各 UTF-8 バイトを 8 桁の 0 と 1（MSB → LSB）に変換し、生のビット表現を確認できます。',
        category: '2進数表現',
      },
    },
  },
];

export const MORSE_MAP: Record<string, string> = {
  A: '.-',
  B: '-...',
  C: '-.-.',
  D: '-..',
  E: '.',
  F: '..-.',
  G: '--.',
  H: '....',
  I: '..',
  J: '.---',
  K: '-.-',
  L: '.-..',
  M: '--',
  N: '-.',
  O: '---',
  P: '.--.',
  Q: '--.-',
  R: '.-.',
  S: '...',
  T: '-',
  U: '..-',
  V: '...-',
  W: '.--',
  X: '-..-',
  Y: '-.--',
  Z: '--..',
  '0': '-----',
  '1': '.----',
  '2': '..---',
  '3': '...--',
  '4': '....-',
  '5': '.....',
  '6': '-....',
  '7': '--...',
  '8': '---..',
  '9': '----.',
  '.': '.-.-.-',
  ',': '--..--',
  '?': '..--..',
  '!': '-.-.--',
  '/': '-..-.',
  '-': '-....-',
  '(': '-.--.',
  ')': '-.--.-',
  ':': '---...',
  ';': '-.-.-.',
  '=': '-...-',
  '+': '.-.-.',
  '@': '.--.-.',
};

export const REVERSE_MORSE_MAP: Record<string, string> = Object.entries(MORSE_MAP).reduce(
  (acc, [char, code]) => {
    acc[code] = char;
    return acc;
  },
  {} as Record<string, string>
);

export function normalizeForMorse(input: string): string {
  return input
    .replace(/Č/g, 'C')
    .replace(/č/g, 'c')
    .replace(/Ć/g, 'C')
    .replace(/ć/g, 'c')
    .replace(/Š/g, 'S')
    .replace(/š/g, 's')
    .replace(/Ž/g, 'Z')
    .replace(/ž/g, 'z')
    .replace(/Đ/g, 'DJ')
    .replace(/đ/g, 'dj')
    .toUpperCase();
}

export function textToMorse(text: string): string {
  const normalized = normalizeForMorse(text).trim();
  if (!normalized) return '';
  const words = normalized.split(/\s+/);
  return words
    .map((word) =>
      Array.from(word)
        .map((ch) => MORSE_MAP[ch] ?? '')
        .filter(Boolean)
        .join(' ')
    )
    .filter(Boolean)
    .join(' / ');
}

export function morseToText(morse: string): string {
  const cleaned = morse
    .trim()
    .replace(/•|·/g, '.')
    .replace(/—|–|_/g, '-');
  if (!cleaned) return '';

  const words = cleaned.split(/\s*\/\s*|\s{3,}/);
  return words
    .map((word) =>
      word
        .trim()
        .split(/\s+/)
        .map((symbol) => {
          if (!symbol) return '';
          return REVERSE_MORSE_MAP[symbol] ?? '?';
        })
        .join('')
    )
    .join(' ');
}

export interface MorsePulseFrame {
  on: boolean;
  durationMs: number;
  symbol: string;
  charIndex: number;
}

export function buildMorsePulseTimeline(morse: string, wpm = 16): MorsePulseFrame[] {
  const dotMs = Math.max(35, Math.round(1200 / Math.max(5, Math.min(40, wpm))));
  const frames: MorsePulseFrame[] = [];
  const tokens = morse.trim().split('');

  for (let i = 0; i < tokens.length; i++) {
    const ch = tokens[i];
    if (ch === '.' || ch === '·') {
      frames.push({ on: true, durationMs: dotMs, symbol: '.', charIndex: i });
      frames.push({ on: false, durationMs: dotMs, symbol: ' ', charIndex: i });
    } else if (ch === '-' || ch === '—') {
      frames.push({ on: true, durationMs: dotMs * 3, symbol: '-', charIndex: i });
      frames.push({ on: false, durationMs: dotMs, symbol: ' ', charIndex: i });
    } else if (ch === '/') {
      frames.push({ on: false, durationMs: dotMs * 4, symbol: '/', charIndex: i });
    } else if (ch === ' ') {
      frames.push({ on: false, durationMs: dotMs * 2, symbol: ' ', charIndex: i });
    }
  }
  return frames;
}

function shiftChar(char: string, shift: number): string {
  const code = char.charCodeAt(0);
  if (code >= 65 && code <= 90) {
    return String.fromCharCode((((code - 65 + shift) % 26) + 26) % 26 + 65);
  }
  if (code >= 97 && code <= 122) {
    return String.fromCharCode((((code - 97 + shift) % 26) + 26) % 26 + 97);
  }
  return char;
}

function caesarTransform(text: string, shift: number): string {
  const clean = normalizeForMorse(text);
  return Array.from(clean)
    .map((ch) => shiftChar(ch, shift))
    .join('');
}

function vigenereTransform(text: string, key: string, decrypt: boolean): string {
  const cleanText = normalizeForMorse(text);
  const cleanKey = normalizeForMorse(key).replace(/[^A-Z]/g, '') || 'SOLARIS';
  let keyIdx = 0;
  return Array.from(cleanText)
    .map((ch) => {
      const code = ch.charCodeAt(0);
      if (code >= 65 && code <= 90) {
        const kShift = cleanKey.charCodeAt(keyIdx % cleanKey.length) - 65;
        keyIdx++;
        return shiftChar(ch, decrypt ? -kShift : kShift);
      }
      return ch;
    })
    .join('');
}

function atbashTransform(text: string): string {
  const clean = normalizeForMorse(text);
  return Array.from(clean)
    .map((ch) => {
      const code = ch.charCodeAt(0);
      if (code >= 65 && code <= 90) {
        return String.fromCharCode(90 - (code - 65));
      }
      return ch;
    })
    .join('');
}

function railFenceEncrypt(text: string, rails: number): string {
  const r = Math.max(2, Math.min(8, rails));
  if (text.length <= 1) return text;
  const rows: string[] = Array.from({ length: r }, () => '');
  let row = 0;
  let dir = 1;
  for (const ch of text) {
    rows[row] += ch;
    if (row === 0) dir = 1;
    else if (row === r - 1) dir = -1;
    row += dir;
  }
  return rows.join('');
}

function railFenceDecrypt(cipher: string, rails: number): string {
  const r = Math.max(2, Math.min(8, rails));
  const len = cipher.length;
  if (len <= 1) return cipher;

  const pattern: number[] = [];
  let row = 0;
  let dir = 1;
  for (let i = 0; i < len; i++) {
    pattern.push(row);
    if (row === 0) dir = 1;
    else if (row === r - 1) dir = -1;
    row += dir;
  }

  const counts = Array(r).fill(0);
  pattern.forEach((p) => counts[p]++);

  const railChars: string[][] = [];
  let cursor = 0;
  for (let i = 0; i < r; i++) {
    railChars.push(cipher.slice(cursor, cursor + counts[i]).split(''));
    cursor += counts[i];
  }

  const railPointers = Array(r).fill(0);
  return pattern
    .map((p) => {
      const ch = railChars[p][railPointers[p]];
      railPointers[p]++;
      return ch ?? '';
    })
    .join('');
}

function xorHexEncrypt(text: string, key: string): string {
  const k = key || 'KOD';
  const bytes = new TextEncoder().encode(text);
  const keyBytes = new TextEncoder().encode(k);
  return Array.from(bytes)
    .map((b, i) => (b ^ keyBytes[i % keyBytes.length]).toString(16).padStart(2, '0').toUpperCase())
    .join(' ');
}

function xorHexDecrypt(hex: string, key: string): string {
  const k = key || 'KOD';
  const keyBytes = new TextEncoder().encode(k);
  const tokens = hex.trim().split(/[\s:,-]+/).filter(Boolean);
  const bytes = new Uint8Array(
    tokens.map((t, i) => {
      const val = parseInt(t, 16);
      if (Number.isNaN(val)) return 0;
      return val ^ keyBytes[i % keyBytes.length];
    })
  );
  return new TextDecoder().decode(bytes);
}

export function applyCipher(
  text: string,
  algorithm: CipherAlgorithm,
  mode: 'encrypt' | 'decrypt',
  key: string
): string {
  if (!text) return '';
  try {
    switch (algorithm) {
      case 'caesar': {
        const shift = parseInt(key, 10);
        const s = Number.isNaN(shift) ? 7 : ((shift % 26) + 26) % 26;
        return caesarTransform(text, mode === 'encrypt' ? s : -s);
      }
      case 'vigenere':
        return vigenereTransform(text, key || 'SOLARIS', mode === 'decrypt');
      case 'atbash':
        return atbashTransform(text);
      case 'railfence': {
        const rails = parseInt(key, 10) || 3;
        return mode === 'encrypt'
          ? railFenceEncrypt(text, rails)
          : railFenceDecrypt(text, rails);
      }
      case 'xor_hex':
        return mode === 'encrypt' ? xorHexEncrypt(text, key) : xorHexDecrypt(text, key);
      case 'base64': {
        if (mode === 'encrypt') {
          const bytes = new TextEncoder().encode(text);
          let bin = '';
          bytes.forEach((b) => (bin += String.fromCharCode(b)));
          return btoa(bin);
        } else {
          const bin = atob(text.trim());
          const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
          return new TextDecoder().decode(bytes);
        }
      }
      case 'binary': {
        if (mode === 'encrypt') {
          const bytes = new TextEncoder().encode(text);
          return Array.from(bytes)
            .map((b) => b.toString(2).padStart(8, '0'))
            .join(' ');
        } else {
          const tokens = text.trim().split(/\s+/).filter(Boolean);
          const bytes = Uint8Array.from(tokens, (t) => parseInt(t, 2) || 0);
          return new TextDecoder().decode(bytes);
        }
      }
      default:
        return text;
    }
  } catch {
    return mode === 'decrypt' ? '[Neispravan format šifre za dekodiranje]' : text;
  }
}

export interface FrequencyEntry {
  char: string;
  count: number;
  pct: number;
}

export interface CipherStep {
  algorithm: CipherAlgorithm;
  key: string;
}

export type CapabilityTierKey =
  | 'recruit'
  | 'operative'
  | 'specialist'
  | 'cryptanalyst'
  | 'master'
  | 'grandmaster';

export interface ChallengeLevelProfile {
  level: number;
  tier: 1 | 2 | 3 | 4 | 5 | 6;
  tierKey: CapabilityTierKey;
  layerCount: 1 | 2 | 3 | 4;
  wpm: number;
  keyVisibility: 'full' | 'masked' | 'hidden';
  algoVisibility: 'full' | 'partial' | 'classified';
  minWords: number;
  maxWords: number;
  includeDigits: boolean;
  xpReward: number;
}

export function clampChallengeLevel(rawLevel: number): number {
  if (!Number.isFinite(rawLevel)) return 1;
  return Math.max(1, Math.min(99, Math.round(rawLevel)));
}

export function getLevelProfile(rawLevel: number): ChallengeLevelProfile {
  const level = clampChallengeLevel(rawLevel);
  if (level <= 15) {
    return {
      level,
      tier: 1,
      tierKey: 'recruit',
      layerCount: 1,
      wpm: 13 + Math.floor((level - 1) / 5),
      keyVisibility: 'full',
      algoVisibility: 'full',
      minWords: 2,
      maxWords: 3,
      includeDigits: false,
      xpReward: 50 + level * 10,
    };
  }
  if (level <= 35) {
    return {
      level,
      tier: 2,
      tierKey: 'operative',
      layerCount: 1,
      wpm: 16 + Math.floor((level - 16) / 7),
      keyVisibility: 'full',
      algoVisibility: 'full',
      minWords: 3,
      maxWords: 4,
      includeDigits: level >= 25,
      xpReward: 120 + level * 15,
    };
  }
  if (level <= 55) {
    return {
      level,
      tier: 3,
      tierKey: 'specialist',
      layerCount: 2,
      wpm: 19 + Math.floor((level - 36) / 7),
      keyVisibility: 'masked',
      algoVisibility: 'full',
      minWords: 3,
      maxWords: 5,
      includeDigits: true,
      xpReward: 250 + level * 20,
    };
  }
  if (level <= 75) {
    return {
      level,
      tier: 4,
      tierKey: 'cryptanalyst',
      layerCount: 3,
      wpm: 22 + Math.floor((level - 56) / 7),
      keyVisibility: 'hidden',
      algoVisibility: 'partial',
      minWords: 4,
      maxWords: 5,
      includeDigits: true,
      xpReward: 420 + level * 25,
    };
  }
  if (level <= 95) {
    return {
      level,
      tier: 5,
      tierKey: 'master',
      layerCount: level >= 88 ? 4 : 3,
      wpm: 25 + Math.floor((level - 76) / 7),
      keyVisibility: 'hidden',
      algoVisibility: 'classified',
      minWords: 4,
      maxWords: 6,
      includeDigits: true,
      xpReward: 650 + level * 35,
    };
  }
  return {
    level,
    tier: 6,
    tierKey: 'grandmaster',
    layerCount: 4,
    wpm: 28 + Math.min(2, Math.floor((level - 96) / 2)),
    keyVisibility: 'hidden',
    algoVisibility: 'classified',
    minWords: 5,
    maxWords: 6,
    includeDigits: true,
    xpReward: 1000 + level * 50,
  };
}

export function applyCipherChain(
  text: string,
  steps: CipherStep[],
  mode: 'encrypt' | 'decrypt'
): string {
  if (!steps.length) return text;
  const ordered = mode === 'encrypt' ? steps : [...steps].reverse();
  return ordered.reduce(
    (acc, step) => applyCipher(acc, step.algorithm, mode, step.key),
    text
  );
}

export function maskCipherKey(key: string): string {
  const clean = (key || '').trim();
  if (!clean) return '—';
  if (/^\d+$/.test(clean)) {
    return clean.length > 1 ? `${clean[0]}*` : '*';
  }
  if (clean.length <= 2) return '**';
  return clean
    .split('')
    .map((ch, i) => (i === 0 || i === clean.length - 1 ? ch : '*'))
    .join('');
}

export function analyzeFrequencies(text: string): FrequencyEntry[] {
  const clean = text.toUpperCase().replace(/[^A-Z0-9.-]/g, '');
  if (!clean.length) return [];
  const counts = new Map<string, number>();
  for (const ch of clean) {
    counts.set(ch, (counts.get(ch) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([char, count]) => ({
      char,
      count,
      pct: Math.round((count / clean.length) * 100),
    }));
}

export function getTotalMaxChallengeXp(): number {
  let total = 0;
  for (let lvl = 1; lvl <= 99; lvl++) {
    total += getLevelProfile(lvl).xpReward;
  }
  return total;
}

export function calculateEarnedXp(clearedLevels: number[]): number {
  const unique = new Set(
    clearedLevels.filter((n) => Number.isInteger(n) && n >= 1 && n <= 99)
  );
  let total = 0;
  unique.forEach((lvl) => {
    total += getLevelProfile(lvl).xpReward;
  });
  return total;
}

export async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}


