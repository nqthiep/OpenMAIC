/**
 * Suggests tags for a course from words in its title and scene titles, so the staff dialog opens
 * with a likely choice instead of an empty form. A suggestion is only a starting point: staff look
 * at it and save, and nothing is stored until they do. No AI and no network: plain keywords.
 *
 * Matching is on text without accents and in lower case (`Đạo hàm` becomes `dao ham`), and a
 * keyword must start at a word boundary, so `equation` also finds `equations`. The keywords are
 * kept conservative: a short or common word (`song`, `toan bo`) is left out, because a wrong
 * suggestion costs staff a click to undo and a missing one costs nothing.
 */
import { foldText } from '@/lib/home/catalog-filter';
import {
  GRADES,
  MAX_GRADES,
  MAX_TOPICS,
  SUBJECTS,
  TOPICS,
  tagsFor,
  topicValue,
  validateTags,
  type Grade,
  type Subject,
} from '@/lib/learning/taxonomy';

/** Keywords that name a subject on their own. */
const SUBJECT_WORDS: Partial<Record<Subject, readonly string[]>> = {
  physics: ['vat li', 'vat ly', 'physics'],
  chemistry: ['hoa hoc', 'chemistry'],
  informatics: ['tin hoc', 'informatics', 'computer science'],
  english: ['tieng anh', 'english', 'ielts'],
  biology: ['sinh hoc', 'biology'],
};

/** Keywords per topic value (`math.derivative`). */
const TOPIC_WORDS: Readonly<Record<string, readonly string[]>> = {
  'math.sets': ['menh de', 'tap hop', 'proposition', 'set theory'],
  'math.equations': ['phuong trinh', 'bat phuong trinh', 'equation', 'inequalit'],
  'math.functions': ['ham so', 'do thi ham', 'function'],
  'math.trigonometry': ['luong giac', 'trigonometr'],
  'math.vectors': ['vecto', 'vector', 'toa do'],
  'math.sequences': ['day so', 'cap so cong', 'cap so nhan', 'sequence'],
  'math.limits': ['gioi han', 'limit'],
  'math.derivative': ['dao ham', 'khao sat ham', 'derivative'],
  'math.exp_log': ['logarit', 'ham mu', 'logarithm', 'exponential'],
  'math.integral': ['tich phan', 'nguyen ham', 'integral', 'antiderivative'],
  'math.solid_geometry': [
    'hinh hoc khong gian',
    'khoi da dien',
    'hinh chop',
    'hinh tru',
    'hinh non',
    'mat cau',
    'solid geometry',
  ],
  'math.combinatorics_probability': [
    'xac suat',
    'to hop',
    'chinh hop',
    'hoan vi',
    'probability',
    'combinatoric',
  ],
  'math.statistics': ['thong ke', 'statistic', 'phuong sai', 'do lech chuan'],

  'physics.kinematics': ['dong hoc', 'kinematic'],
  'physics.dynamics': ['dong luc hoc', 'dynamics', 'dinh luat newton'],
  'physics.energy_momentum': ['dong luong', 'cong suat', 'momentum', 'nang luong'],
  'physics.circular_deformation': ['chuyen dong tron', 'bien dang', 'circular motion'],
  'physics.oscillation': ['dao dong', 'con lac', 'oscillation', 'pendulum'],
  'physics.waves': ['song co', 'song am', 'song dien tu', 'giao thoa', 'wave'],
  'physics.electric_field': ['dien truong', 'dinh luat coulomb', 'electric field'],
  'physics.circuits': ['dong dien', 'mach dien', 'dien tro', 'circuit'],
  'physics.thermal': ['vat li nhiet', 'nhiet dong luc', 'nhiet luong', 'thermal'],
  'physics.ideal_gas': ['khi li tuong', 'khi ly tuong', 'ideal gas'],
  'physics.magnetic_field': ['tu truong', 'cam ung dien tu', 'magnetic'],
  'physics.nuclear': ['hat nhan', 'phong xa', 'nuclear', 'radioactiv'],

  'chemistry.atom_periodic': ['nguyen tu', 'bang tuan hoan', 'periodic table'],
  'chemistry.bonding': ['lien ket hoa hoc', 'lien ket ion', 'lien ket cong hoa tri', 'bonding'],
  'chemistry.reactions': ['phan ung', 'oxi hoa khu', 'redox', 'reaction'],
  'chemistry.equilibrium': ['can bang hoa hoc', 'equilibrium'],
  'chemistry.nonmetals': ['halogen', 'nitrogen', 'sulfur', 'phi kim'],
  'chemistry.hydrocarbons': ['hydrocarbon', 'hidrocacbon', 'ankan', 'anken', 'alkane', 'alkene'],
  'chemistry.derivatives': ['ancol', 'alcohol', 'phenol', 'andehit', 'aldehyde', 'carboxylic'],
  'chemistry.ester_lipid_carb': [
    'este',
    'lipit',
    'lipid',
    'cacbohidrat',
    'carbohydrate',
    'glucozo',
  ],
  'chemistry.nitrogen_organics': ['amin', 'amino', 'protein', 'polime', 'polymer'],
  'chemistry.electrochem_metals': ['pin dien', 'dien phan', 'kim loai', 'electrolysis'],

  'biology.cell': ['te bao', 'cell'],
  'biology.metabolism': [
    'trao doi chat',
    'quang hop',
    'ho hap te bao',
    'metabolism',
    'photosynthesis',
  ],
  'biology.molecular_genetics': ['di truyen phan tu', 'adn', 'dna', 'arn', 'rna', 'phien ma'],
  'biology.chromosome_genetics': ['nhiem sac the', 'chromosome', 'quy luat di truyen', 'mendel'],
  'biology.population_genetics': ['di truyen quan the', 'population genetics', 'hardy'],
  'biology.evolution': ['tien hoa', 'evolution', 'chon loc tu nhien'],
  'biology.ecology': ['sinh thai', 'ecology', 'he sinh thai'],
  'biology.physiology': ['sinh li', 'sinh ly', 'physiology', 'huyet ap'],
  'biology.biotech': ['cong nghe sinh hoc', 'biotechnology', 'chuyen gen'],

  'informatics.python': ['python', 'lap trinh'],
  'informatics.algorithms': ['thuat toan', 'algorithm', 'sap xep'],
  'informatics.databases': ['co so du lieu', 'database', 'sql'],
  'informatics.networks': ['mang may tinh', 'internet', 'network'],
  'informatics.ai': ['tri tue nhan tao', 'artificial intelligence', 'machine learning', 'hoc may'],
  'informatics.digital_ethics': ['dao duc so', 'an toan thong tin', 'ban quyen'],

  'english.phonetics': ['ngu am', 'phat am', 'phonetic', 'trong am'],
  'english.vocabulary': ['tu vung', 'vocabulary', 'collocation'],
  'english.grammar': ['ngu phap', 'grammar', 'thi hien tai', 'tense'],
  'english.communication': ['giao tiep', 'communication', 'hoi thoai'],
  'english.reading': ['doc hieu', 'reading', 'cloze'],
  'english.writing': ['viet lai cau', 'writing', 'viet doan'],
};

