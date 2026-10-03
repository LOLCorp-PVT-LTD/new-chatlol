/**
 * ChatLOL's legal and community documents. One source for the in-app pages, the sign-up agreement and LOLShield,
 * the AI moderator (it enforces COMMUNITY_RULES by their keys). Bump LEGAL_VERSION when the meaning changes so
 * members are asked to accept the new version.
 *
 * DRAFT: written for the features ChatLOL actually has; have a solicitor review before launch. Items in [brackets]
 * are details only the company can fill in.
 */
export const LEGAL_VERSION = '2026-10-03';
export const LEGAL_COMPANY = {
  name: 'LOLCorp PVT LTD',
  number: '[company number]',
  address: '[registered office address]',
  contact: '[support email address]',
  safety: '[safety / reports email address]',
  law: 'England and Wales',
};

// ——— Community rules: what LOLShield enforces ———
/**
 * severity: how LOLShield treats a breach. 'severe' = removal + immediate suspension and human review;
 * 'high' = removal + strike; 'medium' = removal or warning + strike on repeat; 'low' = warning.
 */
export const COMMUNITY_RULES = [
  {
    key: 'adults_only', title: 'Adults only (18+)', severity: 'severe',
    summary: 'ChatLOL is for people aged 18 and over. Never share sexual or suggestive content involving minors, and never pretend to be under 18 or seek out minors.',
    examples: ['Saying you are 15', 'Asking someone if they are underage “for fun”', 'Any sexualised content involving anyone under 18'],
  },
  {
    key: 'violence_threats', title: 'No threats or violence', severity: 'severe',
    summary: 'No threats to hurt anyone, no encouraging violence, no glorifying attacks or terrorism.',
    examples: ['“I know where you live”', 'Celebrating a terror attack', 'Telling someone to hurt another person'],
  },
  {
    key: 'self_harm', title: 'No encouraging self-harm', severity: 'severe',
    summary: 'Never encourage suicide, self-harm or eating disorders. If someone is struggling, be kind and point them to help — LOLShield will show them support resources.',
    examples: ['Telling someone to kill themselves', 'Sharing methods of self-harm', 'Pro-eating-disorder “tips”'],
  },
  {
    key: 'harassment', title: 'No bullying or harassment', severity: 'high',
    summary: 'Don’t target, insult, demean, stalk or pile on anyone. Banter is fine when everyone’s laughing; it stops being banter when someone asks you to stop.',
    examples: ['Repeated insults at one person', 'Organising others to mass-report or mass-message someone', 'Mocking someone’s appearance after they asked you to stop'],
  },
  {
    key: 'hate', title: 'No hate speech', severity: 'high',
    summary: 'No attacking people for race, ethnicity, nationality, religion, disability, sex, gender identity, sexual orientation or age. No slurs, no hateful symbols.',
    examples: ['Slurs', 'Saying a group is subhuman', 'Hate symbols in profile pictures'],
  },
  {
    key: 'sexual_content', title: 'Keep it non-explicit', severity: 'high',
    summary: 'No nudity or sexually explicit content in public spaces (photos, shouts, profiles, lounges, streams). No unwanted sexual messages, ever.',
    examples: ['Nude photos', 'Explicit messages to someone who didn’t ask', 'Sexual content in a live stream'],
  },
  {
    key: 'non_consensual', title: 'No sharing others without consent', severity: 'severe',
    summary: 'Never share intimate images of anyone without their consent, and never share someone’s private information (address, phone, workplace, documents).',
    examples: ['Revenge porn', 'Posting someone’s home address', 'Screenshots of private chats to humiliate someone'],
  },
  {
    key: 'scams_fraud', title: 'No scams, fraud or selling accounts', severity: 'high',
    summary: 'No scams, phishing, fake giveaways, or asking for passwords or payment details. No buying, selling or trading accounts, Sparks, Gems, Gold or items for real money.',
    examples: ['“Send me your login for free Gems”', 'Selling Gold for cash', 'Fake Premium giveaways'],
  },
  {
    key: 'illegal', title: 'Nothing illegal', severity: 'severe',
    summary: 'No selling or promoting illegal drugs, weapons or services, and no content that breaks the law.',
    examples: ['Selling drugs', 'Offering fake documents', 'Promoting illegal gambling sites'],
  },
  {
    key: 'spam', title: 'No spam or manipulation', severity: 'medium',
    summary: 'No flooding, repeated messages, chain posts, unsolicited advertising, bots, or using multiple accounts to farm rewards, referrals or votes.',
    examples: ['Posting the same link 20 times', 'Alt accounts to farm referral Gold', 'Vote-buying in ratings'],
  },
  {
    key: 'impersonation', title: 'Be yourself', severity: 'medium',
    summary: 'Don’t pretend to be another person, a brand, ChatLOL staff or LOLShield. AI personas on ChatLOL are always labelled as AI.',
    examples: ['Using a celebrity’s name and photos', 'Claiming to be an admin to get someone’s details'],
  },
  {
    key: 'cheating', title: 'Play fair', severity: 'medium',
    summary: 'No cheating, exploiting bugs, colluding in games or tournaments, or abusing Ban/Mute/Kick tickets to harass people. Report bugs instead of using them.',
    examples: ['Two accounts in one tournament', 'Tampering with game scores', 'Ticket-banning the same person whenever you can'],
  },
  {
    key: 'profanity', title: 'Mind the language in public', severity: 'low',
    summary: 'Swearing isn’t banned, but keep it out of slurs and personal attacks, and respect members who turned on Safe mode.',
    examples: ['A steady stream of swearing at someone'],
  },
];
export const ruleByKey = (k) => COMMUNITY_RULES.find((r) => r.key === k);

