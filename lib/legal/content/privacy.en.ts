import type { LegalContext, LegalDocument } from '@/lib/legal/types';

/**
 * Privacy policy, English translation of `privacy.vi.ts` (the Vietnamese text is the one that
 * applies). Draft, not yet reviewed by a lawyer: see `LEGAL_TEXT_REVIEWED`. Keep the sections, ids,
 * tables and commitments identical to the Vietnamese text.
 */
export function privacyEn({ product, domain, email, version }: LegalContext): LegalDocument {
  return {
    title: 'Privacy policy',
    summary: `What data ${product} collects, what it is used for, who receives it, how long it is kept, and how you stay in control of your data.`,
    sections: [
      {
        id: 'ai-chiu-trach-nhiem',
        heading: 'Who is responsible for your data',
        blocks: [
          {
            type: 'p',
            text: `The operator of ${product} (${domain}) decides what data is collected and what it is used for; in this policy it is “we”. You can reach us at ${email}. The operator’s name, address and tax code will be given here once its business registration is complete.`,
          },
          {
            type: 'p',
            text: `This policy (version ${version}) goes with the Terms of use. When you create an account you confirm that you have read it.`,
          },
        ],
      },
      {
        id: 'tom-tat',
        heading: 'The short version',
        blocks: [
          {
            type: 'ul',
            items: [
              'We need only a username and a password. We do not ask for a pupil’s real name, date of birth, phone number, email, address or location.',
              'No advertising, no selling of data, and no third-party analytics or tracking cookies.',
              'What you type when you create a lesson or talk to the virtual teacher is sent to AI model providers abroad so that they can answer. So do not type personal information there.',
              'Your username is currently shown to other members when you ask or answer in the community.',
              'You, or your parent or guardian, can see, correct and delete your data and withdraw your consent by writing to us.',
            ],
          },
        ],
      },
      {
        id: 'du-lieu-thu-thap',
        heading: 'The data we collect',
        blocks: [
          {
            type: 'table',
            head: ['Data', 'Where it comes from and what it is for', 'How long we keep it'],
            rows: [
              [
                'Account: username, password (stored only as a hash), role, creation date, the version of the terms accepted and when',
                'You enter it when you create the account. Used to sign you in, to give you the right access, and to show that you agreed to the terms.',
                'Until the account is deleted.',
              ],
              [
                'Sign-in session: session token (stored only as a hash) and its expiry',
                'Created when you sign in. Used to keep you signed in on the device.',
                '30 days from sign-in, or until you sign out.',
              ],
              [
                'Learning: lessons you create or join, progress, results of exercises and quizzes, the classes you join',
                'Arises as you learn. Used to save progress, to mark work, and so that the teacher of a class you join can see the class’s progress.',
                'Until you delete the content or the account is deleted.',
              ],
              [
                'Chats with the virtual teacher: your messages and the replies',
                'You type them. Used to answer you and keep the conversation. Sent to AI providers (section 6).',
                'Until you delete the conversation or the account is deleted.',
              ],
              [
                'Documents you upload (such as PDF files) and what you type to create a lesson',
                'You upload or type them. Used to build the lesson you ask for. Sent to AI providers (section 6).',
                'Until you delete them or the account is deleted.',
              ],
              [
                'Voice and web search (when these features are switched on)',
                'The audio you record or the search query is sent to the speech-recognition or search provider to answer you.',
                'We do not keep recordings separately; the provider may keep them under its own policy.',
              ],
              [
                'Community questions and answers: questions, answers, votes, reports',
                'You write them. Other members can see them, with your username.',
                'Until you delete them or we hide them; or the account is deleted.',
              ],
              [
                'Messages and support requests you send us (email, and support threads in the site)',
                'You send them. Used to reply to you. If you write by email, we see your email address.',
                'Up to 24 months after the last exchange.',
              ],
              [
                'Usage log: time, kind of feature, AI model, number of tokens and account id (not what you wrote)',
                'Arises each time you use an AI feature. Used to count your allowance, to detect abuse and to know running costs.',
                '24 months, then deleted.',
              ],
              [
                'Admin log: which administrator viewed or changed what on your account, and when',
                'Written automatically when an administrator handles an account. Used for oversight and to settle complaints.',
                '24 months, then deleted.',
              ],
              [
                'Technical data: IP address, browser type',
                'The server uses the IP address in memory to limit wrong password attempts; we do not write it to our database. Network and server providers (section 6) may keep their own access logs.',
                'In server memory, minutes to hours.',
              ],
            ],
          },
          {
            type: 'p',
            text: 'Data you may have put into your own content (such as a name, a school or a phone number in a message or document) is handled like the data above. That is why we advise you not to write personal information in lessons, messages or questions.',
          },
        ],
      },
      {
        id: 'khong-thu-thap',
        heading: 'What we do not do',
        blocks: [
          {
            type: 'ul',
            items: [
              'We do not ask for or store a real name, date of birth, phone number, address or location.',
              'We do not sell, rent or trade your data.',
              'We show no advertising and use no advertising cookies or third-party analytics.',
              'We do not use your data to train AI models of our own.',
            ],
          },
        ],
      },
      {
        id: 'muc-dich',
        heading: 'What we use data for',
        blocks: [
          {
            type: 'ul',
            items: [
              'To create and protect your account and let you sign in.',
              'To provide what you ask for: building lessons, marking work, answering questions, saving progress.',
              'To count allowance, activate membership and handle bank-transfer payments.',
              'To keep things safe: detecting odd sign-ins, abuse, and several accounts made to get more allowance.',
              'To answer support requests and complaints.',
              'To comply with the law and lawful requests from state authorities.',
            ],
          },
          {
            type: 'p',
            text: 'The basis for these uses is performing the service you signed up for, keeping the service and its users safe, and complying with the law. We do not use data for any other purpose unless we ask and you (or your parent or guardian) agree separately to that purpose. Such agreement is never a condition of using the service.',
          },
        ],
      },
      {
        id: 'chia-se',
        heading: 'Sharing data, and transfers abroad',
        blocks: [
          {
            type: 'table',
            head: ['Recipient', 'What it receives', 'What for'],
            rows: [
              [
                'AI model providers. We now use DeepSeek and Anthropic and may use others later. They are outside Vietnam.',
                'What you type when you create lessons and chat, documents you upload, and the part of the lesson needed as context for the answer.',
                'To build lessons and answer you. How a provider stores and uses data is set by its own policy.',
              ],
              [
                'Speech and search providers (when switched on)',
                'The audio you record or the search query.',
                'Speech recognition and finding information.',
              ],
              [
                'Server provider (OVHcloud) and network service (Cloudflare)',
                'All data that passes through or sits on their systems, because they run our infrastructure.',
                'To run the site and protect it from attack. They process only under their contract with us.',
              ],
              [
                'Backup store (a private repository on GitHub)',
                'Backups of the data, encrypted before they are sent.',
                'To restore the system when it fails.',
              ],
              [
                'Our teachers and administrators',
                'A class teacher sees the pupils’ progress in that class. Administrators see accounts and the usage log; every view is recorded.',
                'Teaching, support, operation.',
              ],
              [
                'Competent state authorities',
                'Data they lawfully request in writing.',
                'Compliance with the law.',
              ],
            ],
          },
          {
            type: 'p',
            text: 'When data leaves Vietnam (to AI providers and in backups), we send only what is needed and complete the steps that Vietnamese personal-data law requires for sending data abroad. By using the AI features you know that what you type is processed abroad.',
          },
        ],
      },
      {
        id: 'luu-tru-xoa',
        heading: 'How long we keep data, and deletion',
        blocks: [
          {
            type: 'ul',
            items: [
              'Each kind of data has its period in the table in section 3. When the period ends or the purpose is over, we delete the data or make it no longer identifiable as yours.',
              'When you ask us to delete your account, we delete your account data, lessons, conversations and documents within 20 days, except what the law requires us to keep. Your questions and answers in the community are deleted or lose your username.',
              'Encrypted backups are overwritten over time and gone after at most 90 days; deleted data is not restored into the running system.',
              'Records of transactions (amount, time, plan) are kept for the period the law sets for accounting and tax.',
            ],
          },
        ],
      },
      {
        id: 'quyen',
        heading: 'Your rights and how to use them',
        blocks: [
          {
            type: 'p',
            text: `You have the right to know what of your data is processed, to see it and get a copy, to correct it, delete it, restrict processing, object, withdraw consent, complain and claim damages when harmed. Write to ${email} from an email address you have, give your username and say what you want. We may ask for more to make sure you own the account. You can change your password and sign out of other devices at once in the account section.`,
          },
          {
            type: 'table',
            head: ['Request', 'We reply within', 'We complete within'],
            rows: [
              ['See, copy or correct data', '2 working days', '10 days'],
              ['Withdraw consent, restrict processing, object', '2 working days', '15 days'],
              ['Delete data', '2 working days', '20 days'],
            ],
          },
          {
            type: 'p',
            text: 'When more time is needed, or another provider must act, we tell you the reason and the new time. A valid request costs nothing. If we refuse, we say why.',
          },
        ],
      },
      {
        id: 'tre-em',
        heading: 'Children, parents and guardians',
        blocks: [
          {
            type: 'ul',
            items: [
              'The service is for pupils in grades 5, 9 and 12. A person under 16 may use it only when a parent or guardian has agreed; when creating the account, the user confirms this.',
              'We collect only the data needed for learning, ask for no real identifying details of a child, show no advertising and build no profile for commercial purposes.',
              'A parent or guardian can exercise every right in section 8 for the child: see, correct and delete data, withdraw consent, and ask for the account to be blocked or deleted. When you withdraw consent, we stop processing the child’s data and delete the account if you ask.',
              'We do not publish a child’s real name, photo or private life. The username is shown to other members when the child asks or answers in the community, so choose a username without a real name.',
              `If you think a child under 16 is using the service without a parent’s consent, tell ${email}; we will block the account as soon as we have checked.`,
            ],
          },
        ],
      },
      {
        id: 'bao-mat',
        heading: 'How we protect data',
        blocks: [
          {
            type: 'ul',
            items: [
              'Passwords are stored only as a one-way hash. The sign-in cookie is HttpOnly, so only the server reads it, and it is sent only over HTTPS.',
              'Wrong password attempts are limited. Administrators see only the data their work needs, and every view is recorded.',
              'Backups are encrypted before they leave the server.',
              'If an incident exposes personal data, we tell the competent authority within 72 hours of finding out, and tell the people affected when the law requires or when they risk harm.',
            ],
          },
          {
            type: 'p',
            text: 'No system is perfectly safe. We do our best, and you help by keeping your password secret.',
          },
        ],
      },
      {
        id: 'cookie',
        heading: 'Cookies and browser storage',
        blocks: [
          {
            type: 'table',
            head: ['Name', 'What for', 'Lifetime'],
            rows: [
              [
                'openmaic_session',
                'Keeps you signed in. Necessary; without it you cannot sign in.',
                '30 days',
              ],
              [
                'anonymous_id',
                'Tells visitors who have not signed in apart, so they do not see each other’s data. Holds no personal information.',
                '30 days',
              ],
              [
                'Browser local storage',
                'Remembers light or dark theme, language and settings on this device.',
                'Until you clear browser data',
              ],
            ],
          },
          {
            type: 'p',
            text: 'We set no advertising or tracking cookies. You can delete or block cookies in your browser, but then you cannot sign in.',
          },
        ],
      },
      {
        id: 'ai-tu-dong',
        heading: 'Processing by AI',
        blocks: [
          {
            type: 'p',
            text: 'Lessons, solutions and the virtual teacher’s answers are produced by AI models from what you put in. AI can be wrong. We use AI to help you learn, not to decide anything about your rights. You can choose not to use the AI features, but then many features of the service are unavailable.',
          },
        ],
      },
      {
        id: 'thay-doi',
        heading: 'Changes to this policy, and complaints',
        blocks: [
          {
            type: 'p',
            text: `When we change this policy we change the version number at the top of the page and announce it on the home page at least 15 days before it takes effect. If we want to use data for a new purpose, we ask for your agreement first. If you are not satisfied with how we handle data, write to ${email}; we reply within 3 working days. You may also complain to the competent state authority for personal-data protection.`,
          },
        ],
      },
    ],
  };
}
