import type { LegalContext, LegalDocument } from '@/lib/legal/types';

/**
 * Terms of use, English translation of `terms.vi.ts` (the Vietnamese text is the one that applies).
 * Draft, not yet reviewed by a lawyer: see `LEGAL_TEXT_REVIEWED`. Keep the sections, ids and
 * commitments identical to the Vietnamese text.
 */
export function termsEn({ product, domain, email, version }: LegalContext): LegalDocument {
  return {
    title: 'Terms of use',
    summary: `What you and ${product} promise each other when you create an account and learn on ${domain}.`,
    sections: [
      {
        id: 'pham-vi',
        heading: 'Scope and acceptance',
        blocks: [
          {
            type: 'p',
            text: `${product} (${domain}) is a website that helps pupils learn and revise Mathematics, Informatics, Physics and Chemistry in grades 5, 9 and 12. These terms apply to everything you do on the site, from reading the home page to using your account. “We” means the operator of ${product}. You can write to us at ${email}.`,
          },
          {
            type: 'p',
            text: `When you create an account you tick the box to agree. We record that, together with the version of the terms you agreed to (now ${version}) and the time. If you do not agree, please do not create an account; you can still read the public pages.`,
          },
          {
            type: 'p',
            text: 'These terms go with the Privacy policy, which explains how we collect, use and protect your data. The two texts are written to be read together.',
          },
        ],
      },
      {
        id: 'ai-dung',
        heading: 'Who may use it, and the part of parents and guardians',
        blocks: [
          {
            type: 'ul',
            items: [
              'A person aged 16 or over may create and use an account alone.',
              'A person under 16 (usually pupils in grades 5 and 9) may create and use an account only when a parent or guardian has agreed. Best of all, the parent or guardian creates the account with the child and keeps the password.',
              'A person under 18 does not buy a paid plan alone. A parent or guardian makes or approves the purchase.',
            ],
          },
          {
            type: 'p',
            text: 'The box you tick when you create an account means: you are 16 or over, or your parent or guardian has read these terms and agreed that you may use the service. We do not ask for a pupil’s real name, date of birth, phone number or email, so we cannot check age ourselves; we rely on your confirmation. If you are a parent or guardian and do not want your child to have an account, write to us and we will block or delete it.',
          },
        ],
      },
      {
        id: 'tai-khoan',
        heading: 'Account and password',
        blocks: [
          {
            type: 'ul',
            items: [
              'An account is a username and a password. We do not store the password; we store only a one-way hash.',
              'Keep your password secret. You are responsible for what happens on your account. One account per person; do not sell, rent or share it.',
              'Your username is currently shown to other members when you ask or answer in the community. Do not use your real name, another person’s name or offensive words.',
              'You can sign out of other devices in the account section. If you think your password has leaked, change it at once.',
              `Forgotten password: because we do not store an email, we reset it when you write to ${email} and give your username. We may ask for more details to make sure you own the account.`,
            ],
          },
        ],
      },
      {
        id: 'thanh-vien',
        heading: 'Membership plans, the free first month and payment',
        blocks: [
          {
            type: 'ul',
            items: [
              'A new account may use the service free for 30 days from the day it is created, with the trial allowance shown on the home page. The trial needs no payment details and does not turn into a paid plan by itself.',
              'After that, member features such as creating lessons with AI need a paid plan. The plans are 1 month, 6 months and 12 months; the prices are listed on the home page.',
              'The listed price is the final price you pay for that plan; we add no other charge. When a price changes, the new price applies only to plans bought afterwards, not to time you have already paid for.',
              `There is no automatic payment yet. You write to ${email} to choose a plan, pay by bank transfer as we explain, and we activate the plan once the money arrives. We never charge you by ourselves and never renew by ourselves.`,
              'A plan simply ends at its end date; you do not need to cancel. We show a notice on the home page when a plan is about to end and when it has ended.',
              'Each plan has an allowance for each one-month cycle, counted from the day and time the plan starts: a plan that starts at 21:15 on 20 October gets its allowance again at 21:15 on 20 November, then on 20 December, and so on until the plan ends. Unused allowance does not carry over to the next cycle. When the allowance is used up, the features that need AI pause until the next cycle or until we add more.',
              'If you buy a plan while another plan is running, the new plan starts when the running one ends, and the allowance of the cycle in progress does not change. The free month is one cycle.',
            ],
          },
          {
            type: 'p',
            text: 'Refunds: if you have not used any of the plan’s allowance and you write to us within 7 days of the transfer, we refund the whole amount to the account it came from. After that we do not refund the unused part, unless the fault is ours and cannot be put right, or the law requires a refund. Your rights as a consumer under the law stay as they are.',
          },
        ],
      },
      {
        id: 'noi-dung-ai',
        heading: 'Content made by AI',
        blocks: [
          {
            type: 'ul',
            items: [
              'Lessons, questions, solutions and the answers of the virtual teacher are produced by AI models. The virtual teacher is an AI, not a person.',
              'AI can be wrong, incomplete or unsuitable. Check it against your textbook and teachers, above all answers and formulas before an exam.',
              `${product} is a tool for learning and revision. We do not promise marks, exam results or learning results.`,
              'If you find content that is wrong or unsuitable for pupils, tell us so that we can fix it.',
            ],
          },
        ],
      },
      {
        id: 'noi-dung-nguoi-dung',
        heading: 'What you upload, and ownership',
        blocks: [
          {
            type: 'ul',
            items: [
              'The documents, questions and content you type or upload stay yours or the owner’s. You allow us to use them only to provide the service to you: to store and process them and to send them to AI providers to build lessons and answer you.',
              'You promise you have the right to use what you upload. Do not upload documents you have no right to use, and do not upload personal information about other people, or about yourself without need.',
              'We do not claim copyright in AI-made content produced from your requests, and we do not promise that the law protects it by copyright. You may use it to learn and teach for personal, non-commercial purposes.',
              'The software, design, trademarks and content we write belong to us or to those who license them to us. You may not copy them in bulk or resell them.',
            ],
          },
        ],
      },
      {
        id: 'cong-dong',
        heading: 'Questions and answers in the community',
        blocks: [
          {
            type: 'ul',
            items: [
              'Members can ask and answer questions about shared lessons. Questions, answers and votes can be seen by other members, together with the writer’s username.',
              'Write only about the lesson. Do not post names, phone numbers, addresses, photos or private information about yourself or others.',
              'Members can report unsuitable content. We may hide content and block an account from posting when there is a violation.',
              'The allowance reward for an answer chosen as best is for use in the service only, has no cash value and may be changed or stopped.',
            ],
          },
        ],
      },
      {
        id: 'quy-dinh',
        heading: 'What you must not do',
        blocks: [
          {
            type: 'ul',
            items: [
              'Use the site for anything unlawful, to harass or defraud, or to post violent, sexual, abusive or child-harming content.',
              'Try to reach another person’s account or data, guess passwords, or attack or overload the system.',
              'Create several accounts to get more free months or more allowance, or use automated tools to collect content or use up allowance.',
              'Use the site to train other models or resell access.',
              'Try to make the AI ignore the site’s safety limits.',
            ],
          },
        ],
      },
      {
        id: 'ben-thu-ba',
        heading: 'Third-party services and open-source software',
        blocks: [
          {
            type: 'p',
            text: `${product} is built on the open-source project OpenMAIC and other open-source libraries, under each project’s licence. To run, we use third-party services such as AI model providers, servers and network services; the Privacy policy gives the details. We are not responsible for interruptions these parties cause, beyond what the law provides.`,
          },
        ],
      },
      {
        id: 'tam-dung',
        heading: 'Suspension and ending',
        blocks: [
          {
            type: 'ul',
            items: [
              'You may stop using the service at any time and ask us by email to delete your account.',
              'We may suspend or close an account that breaks these terms, or when the law requires. Except in an emergency or where the law forbids it, we tell you in advance and give the reason; you may reply by email.',
              'When we close an account for a violation, the unused time of a paid plan is refunded in proportion, less what was used and less any loss the violation caused.',
              'We may withdraw a feature or the whole service. We then give at least 30 days’ notice and refund the unused part of a paid plan.',
            ],
          },
        ],
      },
      {
        id: 'trach-nhiem',
        heading: 'Limit of liability',
        blocks: [
          {
            type: 'p',
            text: `${product} is provided as it is. We try to keep the service running, but we do not promise it will never be interrupted or free of errors. As far as the law allows, we are not responsible for indirect loss, for you trusting AI content without checking it, or for loss of data caused by faults beyond our control. Nothing here excludes liability that the law does not allow to be excluded, or limits your right to complain.`,
          },
        ],
      },
      {
        id: 'thay-doi',
        heading: 'Changes to these terms',
        blocks: [
          {
            type: 'p',
            text: 'When we change the terms we change the version number at the top of the page and announce it on the home page at least 15 days before it takes effect. If a change is to your disadvantage you may stop using the service and ask for a refund of the unused part of a paid plan; if you keep using it after the date it takes effect, you are taken to agree. A change does not apply backwards to time you have already paid for.',
          },
        ],
      },
      {
        id: 'luat-va-giai-quyet',
        heading: 'Governing law and disputes',
        blocks: [
          {
            type: 'p',
            text: `These terms follow Vietnamese law. If you have a complaint, write to ${email}; we reply within 3 working days and try to settle it within 15 days. If we cannot agree, either side may turn to a mediation body or to the competent court in Vietnam. You may also complain to the competent state authority.`,
          },
        ],
      },
      {
        id: 'lien-he',
        heading: 'Contact',
        blocks: [
          {
            type: 'p',
            text: `Any question about the terms, your account, payment or a complaint: ${email}. The operator’s name, address and tax code will be given here once its business registration is complete.`,
          },
        ],
      },
    ],
  };
}