// ——— Safety rules (advice for members) ———
export const SAFETY_RULES = [
  { title: 'Keep personal details private', body: 'Don’t share your address, phone number, school or workplace, passwords or financial details in chats, profiles or streams — even with people who seem friendly.' },
  { title: 'Meeting people', body: 'People aren’t always who they say they are. If you decide to meet someone you met online, meet in a busy public place, tell a friend where you’re going, and arrange your own transport.' },
  { title: 'Never send money', body: 'ChatLOL staff will never ask for your password or payment details. Anyone asking you for money, gift cards or crypto is very likely a scammer — report them.' },
  { title: 'Sparks, Gems and Gold have no cash value', body: 'They can’t be sold, bought from other members or turned into money. Offers to buy or sell them are scams and break our rules.' },
  { title: 'AI personas are labelled', body: 'Some profiles are AI personas created by ChatLOL; they always carry an AI badge. They are for fun and conversation, not advice.' },
  { title: 'Block, mute and report', body: 'You can block anyone, limit who can message you in Settings → Privacy, and report any post, message, profile or stream. LOLShield reviews reports straight away; serious ones go to our team.' },
  { title: 'Look after yourself', body: 'Take breaks — you can set break reminders in Settings. If you’re struggling, talk to someone you trust. In the UK you can call Samaritans free on 116 123, any time. If someone is in immediate danger, call 999.' },
  { title: 'Gaming responsibly', body: 'Arena stakes and tournaments use in-game currency only. Set your own limits, and step away if it stops being fun.' },
];

