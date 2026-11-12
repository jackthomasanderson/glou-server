// #961: where a wine sits on the Analytics world map, shared by api/ (grouping,
// counts of what cannot be placed) and web/ (markers, the "not on the map"
// filter, the Region field's suggestions). Data and pure functions only.

export interface RegionCoord {
  lat: number;
  lng: number;
}

/**
 * The names the map can place (FR + EN variants), written as they are shown.
 * They are matched through {@link normalizeRegionName}: case, accents,
 * hyphens, apostrophes and extra spaces do not matter ("vallee du rhone",
 * "Nouvelle Aquitaine"). A French administrative region sits at its
 * geographic centre.
 */
const COORDS: Record<string, RegionCoord> = {
  // ── France ──────────────────────────────────────────────────────────────────
  'France': { lat: 46.2, lng: 2.2 },
  'Bordeaux': { lat: 44.84, lng: -0.58 },
  'Bourgogne': { lat: 47.05, lng: 4.85 },
  'Burgundy': { lat: 47.05, lng: 4.85 },
  'Champagne': { lat: 49.06, lng: 4.0 },
  'Alsace': { lat: 48.32, lng: 7.44 },
  'Loire': { lat: 47.7, lng: 0.0 },
  'Vallée de la Loire': { lat: 47.7, lng: 0.0 },
  'Rhône': { lat: 45.0, lng: 4.83 },
  'Vallée du Rhône': { lat: 44.5, lng: 4.8 },
  'Provence': { lat: 43.53, lng: 5.45 },
  'Languedoc': { lat: 43.6, lng: 3.8 },
  'Languedoc-Roussillon': { lat: 43.4, lng: 3.5 },
  'Roussillon': { lat: 42.7, lng: 2.9 },
  'Sud-Ouest': { lat: 43.8, lng: 1.2 },
  'Cognac': { lat: 45.7, lng: -0.33 },
  'Armagnac': { lat: 43.7, lng: 0.07 },
  'Calvados': { lat: 49.1, lng: -0.35 },
  'Jura': { lat: 46.5, lng: 5.55 },
  'Savoie': { lat: 45.6, lng: 6.35 },
  'Beaujolais': { lat: 46.12, lng: 4.65 },
  'Chablis': { lat: 47.82, lng: 3.8 },
  'Côtes du Rhône': { lat: 44.6, lng: 4.75 },
  'Pomerol': { lat: 44.92, lng: -0.17 },
  'Saint-Émilion': { lat: 44.9, lng: -0.15 },
  'Médoc': { lat: 45.12, lng: -0.83 },
  'Sauternes': { lat: 44.57, lng: -0.34 },
  'Cahors': { lat: 44.45, lng: 1.44 },
  'Bandol': { lat: 43.14, lng: 5.75 },
  'Châteauneuf-du-Pape': { lat: 44.06, lng: 4.83 },
  'Crozes-Hermitage': { lat: 45.05, lng: 4.86 },
  'Hermitage': { lat: 45.08, lng: 4.84 },
  'Cornas': { lat: 44.93, lng: 4.81 },
  // Main French appellations, for the bottles whose region is empty (#961).
  'Margaux': { lat: 45.04, lng: -0.67 },
  'Pauillac': { lat: 45.2, lng: -0.75 },
  'Saint-Julien': { lat: 45.16, lng: -0.74 },
  'Saint-Estèphe': { lat: 45.26, lng: -0.77 },
  'Graves': { lat: 44.65, lng: -0.45 },
  'Pessac-Léognan': { lat: 44.75, lng: -0.62 },
  'Entre-deux-Mers': { lat: 44.75, lng: -0.3 },
  'Bergerac': { lat: 44.85, lng: 0.48 },
  'Monbazillac': { lat: 44.8, lng: 0.49 },
  'Madiran': { lat: 43.55, lng: -0.06 },
  'Jurançon': { lat: 43.29, lng: -0.39 },
  'Gaillac': { lat: 43.9, lng: 1.9 },
  'Gevrey-Chambertin': { lat: 47.23, lng: 4.97 },
  'Chambolle-Musigny': { lat: 47.18, lng: 4.95 },
  'Vosne-Romanée': { lat: 47.16, lng: 4.95 },
  'Nuits-Saint-Georges': { lat: 47.14, lng: 4.95 },
  'Pommard': { lat: 47.01, lng: 4.8 },
  'Meursault': { lat: 46.98, lng: 4.77 },
  'Puligny-Montrachet': { lat: 46.95, lng: 4.75 },
  'Mâcon': { lat: 46.31, lng: 4.83 },
  'Pouilly-Fuissé': { lat: 46.28, lng: 4.75 },
  'Morgon': { lat: 46.16, lng: 4.67 },
  'Fleurie': { lat: 46.19, lng: 4.7 },
  'Moulin-à-Vent': { lat: 46.2, lng: 4.73 },
  'Sancerre': { lat: 47.33, lng: 2.84 },
  'Pouilly-Fumé': { lat: 47.29, lng: 2.95 },
  'Vouvray': { lat: 47.41, lng: 0.8 },
  'Chinon': { lat: 47.17, lng: 0.24 },
  'Saumur': { lat: 47.26, lng: -0.08 },
  'Anjou': { lat: 47.47, lng: -0.55 },
  'Muscadet': { lat: 47.15, lng: -1.4 },
  'Côte-Rôtie': { lat: 45.48, lng: 4.81 },
  'Condrieu': { lat: 45.46, lng: 4.77 },
  'Saint-Joseph': { lat: 45.07, lng: 4.83 },
  'Gigondas': { lat: 44.16, lng: 5.01 },
  'Vacqueyras': { lat: 44.14, lng: 4.98 },
  'Tavel': { lat: 44.01, lng: 4.7 },
  'Côtes de Provence': { lat: 43.4, lng: 6.2 },
  'Minervois': { lat: 43.33, lng: 2.7 },
  'Corbières': { lat: 43.05, lng: 2.65 },
  'Banyuls': { lat: 42.48, lng: 3.13 },
  // French administrative regions (2016), at their geographic centre (#961).
  'Auvergne-Rhône-Alpes': { lat: 45.45, lng: 4.39 },
  'Bourgogne-Franche-Comté': { lat: 47.24, lng: 4.81 },
  'Bretagne': { lat: 48.18, lng: -2.84 },
  'Brittany': { lat: 48.18, lng: -2.84 },
  'Centre-Val de Loire': { lat: 47.5, lng: 1.68 },
  'Corse': { lat: 42.15, lng: 9.1 },
  'Corsica': { lat: 42.15, lng: 9.1 },
  'Grand Est': { lat: 48.7, lng: 5.6 },
  'Hauts-de-France': { lat: 49.97, lng: 2.8 },
  'Île-de-France': { lat: 48.71, lng: 2.5 },
  'Normandie': { lat: 49.12, lng: 0.11 },
  'Normandy': { lat: 49.12, lng: 0.11 },
  'Nouvelle-Aquitaine': { lat: 45.19, lng: 0.2 },
  'Occitanie': { lat: 43.7, lng: 2.14 },
  'Pays de la Loire': { lat: 47.47, lng: -0.82 },
  "Provence-Alpes-Côte d'Azur": { lat: 43.94, lng: 6.07 },
  'PACA': { lat: 43.94, lng: 6.07 },

  // ── Italie / Italy ──────────────────────────────────────────────────────────
  'Italie': { lat: 41.87, lng: 12.57 },
  'Italy': { lat: 41.87, lng: 12.57 },
  'Toscane': { lat: 43.77, lng: 11.25 },
  'Tuscany': { lat: 43.77, lng: 11.25 },
  'Toscana': { lat: 43.77, lng: 11.25 },
  'Piémont': { lat: 45.07, lng: 7.68 },
  'Piedmont': { lat: 45.07, lng: 7.68 },
  'Piemonte': { lat: 45.07, lng: 7.68 },
  'Veneto': { lat: 45.44, lng: 11.3 },
  'Vénétie': { lat: 45.44, lng: 11.3 },
  'Pouilles': { lat: 40.9, lng: 16.55 },
  'Puglia': { lat: 40.9, lng: 16.55 },
  'Sicile': { lat: 37.6, lng: 14.0 },
  'Sicily': { lat: 37.6, lng: 14.0 },
  'Sicilia': { lat: 37.6, lng: 14.0 },
  'Lombardie': { lat: 45.47, lng: 9.19 },
  'Lombardy': { lat: 45.47, lng: 9.19 },
  'Barolo': { lat: 44.6, lng: 7.93 },
  'Barbaresco': { lat: 44.7, lng: 8.06 },
  'Chianti': { lat: 43.5, lng: 11.3 },
  'Brunello': { lat: 43.06, lng: 11.49 },
  'Amarone': { lat: 45.5, lng: 10.95 },
  'Soave': { lat: 45.42, lng: 11.25 },
  'Prosecco': { lat: 45.88, lng: 12.05 },
  'Montalcino': { lat: 43.06, lng: 11.49 },
  'Montepulciano': { lat: 43.1, lng: 11.78 },

  // ── Espagne / Spain ──────────────────────────────────────────────────────────
  'Espagne': { lat: 40.46, lng: -3.75 },
  'Spain': { lat: 40.46, lng: -3.75 },
  'Rioja': { lat: 42.29, lng: -2.54 },
  'La Rioja': { lat: 42.29, lng: -2.54 },
  'Ribera del Duero': { lat: 41.63, lng: -3.92 },
  'Priorat': { lat: 41.2, lng: 0.74 },
  'Jerez': { lat: 36.69, lng: -6.14 },
  'Sherry': { lat: 36.69, lng: -6.14 },
  'Penedès': { lat: 41.35, lng: 1.55 },
  'Galice': { lat: 42.6, lng: -8.0 },
  'Galicia': { lat: 42.6, lng: -8.0 },
  'Rías Baixas': { lat: 42.4, lng: -8.67 },

  // ── Portugal ─────────────────────────────────────────────────────────────────
  'Portugal': { lat: 39.4, lng: -8.22 },
  'Porto': { lat: 41.16, lng: -8.63 },
  'Douro': { lat: 41.1, lng: -7.65 },
  'Alentejo': { lat: 38.27, lng: -7.86 },
  'Vinho Verde': { lat: 41.55, lng: -8.43 },
  'Madère': { lat: 32.76, lng: -16.96 },
  'Madeira': { lat: 32.76, lng: -16.96 },

  // ── Écosse / Scotland ────────────────────────────────────────────────────────
  'Écosse': { lat: 56.49, lng: -4.2 },
  'Scotland': { lat: 56.49, lng: -4.2 },
  'Speyside': { lat: 57.47, lng: -3.05 },
  'Highland': { lat: 57.33, lng: -4.45 },
  'Highlands': { lat: 57.33, lng: -4.45 },
  'Islay': { lat: 55.77, lng: -6.23 },
  'Lowland': { lat: 56.0, lng: -3.44 },
  'Lowlands': { lat: 56.0, lng: -3.44 },
  'Campbeltown': { lat: 55.43, lng: -5.6 },
  'Islands': { lat: 57.6, lng: -5.8 },
  'Orkney': { lat: 59.0, lng: -3.05 },
  'Skye': { lat: 57.27, lng: -6.22 },
  'Arran': { lat: 55.57, lng: -5.25 },

  // ── Irlande / Ireland ─────────────────────────────────────────────────────────
  'Irlande': { lat: 53.18, lng: -8.18 },
  'Ireland': { lat: 53.18, lng: -8.18 },

  // ── États-Unis / USA ──────────────────────────────────────────────────────────
  'États-Unis': { lat: 37.09, lng: -95.71 },
  'USA': { lat: 37.09, lng: -95.71 },
  'United States': { lat: 37.09, lng: -95.71 },
  'Kentucky': { lat: 37.84, lng: -84.27 },
  'Bourbon': { lat: 37.84, lng: -84.27 },
  'Napa Valley': { lat: 38.3, lng: -122.26 },
  'Napa': { lat: 38.3, lng: -122.26 },
  'Sonoma': { lat: 38.3, lng: -122.72 },
  'California': { lat: 36.78, lng: -119.42 },
  'Californie': { lat: 36.78, lng: -119.42 },
  'Oregon': { lat: 44.0, lng: -120.5 },
  'Washington': { lat: 47.5, lng: -120.5 },
  'Tennessee': { lat: 35.5, lng: -86.58 },

  // ── Mexique / Mexico ──────────────────────────────────────────────────────────
  'Mexique': { lat: 23.63, lng: -102.55 },
  'Mexico': { lat: 23.63, lng: -102.55 },
  'Jalisco': { lat: 20.66, lng: -103.35 },
  'Tequila': { lat: 20.88, lng: -103.84 },
  'Oaxaca': { lat: 17.07, lng: -96.72 },

  // ── Antilles / Caribbean ──────────────────────────────────────────────────────
  'Martinique': { lat: 14.64, lng: -61.02 },
  'Guadeloupe': { lat: 16.27, lng: -61.55 },
  'Cuba': { lat: 22.0, lng: -80.0 },
  'Jamaïque': { lat: 18.1, lng: -77.29 },
  'Jamaica': { lat: 18.1, lng: -77.29 },
  'Barbade': { lat: 13.19, lng: -59.54 },
  'Barbados': { lat: 13.19, lng: -59.54 },
  'Haïti': { lat: 18.97, lng: -72.29 },
  'Trinidad': { lat: 10.69, lng: -61.22 },
  'Réunion': { lat: -21.12, lng: 55.54 },
  'La Réunion': { lat: -21.12, lng: 55.54 },

  // ── Amérique du Sud / South America ─────────────────────────────────────────
  'Argentine': { lat: -38.42, lng: -63.62 },
  'Argentina': { lat: -38.42, lng: -63.62 },
  'Mendoza': { lat: -32.89, lng: -68.84 },
  'Chili': { lat: -35.68, lng: -71.54 },
  'Chile': { lat: -35.68, lng: -71.54 },
  'Brésil': { lat: -14.24, lng: -51.93 },
  'Brazil': { lat: -14.24, lng: -51.93 },
  'Colombie': { lat: 4.57, lng: -74.3 },
  'Colombia': { lat: 4.57, lng: -74.3 },

  // ── Afrique du Sud / South Africa ────────────────────────────────────────────
  'Afrique du Sud': { lat: -30.56, lng: 22.94 },
  'South Africa': { lat: -30.56, lng: 22.94 },
  'Stellenbosch': { lat: -33.93, lng: 18.86 },
  'Franschhoek': { lat: -33.91, lng: 19.13 },
  'Constantia': { lat: -34.04, lng: 18.44 },

  // ── Australie / Nouvelle-Zélande ──────────────────────────────────────────────
  'Australie': { lat: -25.27, lng: 133.78 },
  'Australia': { lat: -25.27, lng: 133.78 },
  'Barossa': { lat: -34.52, lng: 138.97 },
  'Barossa Valley': { lat: -34.52, lng: 138.97 },
  'McLaren Vale': { lat: -35.22, lng: 138.55 },
  'Hunter Valley': { lat: -32.76, lng: 151.15 },
  'Margaret River': { lat: -33.95, lng: 115.08 },
  'Yarra Valley': { lat: -37.75, lng: 145.55 },
  'Nouvelle-Zélande': { lat: -40.9, lng: 174.89 },
  'New Zealand': { lat: -40.9, lng: 174.89 },
  'Marlborough': { lat: -41.51, lng: 173.96 },
  'Hawkes Bay': { lat: -39.64, lng: 176.87 },

  // ── Japon / Japan ─────────────────────────────────────────────────────────────
  'Japon': { lat: 36.2, lng: 138.25 },
  'Japan': { lat: 36.2, lng: 138.25 },
  'Yamazaki': { lat: 34.87, lng: 135.65 },
  'Hakushu': { lat: 35.78, lng: 138.38 },
  'Yoichi': { lat: 43.2, lng: 140.75 },
  'Miyagikyo': { lat: 38.25, lng: 140.94 },

  // ── Allemagne / Germany ────────────────────────────────────────────────────────
  'Allemagne': { lat: 51.17, lng: 10.45 },
  'Germany': { lat: 51.17, lng: 10.45 },
  'Rhin': { lat: 50.0, lng: 8.27 },
  'Moselle': { lat: 49.79, lng: 6.67 },
  'Mosel': { lat: 49.79, lng: 6.67 },
  'Rheingau': { lat: 50.0, lng: 8.0 },
  'Franconie': { lat: 49.8, lng: 9.94 },

  // ── Autriche / Austria ────────────────────────────────────────────────────────
  'Autriche': { lat: 47.52, lng: 14.55 },
  'Austria': { lat: 47.52, lng: 14.55 },
  'Wachau': { lat: 48.37, lng: 15.42 },

  // ── Grèce / Greece ────────────────────────────────────────────────────────────
  'Grèce': { lat: 39.07, lng: 21.82 },
  'Greece': { lat: 39.07, lng: 21.82 },
  'Santorini': { lat: 36.4, lng: 25.43 },

  // ── Liban / Lebanon ───────────────────────────────────────────────────────────
  'Liban': { lat: 33.85, lng: 35.86 },
  'Lebanon': { lat: 33.85, lng: 35.86 },
  'Bekaa': { lat: 33.85, lng: 36.0 },

  // ── Russie / Russia ───────────────────────────────────────────────────────────
  'Russie': { lat: 61.52, lng: 105.32 },
  'Russia': { lat: 61.52, lng: 105.32 },

  // ── Canada ────────────────────────────────────────────────────────────────────
  'Canada': { lat: 56.13, lng: -106.35 },
  'Colombie-Britannique': { lat: 53.73, lng: -127.65 },
  'British Columbia': { lat: 53.73, lng: -127.65 },
  'Ontario': { lat: 51.25, lng: -85.32 },
  'Niagara': { lat: 43.06, lng: -79.07 },

  // ── Inde / India ──────────────────────────────────────────────────────────────
  'Inde': { lat: 20.59, lng: 78.96 },
  'India': { lat: 20.59, lng: 78.96 },
  'Nashik': { lat: 20.0, lng: 73.79 },

  // ── Chine / China ─────────────────────────────────────────────────────────────
  'Chine': { lat: 35.86, lng: 104.2 },
  'China': { lat: 35.86, lng: 104.2 },

  // ── Royaume-Uni / UK ──────────────────────────────────────────────────────────
  'Royaume-Uni': { lat: 55.38, lng: -3.44 },
  'United Kingdom': { lat: 55.38, lng: -3.44 },
  'UK': { lat: 55.38, lng: -3.44 },
  'Angleterre': { lat: 52.35, lng: -1.17 },
  'England': { lat: 52.35, lng: -1.17 },
  'Pays de Galles': { lat: 52.13, lng: -3.78 },
  'Wales': { lat: 52.13, lng: -3.78 },

  // ── Suisse / Switzerland ──────────────────────────────────────────────────────
  'Suisse': { lat: 46.82, lng: 8.23 },
  'Switzerland': { lat: 46.82, lng: 8.23 },
};

