/**
 * Photos in persona DMs. The chat model marks a photo with a last line "[PHOTO: what the camera sees]"; we strip
 * that line, check it, generate the image with NIM (FLUX) and send it as an image message after the text.
 * Personas never send selfies or photos of people's bodies (a generated face would change every time and would
 * pass as a real person), nothing sexual or revealing, and nothing showing children.
 */
const TAG = /^\s*\[(?:photo|pic|picture|image)\s*:\s*([^\]\n]{3,300})\]?\s*$/im;
const ASKED = /\b(send|show|share|post|take|snap|got|have)\b[^.?!\n]{0,40}\b(pics?|pictures?|photos?|images?|selfies?|snaps?|shots?)\b|\b(pics?|photos?|pictures?)\s+(of|from|pls|please|plz)\b|\bpic or it didn'?t happen\b/i;
const BLOCKED =
  /\b(nudes?|naked|nsfw|explicit|sexy|sexual|lingerie|underwear|bra|panties|topless|bikini|boobs?|breasts?|butt|ass|feet|thighs?|cleavage|onlyfans|bed ?pic|body pics?|shirtless|in the shower|bath(ing)?|kiss(ing)?|blood|gore|weapon|gun|knife|drugs?)\b/i;
const MINORS = /\b(child(ren)?|kids?|baby|babies|toddler|teen(ager)?s?|minors?|schoolgirl|schoolboy|little (girl|boy)|daughter|son|niece|nephew|students?)\b/i;
const PEOPLE = /\b(selfie|face|my body|of (me|myself|you|yourself)|mirror pic|outfit pic|full body|portrait of (me|myself|her|him))\b/i;

/** Pulls the photo line out of a reply: { text, photo } (photo is the description, or null). */
export function splitPhoto(raw) {
  const m = raw.match(TAG);
  if (!m) return { text: raw.trim(), photo: null };
  return { text: raw.replace(TAG, '').replace(/\n{2,}/g, '\n').trim(), photo: m[1].trim().replace(/[.\s]+$/, '') };
}

/** Did the person ask for a picture in these texts? */
export const askedForPhoto = (text) => ASKED.test(text ?? '');

/** Is a photo with this description (in reply to this request) fine to generate and send? */
export function photoAllowed(description, request = '') {
  if (!description || description.length < 3) return false;
  if (BLOCKED.test(description) || BLOCKED.test(request)) return false;
  if (MINORS.test(description)) return false;
  if (PEOPLE.test(description)) return false;
  return true;
}

/** The text sent to the image model: what the camera sees, kept clearly safe for work and free of people's faces. */
export const imagePrompt = (description, city) =>
  `${description}${city ? `, in ${city}` : ''}, everyday scene, safe for work, no visible faces`;

/** Prompt rules added to the DM system prompt when photos are on. */
export const PHOTO_RULES = [
  '- Photos: if they ask you to send a pic of something (where you are, what you are eating or doing, your view, your pet, your setup, something you mentioned), you can send one. Write your texts as usual, then put one extra last line exactly like: [PHOTO: short concrete description of what the camera sees]. Only one photo per reply, and only when they asked or it clearly fits.',
  "- Photos you never send: selfies, your face or body, outfit or mirror pics, other people, children, anything sexual, revealing or violent. If they ask for those, say no casually (you're camera-shy / not that kind of chat) and don't add a PHOTO line.",
];