// ——— Terms & Conditions ———
const C = LEGAL_COMPANY;
export const TERMS = [
  { title: 'Who we are', body: `ChatLOL is run by ${C.name} (company number ${C.number}, registered office ${C.address}). Contact us at ${C.contact}. By creating an account or using ChatLOL you agree to these Terms, our Community Guidelines, Safety Rules and Privacy Notice.` },
  { title: 'Eligibility', body: 'You must be at least 18 years old. You must give accurate details when you sign up, keep your login secure and have only one account unless we allow otherwise. You are responsible for everything done through your account.' },
  { title: 'Your content', body: 'You keep ownership of what you post. You give us a worldwide, non-exclusive, royalty-free licence to host, display, adapt (for example resize) and distribute it on ChatLOL so the service works. You confirm you have the rights to anything you post. We may remove content that breaks these Terms or our Guidelines.' },
  { title: 'Moderation and enforcement', body: 'LOLShield, our AI moderator, and our staff review content and reports. Breaking the Guidelines can lead to removal, warnings, strikes, mutes, suspensions or permanent account closure, depending on how serious and how frequent the breach is. Removed content may be replaced with a notice that it was removed and why. Moderators must give a reason for every action; you can appeal by contacting us.' },
  { title: 'Virtual items and currencies', body: 'Sparks, Gems and Gold are in-game currencies and items in the Vault are virtual items. They are a limited licence to use features inside ChatLOL, not property. They have no cash value, cannot be exchanged for money, transferred to other members (except through features we provide, such as Premium Gifts) or sold, and are non-refundable except where the law requires. We may change prices, exchange rates and features. Earned progress (level, Sparks and Spark-bought items) is reset if you are away for 7 days in a row; Gems, Gem-bought items and Premium are kept.' },
  { title: 'Premium', body: 'Premium is a non-renewing pass for the period shown when you buy it. Payments are handled by Stripe, Apple or Google under their terms. If you are a consumer in the UK you may have a 14-day right to cancel a digital service; by starting to use Premium straight away you agree that this right ends once the service has been fully provided, as the law allows.' },
  { title: 'Games, stakes and tournaments', body: 'Arena stakes, tournament entry fees and prizes use in-game currency only. Nothing won in a game can be cashed out. Where a tournament offers a real-world prize, entry is free; prize rules are shown on the tournament page, winners may be asked to verify their identity and age, and we may withhold prizes won by cheating or collusion. We may void games affected by bugs or cheating and return stakes.' },
  { title: 'Tickets and the King of ChatLOL', body: 'Ban, Mute and Kick tickets let members restrict another member briefly within the limits we set. Using them to harass someone breaks the Guidelines and can lead to losing them and your account. Staff can reverse any ticket action. The King of ChatLOL title can be taken by another member at any time.' },
  { title: 'Referrals', body: 'Referral rewards are paid only for genuine new members who verify their email and reach the level shown. Rewards earned through fake, duplicate or self-referred accounts will be removed.' },
  { title: 'Ads and third parties', body: 'ChatLOL shows ads (Premium members may see none). Ads and links to other sites are provided by third parties; we are not responsible for their content or practices.' },
  { title: 'AI features', body: 'Some features use AI, including AI personas (always labelled) and LOLShield. AI can make mistakes; don’t rely on it for advice. You can choose whether AI personas appear in Settings.' },
  { title: 'Ending your account', body: 'You can close your account at any time in Settings. We may suspend or close accounts that break these Terms. When an account closes, virtual currencies and items are lost.' },
  { title: 'Liability', body: 'We provide ChatLOL “as is”. Nothing in these Terms limits liability that cannot legally be limited, including for death or personal injury caused by negligence, or fraud. Otherwise, we are not liable for indirect or unforeseeable losses, and our total liability to you is limited to the amount you paid us in the 12 months before the claim.' },
  { title: 'Changes', body: 'We may update these Terms. If a change is significant we will tell you in the app and ask you to accept the new version.' },
  { title: 'Law', body: `These Terms are governed by the law of ${C.law}. If you are a consumer, you also keep the protection of the mandatory laws of the country where you live.` },
];

// ——— Privacy notice (summary) ———
export const PRIVACY = [
  { title: 'Who controls your data', body: `${C.name} is the data controller for ChatLOL. Contact: ${C.contact}.` },
  { title: 'What we collect', body: 'Account details (email, handle, name, date of birth, gender), profile content, posts, messages, ratings, game and purchase history, device and usage data, and the reports you make or receive.' },
  { title: 'Why we use it', body: 'To run ChatLOL and your account (contract); to keep members safe, including automated moderation by LOLShield and human review (legitimate interests and legal obligations); to process payments; to improve the service; and, with your choice, to send notifications and emails.' },
  { title: 'Automated moderation', body: 'LOLShield automatically checks content against the Community Guidelines and can remove content or restrict accounts. Serious decisions are reviewed by people, and you can ask for a human review of any decision.' },
  { title: 'Who we share it with', body: 'Service providers who help us run ChatLOL (hosting, storage, email, payments, AI moderation and AI personas, ads), only as needed, and authorities where the law requires. We don’t sell your personal data.' },
  { title: 'How long we keep it', body: 'For as long as your account is open, then deleted or anonymised, except what we must keep for legal, safety or fraud-prevention reasons.' },
  { title: 'Your rights', body: 'You can access, correct, delete or export your data, object to some uses, and complain to the Information Commissioner’s Office (ico.org.uk). Contact us to use these rights.' },
];

export const LEGAL_DOCS = {
  terms: { title: 'Terms & Conditions', sections: TERMS },
  guidelines: { title: 'Community Guidelines', sections: COMMUNITY_RULES.map((r) => ({ title: r.title, body: r.summary, examples: r.examples, severity: r.severity })) },
  safety: { title: 'Safety Rules', sections: SAFETY_RULES },
  privacy: { title: 'Privacy Notice', sections: PRIVACY },
};
