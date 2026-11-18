/**
 * Connection data. `TECH_DETAILS` is the original exhibit's techDetails,
 * rewritten in metric and plain words. The Wi-Fi lists are invented examples
 * for the "where are you?" demo; a web page can't scan real Wi-Fi.
 */

export type RadioId = "wifi" | "bluetooth" | "cellular";

export interface RadioDetails {
  id: RadioId;
  name: string;
  range: string;
  usedFor: string;
  band: string;
}

export const TECH_DETAILS: RadioDetails[] = [
  {
    id: "wifi",
    name: "Wi-Fi",
    range: "About 30 to 50 m indoors",
    usedFor: "Internet at home, at school and in shops",
    band: "2.4 GHz and 5 GHz",
  },
  {
    id: "bluetooth",
    name: "Bluetooth",
    range: "About 10 m",
    usedFor: "Earbuds, watches and speakers",
    band: "2.4 GHz",
  },
  {
    id: "cellular",
    name: "Mobile network",
    range: "Several kilometres from a tower",
    usedFor: "Calls, messages and internet on the move",
    band: "Many bands, mostly below 6 GHz",
  },
];

export type WifiPlaceId = "home" | "school" | "mall";

export interface WifiNetwork {
  name: string;
  /** 1 (weak) to 3 (strong). */
  strength: 1 | 2 | 3;
  locked: boolean;
}

export interface WifiPlace {
  id: WifiPlaceId;
  /** Where the visitor pretends to stand. */
  label: string;
  networks: WifiNetwork[];
  guess: string;
  because: string;
}

export const WIFI_PLACES: WifiPlace[] = [
  {
    id: "home",
    label: "At home",
    networks: [
      { name: "Family-Home-5G", strength: 3, locked: true },
      { name: "Family-Home", strength: 3, locked: true },
      { name: "Neighbour-2.4G", strength: 2, locked: true },
      { name: "Living-Room-Printer", strength: 1, locked: true },
    ],
    guess: "You're at home",
    because: "The same networks show up every night, and the strongest one has Home in its name.",
  },
  {
    id: "school",
    label: "At school",
    networks: [
      { name: "IISJ-Students", strength: 3, locked: true },
      { name: "IISJ-Staff", strength: 3, locked: true },
      { name: "Library-Guest", strength: 2, locked: false },
      { name: "Lab-Printer", strength: 1, locked: true },
    ],
    guess: "You're at school",
    because: "Networks named after a school, seen every weekday morning.",
  },
  {
    id: "mall",
    label: "At the mall",
    networks: [
      { name: "Mall-Free-WiFi", strength: 3, locked: false },
      { name: "Cafe-Guest", strength: 3, locked: false },
      { name: "Cinema-Lobby", strength: 2, locked: true },
      { name: "Shoe-Shop-Staff", strength: 1, locked: true },
    ],
    guess: "You're at a shopping mall",
    because: "Free mall Wi-Fi and lots of shop networks in one place.",
  },
];