const escape = (word: string) => word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * How many times a keyword starts a word in the folded text. A keyword of three letters or fewer
 * (`dna`, `sql`) must be the whole word, so `arn` does not match "Arnold".
 */
function hits(folded: string, word: string): number {
  const end = word.length <= 3 ? '(?![a-z0-9])' : '';
  return folded.match(new RegExp(`(?:^|[^a-z0-9])${escape(word)}${end}`, 'g'))?.length ?? 0;
}

/**
 * "Toán" (mathematics) must keep its accent: without it the word is `toan`, which is also
 * "toàn" (whole) and part of "bài toán" (a problem), found in every subject. So it is looked for
 * in the text as written, and a "bài toán" does not count.
 */
function mentionsMath(texts: readonly string[]): boolean {
  return texts.some((text) => {
    const lower = text.normalize('NFC').toLowerCase();
    return (
      [...lower.matchAll(/(^|[^\p{L}])toán(?![\p{L}])/gu)].some(
        (match) => !lower.slice(0, match.index + match[1]!.length).endsWith('bài '),
      ) || /(^|[^a-z])(math|mathematics)(?![a-z])/.test(lower)
    );
  });
}

/** Grades named as "lớp 12", "khối 11" or "grade 10". */
function gradesIn(folded: string): Grade[] {
  const found = new Set<Grade>();
  for (const match of folded.matchAll(/(?:lop|khoi|grade)\s*(10|11|12)(?![0-9])/g)) {
    found.add(match[1] as Grade);
  }
  return GRADES.filter((grade) => found.has(grade)).slice(0, MAX_GRADES);
}

/**
 * Tags a course probably has, from its title and scene titles. The subject comes from the topics
 * found (the subject with most of them), else from a subject keyword when exactly one is named.
 * Topics are those of that subject, the best-matched first, at most three. Returns an empty list
 * when nothing is clear, and always a list that passes `validateTags`.
 */
export function suggestTags(texts: readonly string[]): string[] {
  const folded = texts.map(foldText).join(' \n ');
  const score = new Map<string, number>();
  for (const subject of SUBJECTS) {
    for (const topic of TOPICS[subject]) {
      const value = topicValue(subject, topic.id);
      const total = (TOPIC_WORDS[value] ?? []).reduce((sum, word) => sum + hits(folded, word), 0);
      if (total > 0) score.set(value, total);
    }
  }

  const perSubject = new Map<Subject, number>();
  for (const value of score.keys()) {
    const subject = value.split('.')[0] as Subject;
    perSubject.set(subject, (perSubject.get(subject) ?? 0) + 1);
  }
  const named = [
    ...(mentionsMath(texts) ? (['math'] as Subject[]) : []),
    ...(Object.keys(SUBJECT_WORDS) as Subject[]).filter((subject) =>
      (SUBJECT_WORDS[subject] ?? []).some((word) => hits(folded, word) > 0),
    ),
  ];

  let subject: Subject | undefined;
  if (perSubject.size > 0) {
    // The subject with the most topics found; a tie goes to one the text names, else the first.
    const best = Math.max(...perSubject.values());
    const leaders = SUBJECTS.filter((candidate) => perSubject.get(candidate) === best);
    subject = leaders.find((candidate) => named.includes(candidate)) ?? leaders[0];
  } else if (named.length === 1) {
    subject = named[0];
  }

  const topics = subject
    ? [...score.entries()]
        .filter(([value]) => value.startsWith(`${subject}.`))
        .sort((a, b) => b[1] - a[1])
        .slice(0, MAX_TOPICS)
        .map(([value]) => value)
    : [];

  const tags = tagsFor({ subject, grades: gradesIn(folded), topics });
  const checked = validateTags(tags);
  return checked.ok ? checked.tags : [];
}
