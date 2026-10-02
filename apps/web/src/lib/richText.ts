import { isJumbo, parseRich } from '@chatlol/shared';

/** True when a message is only 1–3 custom emoji: chats show it big, without a bubble. */
export const emojiOnly = (text: string | null | undefined) => !!text && isJumbo(parseRich(text));
