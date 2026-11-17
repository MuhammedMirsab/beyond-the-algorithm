/**
 * The built-in object categories, copied from the original app's
 * server/categories.ts (BUILT_IN_CATEGORIES). The crawler fields
 * (targetCount, searchQueries) are gone: the photos are already collected.
 *
 * Only categories with enough licensed photos on disk make it into the game;
 * scripts/build-dataset.ts decides that and writes the public manifest.
 */

export interface BuiltInCategoryDef {
  id: string;
  /** Singular label, sentence case: what the model answers. */
  name: string;
  /** Folder name in the dataset; also the plural in kebab case. */
  slug: string;
  description: string;
}

export const BUILT_IN_CATEGORIES: BuiltInCategoryDef[] = [
  {
    id: "cat_pens",
    name: "Pen",
    slug: "pens",
    description: "Ballpoint, fountain, rollerball, and felt-tip writing pens across varied angles and surfaces.",
  },
  {
    id: "cat_books",
    name: "Book",
    slug: "books",
    description: "Hardcover, paperback, open pages, and stacked volumes in varied lighting.",
  },
  {
    id: "cat_water_bottles",
    name: "Water bottle",
    slug: "water-bottles",
    description: "Reusable steel, glass, sport, and clear plastic water bottles in everyday settings.",
  },
  {
    id: "cat_computer_mice",
    name: "Computer mouse",
    slug: "computer-mice",
    description: "Wired, wireless, optical, and ergonomic computer mice on desks and neutral backgrounds.",
  },
  {
    id: "cat_cars",
    name: "Car",
    slug: "cars",
    description: "Sedans, hatchbacks, compact city cars, and automobiles photographed from multiple angles.",
  },
  {
    id: "cat_mobile_phones",
    name: "Mobile phone",
    slug: "mobile-phones",
    description: "Modern smartphones and handheld mobile phones in portrait, angled, and tabletop views.",
  },
  {
    id: "cat_keys",
    name: "Keys",
    slug: "keys",
    description: "Brass house keys, keychains, padlocks with keys, and automotive key fobs.",
  },
  {
    id: "cat_cups",
    name: "Cup",
    slug: "cups",
    description: "Ceramic mugs, porcelain teacups, glass tumblers, and espresso cups.",
  },
  {
    id: "cat_backpacks",
    name: "Backpack",
    slug: "backpacks",
    description: "Canvas daypacks, hiking rucksacks, laptop backpacks, and school bags.",
  },
  {
    id: "cat_watches",
    name: "Watch",
    slug: "watches",
    description: "Analog wristwatches, chronographs, leather-strap watches, and digital timepieces.",
  },
  {
    id: "cat_pencils",
    name: "Pencil",
    slug: "pencils",
    description: "Wooden graphite pencils, colored pencils, sharpened tips, and mechanical pencils.",
  },
  {
    id: "cat_chairs",
    name: "Chair",
    slug: "chairs",
    description: "Wooden dining chairs, ergonomic office chairs, armchairs, and minimalist seating.",
  },
];

/** "computer-mice" → "computer mice". The slugs are already plural. */
export const pluralFromSlug = (slug: string) => slug.replace(/-/g, " ");
