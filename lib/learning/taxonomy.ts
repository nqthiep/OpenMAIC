/**
 * The fixed set of tags a catalog course may carry: a subject, grades and topics. Staff pick them
 * when they approve a share or mark a preview, and learners filter by them. Pure and shared by
 * the server (which refuses anything else) and the browser (which shows the names).
 *
 * A tag is one string, `<group>:<value>`: `subject:math`, `grade:12`, `topic:math.derivative`.
 * The ids never change, so a stored tag keeps its meaning when a name is reworded. The topic lists
 * follow the 2018 Vietnamese upper-secondary curriculum as remembered, not checked against the
 * official text; a teacher should review them before they are relied on.
 */

export const SUBJECTS = [
  'math',
  'physics',
  'chemistry',
  'informatics',
  'english',
  'biology',
  'other',
] as const;
export type Subject = (typeof SUBJECTS)[number];

export const GRADES = ['10', '11', '12'] as const;
export type Grade = (typeof GRADES)[number];

/** A course has at most one subject, this many grades and this many topics. */
export const MAX_GRADES = 2;
export const MAX_TOPICS = 3;

export interface Topic {
  /** Unique within its subject. */
  readonly id: string;
  readonly vi: string;
  readonly en: string;
}

const t = (id: string, vi: string, en: string): Topic => ({ id, vi, en });

export const TOPICS: Readonly<Record<Subject, readonly Topic[]>> = {
  math: [
    t('sets', 'Mệnh đề và tập hợp', 'Propositions and sets'),
    t('equations', 'Phương trình và bất phương trình', 'Equations and inequalities'),
    t('functions', 'Hàm số và đồ thị', 'Functions and graphs'),
    t('trigonometry', 'Lượng giác', 'Trigonometry'),
    t('vectors', 'Vectơ và toạ độ', 'Vectors and coordinates'),
    t('sequences', 'Dãy số', 'Sequences and series'),
    t('limits', 'Giới hạn', 'Limits'),
    t('derivative', 'Đạo hàm và khảo sát hàm số', 'Derivatives and function study'),
    t('exp_log', 'Mũ và logarit', 'Exponentials and logarithms'),
    t('integral', 'Nguyên hàm và tích phân', 'Antiderivatives and integrals'),
    t('solid_geometry', 'Hình học không gian', 'Solid geometry'),
    t('combinatorics_probability', 'Tổ hợp và xác suất', 'Combinatorics and probability'),
    t('statistics', 'Thống kê', 'Statistics'),
  ],
  physics: [
    t('kinematics', 'Động học', 'Kinematics'),
    t('dynamics', 'Động lực học', 'Dynamics'),
    t('energy_momentum', 'Công, năng lượng, động lượng', 'Work, energy and momentum'),
    t('circular_deformation', 'Chuyển động tròn và biến dạng', 'Circular motion and deformation'),
    t('oscillation', 'Dao động', 'Oscillations'),
    t('waves', 'Sóng', 'Waves'),
    t('electric_field', 'Điện trường', 'Electric field'),
    t('circuits', 'Dòng điện và mạch điện', 'Current and circuits'),
    t('thermal', 'Vật lí nhiệt', 'Thermal physics'),
    t('ideal_gas', 'Khí lí tưởng', 'Ideal gas'),
    t('magnetic_field', 'Từ trường', 'Magnetic field'),
    t('nuclear', 'Vật lí hạt nhân', 'Nuclear physics'),
  ],
  chemistry: [
    t('atom_periodic', 'Nguyên tử và bảng tuần hoàn', 'Atoms and the periodic table'),
    t('bonding', 'Liên kết hoá học', 'Chemical bonding'),
    t('reactions', 'Phản ứng hoá học', 'Chemical reactions'),
    t('equilibrium', 'Cân bằng hoá học', 'Chemical equilibrium'),
    t('nonmetals', 'Phi kim (halogen, nitrogen, sulfur)', 'Nonmetals (halogens, nitrogen, sulfur)'),
    t('hydrocarbons', 'Hydrocarbon', 'Hydrocarbons'),
    t('derivatives', 'Dẫn xuất hydrocarbon', 'Hydrocarbon derivatives'),
    t('ester_lipid_carb', 'Ester, lipid, carbohydrate', 'Esters, lipids, carbohydrates'),
    t(
      'nitrogen_organics',
      'Amine, amino acid, protein, polymer',
      'Amines, amino acids, proteins, polymers',
    ),
    t('electrochem_metals', 'Pin điện, điện phân, kim loại', 'Cells, electrolysis, metals'),
  ],
  informatics: [
    t('python', 'Lập trình Python', 'Python programming'),
    t('algorithms', 'Thuật toán', 'Algorithms'),
    t('databases', 'Cơ sở dữ liệu', 'Databases'),
    t('networks', 'Mạng và Internet', 'Networks and the Internet'),
    t('ai', 'Trí tuệ nhân tạo', 'Artificial intelligence'),
    t('digital_ethics', 'Ứng dụng và đạo đức số', 'Applications and digital ethics'),
  ],
  english: [
    t('phonetics', 'Ngữ âm', 'Phonetics'),
    t('vocabulary', 'Từ vựng', 'Vocabulary'),
    t('grammar', 'Ngữ pháp', 'Grammar'),
    t('communication', 'Giao tiếp', 'Communication'),
    t('reading', 'Đọc hiểu', 'Reading'),
    t('writing', 'Viết', 'Writing'),
  ],
  biology: [
    t('cell', 'Tế bào', 'Cells'),
    t('metabolism', 'Trao đổi chất và năng lượng', 'Metabolism and energy'),
    t('molecular_genetics', 'Di truyền phân tử', 'Molecular genetics'),
    t('chromosome_genetics', 'Di truyền nhiễm sắc thể', 'Chromosomal genetics'),
    t('population_genetics', 'Di truyền quần thể', 'Population genetics'),
    t('evolution', 'Tiến hoá', 'Evolution'),
    t('ecology', 'Sinh thái học', 'Ecology'),
    t('physiology', 'Sinh lí cơ thể', 'Physiology'),
    t('biotech', 'Công nghệ sinh học', 'Biotechnology'),
  ],
  other: [],
};

