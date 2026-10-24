// Fake OpenAI-compatible server for local end-to-end runs. Streams and non-streams, logs prompts.
import { createServer } from 'node:http';
import { appendFileSync } from 'node:fs';

const LOG = process.argv[2] || '/tmp/fake-llm.log';
const outline = {
  languageDirective: 'Dạy bằng tiếng Việt, ngắn gọn.',
  courseTitle: 'Phân số lớp 5',
  outlines: [
    { id: 'scene_1', type: 'slide', title: 'Phân số là gì?', description: 'Khái niệm phân số.', keyPoints: ['Tử số', 'Mẫu số'], order: 1 },
    { id: 'scene_2', type: 'slide', title: 'So sánh phân số', description: 'Quy đồng mẫu số.', keyPoints: ['Quy đồng', 'So sánh'], order: 2 },
  ],
};
const slide = {
  elements: [{ type: 'text', left: 80, top: 80, width: 840, height: 100, content: 'Phân số biểu thị một phần của một tổng thể.' }],
  background: { type: 'solid', color: '#ffffff' },
  remark: 'Slide minh hoạ.',
};
const actions = [{ type: 'text', content: 'Chào các em, hôm nay chúng ta học về phân số.' }];
const agents = [
  { name: 'Cô Lan', role: 'teacher', persona: 'Giáo viên Toán nhẹ nhàng.', avatar: '👩‍🏫', color: '#3b82f6', priority: 10 },
  { name: 'Minh', role: 'student', persona: 'Học sinh tò mò.', avatar: '🧒', color: '#10b981', priority: 5 },
];

function pick(system, user) {
  const s = (system || '') + '\n' + (user || '');
  if (/Slide Content Generator/i.test(s)) return slide;
  if (/Slide Action Generator|Action Generator/i.test(s)) return actions;
  if (/agent profile|agent-profile|roster|Agent Profile/i.test(s)) return { agents };
  return outline;
}

createServer((req, res) => {
  if (req.method === 'GET') { res.writeHead(200); res.end('ok'); return; }
  let body = '';
  req.setEncoding('utf8');
  req.on('data', (c) => (body += c));
  req.on('end', () => {
    let p = {};
    try { p = JSON.parse(body); } catch {}
    const msgs = p.messages || [];
    const text = (m) => (typeof m?.content === 'string' ? m.content : JSON.stringify(m?.content ?? ''));
    const system = text(msgs.find((m) => m.role === 'system'));
    const user = text(msgs.filter((m) => m.role === 'user').at(-1));
    const out = JSON.stringify(pick(system, user));
    appendFileSync(LOG, `${req.url} stream=${!!p.stream} model=${p.model} sys=${JSON.stringify(system.slice(0, 80))} -> ${out.slice(0, 40)}\n`);
    const usage = { prompt_tokens: 120, completion_tokens: 80, total_tokens: 200 };
    if (p.stream) {
      res.writeHead(200, { 'content-type': 'text/event-stream' });
      const chunk = (delta, finish = null, extra = {}) =>
        `data: ${JSON.stringify({ id: 'c1', object: 'chat.completion.chunk', model: p.model, choices: [{ index: 0, delta, finish_reason: finish }], ...extra })}\n\n`;
      res.write(chunk({ role: 'assistant', content: '' }));
      for (let i = 0; i < out.length; i += 60) res.write(chunk({ content: out.slice(i, i + 60) }));
      res.write(chunk({}, 'stop'));
      res.write(`data: ${JSON.stringify({ id: 'c1', object: 'chat.completion.chunk', model: p.model, choices: [], usage })}\n\n`);
      res.end('data: [DONE]\n\n');
    } else {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ id: 'c1', object: 'chat.completion', model: p.model, choices: [{ index: 0, message: { role: 'assistant', content: out }, finish_reason: 'stop' }], usage }));
    }
  });
}).listen(4010, '127.0.0.1', () => console.log('fake llm on 4010'));
