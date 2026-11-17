/**
 * Battery simulation data. The activities and their drain are the original
 * exhibit's ACTIVITIES (25/18/15/10/5), shown as a rough, labelled simulation
 * of one hour of each. The charging week is invented sample data for the
 * routine demo, and the UI says so.
 */

export interface BatteryActivity {
  id: "gaming" | "video" | "maps" | "scrolling" | "music";
  name: string;
  /** Percentage points of a full battery used by an hour of it. */
  drain: number;
  /** Why it costs that much. */
  reason: string;
}

export const ACTIVITIES: BatteryActivity[] = [
  {
    id: "gaming",
    name: "A 3D game",
    drain: 25,
    reason: "The graphics chip and the processor work flat out, and the screen stays bright.",
  },
  {
    id: "video",
    name: "Filming video",
    drain: 18,
    reason: "The camera, the image processor and a bright screen all run at once.",
  },
  {
    id: "maps",
    name: "Map directions",
    drain: 15,
    reason: "GPS, mobile data for the map and the screen all stay on the whole time.",
  },
  {
    id: "scrolling",
    name: "Scrolling videos",
    drain: 10,
    reason: "Wi-Fi or mobile data keeps streaming, and the phone decodes every video.",
  },
  {
    id: "music",
    name: "Music, screen off",
    drain: 5,
    reason: "With the screen off, playing music needs very little power.",
  },
];

/** One charging session, in minutes after midnight. `end` < `start` means it ran past midnight. */
export interface ChargeSession {
  start: number;
  end: number;
}

export interface ChargeDay {
  day: string;
  sessions: ChargeSession[];
}

const at = (h: number, m = 0) => h * 60 + m;

/** A made-up week of charging, the kind of log a phone keeps. Used only in the routine demo. */
export const CHARGING_WEEK: ChargeDay[] = [
  { day: "Mon", sessions: [{ start: at(22, 50), end: at(6, 25) }] },
  { day: "Tue", sessions: [{ start: at(23, 5), end: at(6, 30) }, { start: at(15, 10), end: at(15, 55) }] },
  { day: "Wed", sessions: [{ start: at(22, 40), end: at(6, 20) }] },
  { day: "Thu", sessions: [{ start: at(23, 15), end: at(6, 35) }] },
  { day: "Fri", sessions: [{ start: at(23, 55), end: at(9, 10) }, { start: at(16, 0), end: at(16, 40) }] },
  { day: "Sat", sessions: [{ start: at(0, 30), end: at(9, 40) }] },
  { day: "Sun", sessions: [{ start: at(22, 30), end: at(6, 15) }] },
];