/** Every topic by its tag value (`math.derivative`). */
const TOPIC_BY_VALUE = new Map<string, { subject: Subject; topic: Topic }>(
  SUBJECTS.flatMap((subject) =>
    TOPICS[subject].map((topic) => [`${subject}.${topic.id}`, { subject, topic }] as const),
  ),
);

/** The value of a topic tag for a topic id of a subject: `topicValue('math', 'derivative')`. */
export const topicValue = (subject: Subject, topicId: string): string => `${subject}.${topicId}`;

export const isSubject = (value: string): value is Subject =>
  (SUBJECTS as readonly string[]).includes(value);
export const isGrade = (value: string): value is Grade =>
  (GRADES as readonly string[]).includes(value);
export const isTopicValue = (value: string): boolean => TOPIC_BY_VALUE.has(value);

/** The subject a topic value belongs to (`math.derivative` gives `math`). */
export const subjectOfTopic = (value: string): Subject | undefined =>
  TOPIC_BY_VALUE.get(value)?.subject;

/** The name of a topic in the visitor's language: Vietnamese for `vi`, English for the others. */
export function topicName(value: string, locale: string): string | undefined {
  const entry = TOPIC_BY_VALUE.get(value);
  if (!entry) return undefined;
  return locale.toLowerCase().startsWith('vi') ? entry.topic.vi : entry.topic.en;
}

export interface CourseTags {
  readonly subject?: Subject;
  readonly grades: readonly Grade[];
  /** Topic values, such as `math.derivative`. */
  readonly topics: readonly string[];
}

/** Splits a stored tag list into its parts; a tag that is not in the set is ignored. */
export function readTags(tags: readonly string[] | undefined): CourseTags {
  let subject: Subject | undefined;
  const grades: Grade[] = [];
  const topics: string[] = [];
  for (const tag of tags ?? []) {
    const at = tag.indexOf(':');
    const group = tag.slice(0, at);
    const value = tag.slice(at + 1);
    if (group === 'subject' && isSubject(value)) subject = value;
    else if (group === 'grade' && isGrade(value)) grades.push(value);
    else if (group === 'topic' && isTopicValue(value)) topics.push(value);
  }
  return { subject, grades, topics };
}

/** The tag strings of a chosen set, in a fixed order: subject, grades, then topics. */
export function tagsFor(choice: CourseTags): string[] {
  return [
    ...(choice.subject ? [`subject:${choice.subject}`] : []),
    ...GRADES.filter((grade) => choice.grades.includes(grade)).map((grade) => `grade:${grade}`),
    ...[...TOPIC_BY_VALUE.keys()]
      .filter((value) => choice.topics.includes(value))
      .map((value) => `topic:${value}`),
  ];
}

export type TagCheck = { ok: true; tags: string[] } | { ok: false; error: string };

/**
 * Whether a list of tags is allowed for one course, and if so the list in its fixed order.
 * An empty list is allowed: it clears the course's tags.
 */
export function validateTags(tags: readonly unknown[]): TagCheck {
  const strings: string[] = [];
  for (const tag of tags) {
    if (typeof tag !== 'string') return { ok: false, error: 'A tag must be text' };
    strings.push(tag);
  }
  if (new Set(strings).size !== strings.length) return { ok: false, error: 'Duplicate tag' };
  if (strings.filter((tag) => tag.startsWith('subject:')).length > 1) {
    return { ok: false, error: 'A course has at most one subject' };
  }
  const choice = readTags(strings);
  const known = tagsFor(choice);
  if (known.length !== strings.length) return { ok: false, error: 'Unknown tag' };
  if (choice.grades.length > MAX_GRADES) {
    return { ok: false, error: `A course has at most ${MAX_GRADES} grades` };
  }
  if (choice.topics.length > MAX_TOPICS) {
    return { ok: false, error: `A course has at most ${MAX_TOPICS} topics` };
  }
  if (choice.topics.some((value) => subjectOfTopic(value) !== choice.subject)) {
    return { ok: false, error: 'A topic must belong to the course subject' };
  }
  return { ok: true, tags: known };
}
