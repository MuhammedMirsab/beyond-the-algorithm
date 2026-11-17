/**
 * The simulated day for the GPS demo: a made-up town (coordinates in a
 * 100 x 140 map box, like the original exhibit's MAP_LOCATIONS in %) and one
 * school day of where a phone was. The app's guesses come from the times, not
 * from labels on the map: the map only knows the names of public places.
 */

export type PlaceId = "home" | "school" | "sports";

export interface Point {
  x: number;
  y: number;
}

export interface Place {
  id: PlaceId;
  /** The name a map app already knows. Homes have none. */
  mapName: string | null;
  /** Centre of the place on the map. */
  at: Point;
}

export const MAP_SIZE = { width: 100, height: 140 } as const;

export const PLACES: Record<PlaceId, Place> = {
  home: { id: "home", mapName: null, at: { x: 22, y: 112 } },
  school: { id: "school", mapName: "School", at: { x: 72, y: 26 } },
  sports: { id: "sports", mapName: "Sports ground", at: { x: 76, y: 92 } },
};

export type RouteId = "home-school" | "school-home" | "home-sports" | "sports-home";

/** Roads the phone travels along, as polylines between places. */
export const ROUTES: Record<RouteId, Point[]> = {
  "home-school": [PLACES.home.at, { x: 22, y: 120 }, { x: 50, y: 120 }, { x: 50, y: 40 }, { x: 72, y: 40 }, PLACES.school.at],
  "school-home": [PLACES.school.at, { x: 72, y: 40 }, { x: 50, y: 40 }, { x: 50, y: 120 }, { x: 22, y: 120 }, PLACES.home.at],
  "home-sports": [PLACES.home.at, { x: 22, y: 120 }, { x: 76, y: 120 }, PLACES.sports.at],
  "sports-home": [PLACES.sports.at, { x: 76, y: 120 }, { x: 22, y: 120 }, PLACES.home.at],
};

/** Road lines to draw (map decoration that matches the routes). */
export const ROADS: Point[][] = [
  [{ x: 0, y: 120 }, { x: 100, y: 120 }],
  [{ x: 50, y: 0 }, { x: 50, y: 140 }],
  [{ x: 0, y: 40 }, { x: 100, y: 40 }],
  [{ x: 0, y: 80 }, { x: 50, y: 80 }],
];

export type DaySegment =
  | { kind: "stay"; from: number; to: number; place: PlaceId }
  | { kind: "travel"; from: number; to: number; route: RouteId };

const at = (h: number, m = 0) => h * 60 + m;

/** One weekday, minute by minute. */
export const DAY: DaySegment[] = [
  { kind: "stay", from: at(0), to: at(7), place: "home" },
  { kind: "travel", from: at(7), to: at(7, 30), route: "home-school" },
  { kind: "stay", from: at(7, 30), to: at(13, 30), place: "school" },
  { kind: "travel", from: at(13, 30), to: at(14), route: "school-home" },
  { kind: "stay", from: at(14), to: at(16, 30), place: "home" },
  { kind: "travel", from: at(16, 30), to: at(17), route: "home-sports" },
  { kind: "stay", from: at(17), to: at(19), place: "sports" },
  { kind: "travel", from: at(19), to: at(19, 30), route: "sports-home" },
  { kind: "stay", from: at(19, 30), to: at(24), place: "home" },
];

/** The slider runs from 6 AM to 10 PM in 15-minute steps. */
export const DAY_START = at(6);
export const DAY_END = at(22);
export const DAY_STEP = 15;

export interface PlaceGuess {
  place: PlaceId;
  /** The guess is made once the day has reached this minute. */
  after: number;
  title: string;
  because: string;
}

/** What the app concludes, and when it has seen enough to say it. */
export const PLACE_GUESSES: PlaceGuess[] = [
  {
    place: "home",
    after: DAY_START,
    title: "You live here",
    because: "The phone spent the whole night here.",
  },
  {
    place: "school",
    after: at(9, 30),
    title: "You study here",
    because: "It's a school, and you've been there since 7:30 on a weekday.",
  },
  {
    place: "sports",
    after: at(18),
    title: "You play a sport",
    because: "An hour at a sports ground in the evening, after school.",
  },
];