const MARKS_RE = /\p{Mn}/gu;
const SEPARATORS_RE = /[-‐‑–—_'’.]+/g;

/**
 * The form under which two region names are the same place: lower case,
 * without accents, hyphens, apostrophes or repeated spaces. Also the key under
 * which the map groups regions ("bordeaux " and "Bordeaux" are one point).
 */
export function normalizeRegionName(name: string): string {
  return name
    .normalize('NFD')
    .replace(MARKS_RE, '')
    .toLowerCase()
    .replace(SEPARATORS_RE, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export interface KnownRegion extends RegionCoord {
  /** The name as the map shows it ("Vallée du Rhône" for "vallee du rhone"). */
  name: string;
}

const KNOWN = new Map<string, KnownRegion>(
  Object.entries(COORDS).map(([name, coord]) => [normalizeRegionName(name), { name, ...coord }]),
);

/** Every name the map can place, as shown (the Region field's suggestions). */
export const KNOWN_REGION_NAMES: readonly string[] = Object.keys(COORDS);

/** The place the map knows under this name, or null when it cannot place it. */
export function findKnownRegion(name: string): KnownRegion | null {
  return KNOWN.get(normalizeRegionName(name)) ?? null;
}

export interface MapLocatable {
  category: string;
  region: string | null;
  appellation?: string | null;
  leafOrigin?: string | null;
}

const filled = (value: string | null | undefined) => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
};

/**
 * The name a wine is placed under on the map: its region (a cigar's leaf
 * origin first), else — only when the region is empty — its appellation if
 * the map can place it (#961: the region stays the reference). Null: nothing
 * to place it by. The name may still be unknown to the map
 * ({@link isPlacedOnMap}).
 */
export function mapLocationOf(product: MapLocatable): string | null {
  const region = product.category === 'cigar'
    ? filled(product.leafOrigin) ?? filled(product.region)
    : filled(product.region);
  if (region) return region;
  const appellation = filled(product.appellation);
  return appellation && findKnownRegion(appellation) ? appellation : null;
}

/** Whether the map shows a point for this wine (#961: "not located" otherwise). */
export function isPlacedOnMap(product: MapLocatable): boolean {
  const location = mapLocationOf(product);
  return location !== null && findKnownRegion(location) !== null;
}
