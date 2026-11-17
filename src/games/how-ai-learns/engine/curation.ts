/**
 * Hand-checked choices for the photo library. Every source photo was looked
 * at on 2026-11-17; scripts/build-dataset.ts applies these before it ranks
 * photos by quality.
 *
 * The original crawler searched Wikimedia Commons by keyword, so some results
 * are not of the thing at all. A model trained on them learns the wrong
 * thing, and visitors notice straight away.
 */

/** Whole categories left out, with the reason. */
export const DROPPED_CATEGORIES: Readonly<Record<string, string>> = {
  keys: "Mostly houses: the search matched Key West, not door keys.",
  "water-bottles": "Mostly antique flasks from museum catalogues, not bottles people carry today.",
};

/**
 * Photos that do not clearly show the thing: shops and street scenes, people
 * in the foreground, drawings and posters, flat cover scans, parts and
 * close-ups that could be anything.
 */
export const EXCLUDED_PHOTOS: ReadonlySet<string> = new Set([
  // Pens: a tattoo, a factory line, a pen display, ink drawings, a pencil.
  "img_pens_f71ae7c4",
  "img_pens_a63a03cf",
  "img_pens_e66d144a",
  "img_pens_41e4145b",
  "img_pens_8f8f1759",
  "img_pens_52e33171",
  "img_pens_d19db502",
  "img_pens_f1cde9cf",
  "img_pens_971beb66",
  "img_pens_4915d7df",
  // Books: a clothes shop, street scenes, a tapestry, posters and flat cover scans.
  "img_books_acc7379b",
  "img_books_e2cc7092",
  "img_books_86a0eb84",
  "img_books_c8c9acce",
  "img_books_1cb45565",
  "img_books_f4647a44",
  "img_books_729faf74",
  "img_books_b04f347d",
  "img_books_b8deb843",
  "img_books_76619786",
  "img_books_d50288f6",
  "img_books_3ba2fca3",
  "img_books_605dc1db",
  "img_books_7e579d35",
  "img_books_15863139",
  "img_books_d66dcd6c",
  // Computer mice: whole computers, a building, a cat, cables, wooden replicas.
  "img_computer_mice_bcc0e590",
  "img_computer_mice_a41123d2",
  "img_computer_mice_b821305c",
  "img_computer_mice_7b6b111d",
  "img_computer_mice_88d9da3c",
  "img_computer_mice_bfe61d53",
  "img_computer_mice_500f8cf7",
  "img_computer_mice_f4553cd2",
  "img_computer_mice_52ef0d2f",
  "img_computer_mice_b1823a11",
  "img_computer_mice_3262a10a",
  "img_computer_mice_d0f60daf",
  "img_computer_mice_3c32bd0a",
  // Cars: an open boot, a bonnet close-up, a sand crater.
  "img_cars_9bad382b",
  "img_cars_9600e2e9",
  "img_cars_66a06411",
  "img_cars_b9eb8fdc",
  // Mobile phones: shop floors, crowds, parts, a map, sandals on a beach.
  "img_mobile_phones_64d530d1",
  "img_mobile_phones_6d40acee",
  "img_mobile_phones_a0449649",
  "img_mobile_phones_4f4ffb12",
  "img_mobile_phones_ea8d070c",
  "img_mobile_phones_320b5ca1",
  "img_mobile_phones_a8fc2cbb",
  "img_mobile_phones_ba931159",
  "img_mobile_phones_401151a3",
  "img_mobile_phones_63638158",
  "img_mobile_phones_af5f9178",
  "img_mobile_phones_1a20672c",
  "img_mobile_phones_b761b829",
  "img_mobile_phones_51b5f0c6",
  "img_mobile_phones_8a9b4435",
  "img_mobile_phones_bd7f2e22",
  "img_mobile_phones_6b0c1682",
  // Cups: a drawing, a sandwich, cats, a man in a room, a measuring jug.
  "img_cups_8b4e81d1",
  "img_cups_3313ed56",
  "img_cups_d0037c51",
  "img_cups_65b51069",
  "img_cups_d6e722f7",
  "img_cups_9a4fc439",
  "img_cups_b8c043dc",
  "img_cups_65856723",
  // Chairs: halls, libraries, a church, the seaside, a diagram, a painting, a render.
  "img_chairs_934e1337",
  "img_chairs_ffec8594",
  "img_chairs_e6c60133",
  "img_chairs_d0c27994",
  "img_chairs_a9077d85",
  "img_chairs_f7ca63b7",
  "img_chairs_ef8e2fab",
  "img_chairs_7135f1bc",
  "img_chairs_3bdcb32f",
  "img_chairs_91ec8321",
  "img_chairs_c4f165c9",
  "img_chairs_dc80699b",
  "img_chairs_eb0ea4db",
  "img_chairs_251c2300",
  "img_chairs_dcc0e465",
  "img_chairs_b7cfaf7c",
  "img_chairs_f749911e",
  "img_chairs_b027c21c",
  "img_chairs_408b13b8",
  "img_chairs_e817efe6",
  "img_chairs_da4c9e20",
  "img_chairs_1e306d4c",
  // Backpacks: toys, a tent, paintings, an aerial view, an emblem, a lizard.
  "img_backpacks_22fc95a6",
  "img_backpacks_a2df0664",
  "img_backpacks_6ba2c2d5",
  "img_backpacks_77322de6",
  "img_backpacks_cf003feb",
  "img_backpacks_780abc51",
  "img_backpacks_800cfd49",
  "img_backpacks_12fc605b",
  "img_backpacks_1f6aa977",
  "img_backpacks_73fc52a4",
  "img_backpacks_6c29c3b8",
  "img_backpacks_cc8c147d",
  "img_backpacks_31cb12e3",
  "img_backpacks_4cabae16",
]);

/** The photo on each category's card: one clear, well-lit example. */
export const COVER_PHOTOS: Readonly<Record<string, string>> = {
  pens: "img_pens_a939c468",
  books: "img_books_851fa88c",
  "computer-mice": "img_computer_mice_f95628aa",
  cars: "img_cars_b87870e6",
  "mobile-phones": "img_mobile_phones_f89146df",
  cups: "img_cups_e3c37716",
  chairs: "img_chairs_80a2d4e1",
  backpacks: "img_backpacks_1d5efc44",
};
