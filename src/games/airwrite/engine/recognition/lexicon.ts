/**
 * Word list used to settle ambiguous letters (O vs D, U vs V, ...).
 * Common English words plus words visitors are likely to write at EDEX.
 * Add more freely: one word per space, any case.
 */
const WORDS = `
a i am an as at be by do go he hi if in is it me my no of oh ok on or so to up us we yo ax ox
ai airwrite edex iisj iisjed jeddah saudi arabia india indian kerala riyadh mecca makkah dubai uae
mirsab dilshaan dilshan school class grade exhibition project science computer robot code coding python java
hello hey hiya bye yes yeah nope okay wow cool nice good great best fun love like happy smile peace hope joy
thanks thank please sorry welcome friend friends family mom mum dad mama papa baby brother sister teacher student
cat dog cow pig hen fox owl bee ant bat rat cub pup kid kit fish bird lion tiger bear wolf frog duck goat horse
zebra monkey panda koala camel mouse snake shark whale eagle parrot rabbit sheep turtle dragon unicorn
sun moon star stars sky sea air fire water earth rain snow wind tree leaf rose lily flower plant grass rock sand
red blue green pink gold black white grey gray brown purple orange yellow silver
one two three four five six seven eight nine ten zero hundred thousand million first last
car bus van jet ship boat train plane bike road home house room door bed box cup pen ink book page map key
apple mango grape lemon melon banana cake pizza bread rice milk tea coffee juice candy egg pie jam
math maths art music game games play player win won lose team ball goal cricket football tennis chess
king queen prince princess hero magic wizard ninja pirate ghost alien space planet rocket mars
time day night week month year today now new old big small tall short fast slow hot cold
the and for are but not you all any can had her was one our out day get has him his how man new now old see
two way who boy did its let put say she too use that with have this will your from they know want been good
much some time very when come here just like long make many over such take than them well were what word
about after again also back because before being below between both call came could down each even every
find give going great help here into kind last left life little look made most move must name need never
next only open other people place point right same seem should show side small something sound still
story such tell their there these thing think those though three through today together under until
very walk want water where which while white whole why work world would write writing year young
yes yesterday tomorrow morning evening goodbye birthday party gift happy hello
ab abc xyz
yay lol omg brb gg ez pro max top hot
air hand finger palm pinch wave draw read text letter letters word words
think dream build create learn future smart brain idea ideas mind
eid ramadan diwali onam christmas holiday
`;

export const LEXICON: string[] = [...new Set(WORDS.split(/\s+/).filter(Boolean).map((w) => w.toUpperCase()))];

const byLength = new Map<number, string[]>();
for (const w of LEXICON) {
  const list = byLength.get(w.length) ?? [];
  list.push(w);
  byLength.set(w.length, list);
}

export function wordsOfLength(n: number): string[] {
  return byLength.get(n) ?? [];
}
