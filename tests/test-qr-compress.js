const QUALITY = '(?:m(?:aj)?|M(?:aj)?|min|dim|aug|sus[24]?|add|\\d)[a-z0-9]*';
const CHORD_RE = () => new RegExp(
  `(?<![A-Za-z])([A-G][#b]?)(${QUALITY})?(\\/[A-G][#b]?(?:${QUALITY})?)?(?![a-zA-Z0-9#b])`,
  'g'
);

function stripLyricsFromLine(line) {
  const re = CHORD_RE();
  let lastChordEnd = 0;
  let m;
  while ((m = re.exec(line)) !== null) { lastChordEnd = m.index + m[0].length; }
  if (lastChordEnd === 0) return line;
  const after = line.substring(lastChordEnd);
  const keepMatch = after.match(/^[\s|/\\()\-_~]*(\[.+\])?\s*/);
  return line.substring(0, lastChordEnd) + (keepMatch ? keepMatch[0].trimEnd() : '');
}

function compressForQr(content) {
  if (!content) return '';
  const sectionRe = /^\s*\[.+\]\s*$/;
  const headerRe = /^(INTRO|VERSE|CHORUS|BRIDGE|OUTRO|INSTRUMENTAL|PRE-CHORUS|INTERLUDE|TAG|ENDING|KEY:)/i;
  const lines = content.split('\n');
  const kept = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) { kept.push(''); continue; }
    if (sectionRe.test(trimmed) || headerRe.test(trimmed)) { kept.push(trimmed); continue; }
    const chordRe = CHORD_RE();
    if (chordRe.test(trimmed)) {
      kept.push(stripLyricsFromLine(trimmed));
      continue;
    }
    if (/^[-|/\\=_~]+$/.test(trimmed)) { kept.push(trimmed); continue; }
  }
  return kept.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

// Sample song content from the screenshot
const sample = `KEY: D @ 70 [+1 -> D#]
INTRO
D|A/C#|Bm(A)-G|

VERSE
D|A/C#|Bm-A-G| dili matukib...
D|A|G|A| wala nay lung sula kanimo
G|A|G|A| ikaw ang naghatag sa...
G|A|G|A|| ikaw ang nagpasaylo sa...

CHORUS
D|A|Bm-A-G|(D/F#)
Em-A-
[D|A|Bm(A)-G| to verse]

INSTRUMENTAL
G|A|G|A|
Bm|A| [bagsakan]
[chorus solemn]

CHORUS
D|A|Bm-A-G|(D/F#)`;

const sample2 = `KEY: C @ 68 [+1 -> Db]
INTRO
C|G|Am-G-F||

VERSE
C|G|Dm|C| sa akong kahuYang..
F|C-Am-Dm|G| bisan ug mapakYas...

C|G|Am|Em| sa kangitngit nga akong...
F|C-Am-Dm-G-C| sa matag lakang..

PRE-CHORUS
Am|Em|F-Dm-G|| sa tanang panahon.

CHORUS
C|G|Am|Em| walay higayon nga...
F|C-Am-Dm|G| ikaw kanunay nagkupot...
C|G|Am|Em| walay higayon nga...
F|C-Am-Dm-G-C| magadayeg ako...
G|Am|F-G-  [to instrumental]

INTRUMENTAL
C|G|Am|F|`;

console.log('=== SAMPLE 1 (COMPRESSED) ===');
console.log(compressForQr(sample));
console.log();
console.log('=== SAMPLE 2 (COMPRESSED) ===');
console.log(compressForQr(sample2));
console.log();
console.log('=== SIZE COMPARISON (Sample 2) ===');
console.log('Original:', sample2.length, 'bytes');
console.log('Compressed:', compressForQr(sample2).length, 'bytes');
console.log('Reduction:', Math.round((1 - compressForQr(sample2).length / sample2.length) * 100) + '%');
