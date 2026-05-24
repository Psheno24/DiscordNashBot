import { getCarDef } from "./economyCatalog.js";
import type { EconomyUser } from "./userStore.js";

/** Допустимые буквы на российском госномере (кириллица, визуально как латиница). */
export const VEHICLE_PLATE_LETTERS = ["А", "В", "Е", "К", "М", "Н", "О", "Р", "С", "Т", "У", "Х"] as const;

/** Коды регионов (только цифры; названия субъектов не показываем). */
export const VEHICLE_PLATE_REGION_CODES: readonly string[] = [
  "01",
  "101",
  "02",
  "102",
  "702",
  "03",
  "103",
  "04",
  "104",
  "05",
  "105",
  "06",
  "106",
  "07",
  "107",
  "08",
  "108",
  "09",
  "109",
  "10",
  "110",
  "11",
  "111",
  "12",
  "112",
  "13",
  "113",
  "14",
  "114",
  "15",
  "115",
  "16",
  "116",
  "716",
  "17",
  "117",
  "18",
  "118",
  "19",
  "119",
  "20",
  "95",
  "195",
  "21",
  "121",
  "22",
  "122",
  "23",
  "93",
  "123",
  "193",
  "24",
  "84",
  "88",
  "124",
  "25",
  "125",
  "725",
  "26",
  "126",
  "27",
  "127",
  "28",
  "128",
  "29",
  "129",
  "30",
  "130",
  "31",
  "131",
  "32",
  "132",
  "33",
  "133",
  "34",
  "134",
  "35",
  "135",
  "36",
  "136",
  "37",
  "137",
  "38",
  "138",
  "39",
  "91",
  "139",
  "40",
  "140",
  "41",
  "141",
  "42",
  "142",
  "43",
  "143",
  "44",
  "144",
  "45",
  "145",
  "46",
  "146",
  "47",
  "147",
  "48",
  "148",
  "49",
  "149",
  "50",
  "90",
  "150",
  "190",
  "250",
  "550",
  "750",
  "790",
  "51",
  "151",
  "52",
  "152",
  "252",
  "53",
  "153",
  "54",
  "154",
  "754",
  "55",
  "155",
  "56",
  "156",
  "57",
  "157",
  "58",
  "158",
  "59",
  "159",
  "60",
  "61",
  "161",
  "761",
  "62",
  "162",
  "63",
  "163",
  "763",
  "64",
  "164",
  "65",
  "165",
  "66",
  "96",
  "166",
  "196",
  "67",
  "167",
  "68",
  "168",
  "69",
  "169",
  "70",
  "170",
  "71",
  "171",
  "72",
  "172",
  "73",
  "173",
  "74",
  "174",
  "774",
  "75",
  "175",
  "76",
  "176",
  "77",
  "97",
  "99",
  "177",
  "197",
  "199",
  "277",
  "299",
  "777",
  "797",
  "799",
  "977",
  "78",
  "98",
  "178",
  "198",
  "778",
  "79",
  "179",
  "80",
  "180",
  "81",
  "181",
  "82",
  "182",
  "83",
  "183",
  "84",
  "184",
  "85",
  "185",
  "86",
  "186",
  "87",
  "187",
  "89",
  "189",
  "92",
  "192",
  "94",
  "194",
  "222",
  "278",
  "330",
  "333",
  "444",
  "497",
  "616",
  "660",
  "661",
  "663",
  "664",
  "665",
  "667",
  "668",
  "669",
  "878",
  "995",
  "999",
];

const REGION_SET = new Set(VEHICLE_PLATE_REGION_CODES);
const LETTER_SET = new Set<string>(VEHICLE_PLATE_LETTERS);

export const SHOP_PLATE_REGISTER_BASE_RUB = 10_000;
export const SHOP_PLATE_CHANGE_DIGITS_BASE_RUB = 2_000;
export const SHOP_PLATE_CHANGE_LETTERS_BASE_RUB = 3_000;
export const SHOP_PLATE_CHANGE_REGION_BASE_RUB = 5_000;

/** Штраф к положительному заработку: −10%. */
export const UNREGISTERED_VEHICLE_EARNINGS_MULT = 0.9;

export interface VehiclePlateParts {
  l1: string;
  digits: string;
  l2: string;
  region: string;
}

export function pickRandom<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!;
}

function pickRandomPlateLetter(): string {
  return pickRandom(VEHICLE_PLATE_LETTERS);
}

/** **001–999** (на знаке не бывает **000**). */
function pickRandomPlateDigits(): string {
  return String(1 + Math.floor(Math.random() * 999)).padStart(3, "0");
}

export function pickRandomPlateRegion(): string {
  return pickRandom(VEHICLE_PLATE_REGION_CODES);
}

