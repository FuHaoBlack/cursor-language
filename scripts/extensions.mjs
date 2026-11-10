import { tokensOf } from './commerce.mjs';

function decode(raw) {
  return raw.replace(/\\(?:u\{([0-9a-f]+)\}|u([0-9a-f]{4})|x([0-9a-f]{2})|([\s\S]))/gi, (_, point, unicode, hex, escaped) => {
    if (point || unicode || hex) return String.fromCodePoint(parseInt(point || unicode || hex, 16));
    return ({ n: '\n', r: '\r', t: '\t', b: '\b', f: '\f', v: '\v', '0': '\0', '\n': '', '\r': '' })[escaped] ?? escaped;
  });
}
const serialize = text => JSON.stringify(text).replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
const signature = text => (String(text).match(/\{\d+\}|\$\([\w~-]+\)|\(command:[^)\s]+\)/g) ?? []).sort().join('\0');

// Change only display-message arguments of l10n.t. The translated message is
// still a valid fallback when no language extension is installed. Identifiers,
// tool descriptions, other function calls, comments and ordinary strings stay
// byte-for-byte intact.
export function rewriteExtension(source, dictionary) {
  if (!/\bl10n\s*(?:\.|\?\.)\s*t\s*\(/.test(source)) return { text: source, count: 0 };
  const tokens = tokensOf(source), edits = [];
  for (let i = 0; i < tokens.length - 4; i++) {
    if (tokens[i].kind !== 'identifier' || tokens[i].value !== 'l10n' || !['.', '?.'].includes(tokens[i + 1].value)
        || tokens[i + 2].value !== 't' || tokens[i + 3].value !== '(') continue;
    let message = tokens[i + 4], comment = '';
    if (message.value === '{') {
      let depth = 1, selected;
      for (let j = i + 5; j < tokens.length && depth > 0; j++) {
        const token = tokens[j];
        if (token.value === '{' || token.value === '[') depth++;
        else if (token.value === '}' || token.value === ']') depth--;
        if (depth !== 1 || tokens[j + 1]?.value !== ':') continue;
        if (token.value === 'message' && tokens[j + 2]?.kind === 'string') selected = tokens[j + 2];
        if (token.value === 'comment') {
          if (tokens[j + 2]?.kind === 'string') comment = decode(tokens[j + 2].value);
          else if (tokens[j + 2]?.value === '[') {
            let k = j + 3, parts = [];
            while (tokens[k]?.kind === 'string') {
              parts.push(decode(tokens[k++].value));
              if (tokens[k]?.value === ',') k++; else break;
            }
            if (tokens[k]?.value === ']') comment = parts.join('');
          }
        }
      }
      message = selected;
    }
    if (!message || message.kind !== 'string') continue;
    const english = decode(message.value);
    const chinese = dictionary[comment ? english + '/' + comment : english];
    if (typeof chinese !== 'string' || !chinese || chinese === english || signature(english) !== signature(chinese)) continue;
    edits.push({ start: message.start, end: message.end, replacement: serialize(chinese) });
  }
  let text = source;
  for (const edit of edits.sort((a,b) => b.start - a.start)) text = text.slice(0, edit.start) + edit.replacement + text.slice(edit.end);
  return { text, count: edits.length };
}
