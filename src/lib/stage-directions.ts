/** Words that mark a stage direction, e.g. *giggles*, (smiles warmly), [cheerfully]. */
const ACTION =
  /\b(giggl|laugh|chuckl|smil|grin|beam|sigh|yawn|hug|wink|gasp|blush|nod|wave|hop|bounc|wiggl|pout|clap|squeal|sniff|sob|cries|jump|spin|tilt|stretch|twirl|purr|hums|whisper|cheers|pats|boop|pokes|says|said|speaks|thinks|pauses|clears? throat|in a \w+ (voice|tone))\w*/i;
/** "cheerfully", "softly"… count as directions inside [brackets], or next to another word ("says cheerfully"). */
const ADVERB = /\b\w{3,}ly\b/i;
const wordCount = (s: string) => s.trim().split(/\s+/).length;
/** An action ("giggles", "smiles warmly", "says cheerfully"), not emphasis like *really* or *so proud*. */
const isAction = (s: string, maxWords: number) => wordCount(s) <= maxWords && (ACTION.test(s) || (ADVERB.test(s) && wordCount(s) >= 2));

/** Removes stage directions so the voice never reads them out ("says cheerfully", *giggles*, (smiles)). */
export function stripStageDirections(text: string): string {
  return text
    .replace(/\[(?!mood:)([^\]\n]{1,40})\]/gi, (m, inner: string) => (ACTION.test(inner) || ADVERB.test(inner) ? " " : m))
    .replace(/(^|[^*])\*(?!\*)([^*\n]{1,50})\*(?!\*)/g, (m, pre: string, inner: string) => (isAction(inner, 5) ? `${pre} ` : m))
    .replace(/\(([^()\n]{1,40})\)/g, (m, inner: string) => (isAction(inner, 4) && !/\d/.test(inner) ? " " : m))
    .replace(/(^|[.!?]\s+)(?:says?|said|speaking|in a \w+ (?:voice|tone))\b[^:.!?\n]{0,30}[:,]\s*/gi, "$1")
    .replace(/\s+([.,!?])/g, "$1");
}