/** Случайные 3 цифры (**001–999**, повторы допустимы). */
export function rollRandomVehiclePlateDigits(): string {
  return pickRandomPlateDigits();
}

/** Случайные буквы серии (повторы допустимы). */
export function rollRandomVehiclePlateLetters(): Pick<VehiclePlateParts, "l1" | "l2"> {
  return {
    l1: pickRandomPlateLetter(),
    l2: `${pickRandomPlateLetter()}${pickRandomPlateLetter()}`,
  };
}

export function rollRandomVehiclePlateSerial(): Pick<VehiclePlateParts, "l1" | "digits" | "l2"> {
  return { ...rollRandomVehiclePlateLetters(), digits: rollRandomVehiclePlateDigits() };
}

export function rollRandomVehiclePlateParts(): VehiclePlateParts {
  return { ...rollRandomVehiclePlateSerial(), region: pickRandomPlateRegion() };
}

export function formatVehiclePlate(parts: VehiclePlateParts): string {
  return `${parts.l1} ${parts.digits} ${parts.l2} | ${parts.region} RUS`;
}

export function parseVehiclePlateParts(u: EconomyUser): VehiclePlateParts | undefined {
  const l1 = u.vehiclePlateL1;
  const digits = u.vehiclePlateDigits;
  const l2 = u.vehiclePlateL2;
  const region = u.vehiclePlateRegion;
  if (!l1 || !digits || !l2 || !region) return undefined;
  const parts = { l1, digits, l2, region };
  return isValidVehiclePlateParts(parts) ? parts : undefined;
}

export function isValidVehiclePlateParts(p: VehiclePlateParts): boolean {
  if (!LETTER_SET.has(p.l1)) return false;
  if (!/^\d{3}$/.test(p.digits) || p.digits === "000") return false;
  if (!/^[АВЕКМНОРСТУХ]{2}$/.test(p.l2)) return false;
  if (!REGION_SET.has(p.region)) return false;
  return true;
}

export function vehiclePlatePartsToPatch(parts: VehiclePlateParts): Pick<
  EconomyUser,
  "vehiclePlateL1" | "vehiclePlateDigits" | "vehiclePlateL2" | "vehiclePlateRegion"
> {
  return {
    vehiclePlateL1: parts.l1,
    vehiclePlateDigits: parts.digits,
    vehiclePlateL2: parts.l2,
    vehiclePlateRegion: parts.region,
  };
}

export function clearVehiclePlatePatch(): Pick<
  EconomyUser,
  "vehiclePlateL1" | "vehiclePlateDigits" | "vehiclePlateL2" | "vehiclePlateRegion"
> {
  return {
    vehiclePlateL1: undefined,
    vehiclePlateDigits: undefined,
    vehiclePlateL2: undefined,
    vehiclePlateRegion: undefined,
  };
}

export function formatVehiclePlateFromUser(u: EconomyUser): string | undefined {
  const p = parseVehiclePlateParts(u);
  return p ? formatVehiclePlate(p) : undefined;
}

export function userHasOwnedCar(u: EconomyUser): boolean {
  return Boolean(u.ownedCarId && getCarDef(u.ownedCarId));
}

export function userHasVehiclePlate(u: EconomyUser): boolean {
  return parseVehiclePlateParts(u) !== undefined;
}

export function unregisteredVehiclePenaltyApplies(u: EconomyUser): boolean {
  return userHasOwnedCar(u) && !userHasVehiclePlate(u);
}

/** Уменьшает положительный заработок на 10%, если есть авто без госномера. */
export function applyUnregisteredVehiclePenalty(u: EconomyUser, amount: number): number {
  if (amount <= 0 || !unregisteredVehiclePenaltyApplies(u)) return amount;
  return Math.floor(amount * UNREGISTERED_VEHICLE_EARNINGS_MULT);
}

export const SHOP_CAR_PLATE_HINT_LINES = [
  "После покупки авто **обязательно** оформите **госномер** (кнопка **Гос.номер**).",
  "Без номера — штраф **10%** к заработку на **всех** работах, сменах и прочих начислениях.",
  "При **замене** (апгрейде) авто госномер **сохраняется**; оформление нужно только **один раз**.",
];

export function economyCarDisplayLine(u: EconomyUser, opts?: { markdown?: boolean }): string {
  const car = getCarDef(u.ownedCarId);
  const md = opts?.markdown !== false;
  if (!car) return md ? "Авто: **нет**" : "Авто: нет";
  const plate = formatVehiclePlateFromUser(u);
  const label = md ? `**${car.label}**` : car.label;
  if (!plate) return md ? `Авто: ${label} (госномер **нет**)` : `Авто: ${car.label} (госномер нет)`;
  const plateFmt = md ? `**${plate}**` : plate;
  return md ? `Авто: ${label} · ${plateFmt}` : `Авто: ${car.label} · ${plate}`;
}
