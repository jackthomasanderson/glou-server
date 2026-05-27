export interface RegionCoord {
  lat: number;
  lng: number;
}

// Maps common wine/spirit/cigar region names (FR + EN variants) to geographic coordinates.
// Keys are lowercase and accent-stripped for fuzzy matching.
const COORDS: Record<string, RegionCoord> = {
  // ── France ──────────────────────────────────────────────────────────────────
  'france': { lat: 46.2, lng: 2.2 },
  'bordeaux': { lat: 44.84, lng: -0.58 },
  'bourgogne': { lat: 47.05, lng: 4.85 },
  'burgundy': { lat: 47.05, lng: 4.85 },
  'champagne': { lat: 49.06, lng: 4.0 },
  'alsace': { lat: 48.32, lng: 7.44 },
  'loire': { lat: 47.7, lng: 0.0 },
  'vallee de la loire': { lat: 47.7, lng: 0.0 },
  'rhone': { lat: 45.0, lng: 4.83 },
  'vallee du rhone': { lat: 44.5, lng: 4.8 },
  'provence': { lat: 43.53, lng: 5.45 },
  'languedoc': { lat: 43.6, lng: 3.8 },
  'languedoc-roussillon': { lat: 43.4, lng: 3.5 },
  'roussillon': { lat: 42.7, lng: 2.9 },
  'sud-ouest': { lat: 43.8, lng: 1.2 },
  'cognac': { lat: 45.7, lng: -0.33 },
  'armagnac': { lat: 43.7, lng: 0.07 },
  'calvados': { lat: 49.1, lng: -0.35 },
  'jura': { lat: 46.5, lng: 5.55 },
  'savoie': { lat: 45.6, lng: 6.35 },
  'beaujolais': { lat: 46.12, lng: 4.65 },
  'chablis': { lat: 47.82, lng: 3.8 },
  'cotes du rhone': { lat: 44.6, lng: 4.75 },
  'pomerol': { lat: 44.92, lng: -0.17 },
  'saint-emilion': { lat: 44.9, lng: -0.15 },
  'medoc': { lat: 45.12, lng: -0.83 },
  'sauternes': { lat: 44.57, lng: -0.34 },
  'cahors': { lat: 44.45, lng: 1.44 },
  'bandol': { lat: 43.14, lng: 5.75 },
  'chateauneuf-du-pape': { lat: 44.06, lng: 4.83 },
  'crozes-hermitage': { lat: 45.05, lng: 4.86 },
  'hermitage': { lat: 45.08, lng: 4.84 },
  'cornas': { lat: 44.93, lng: 4.81 },

  // ── Italie / Italy ──────────────────────────────────────────────────────────
  'italie': { lat: 41.87, lng: 12.57 },
  'italy': { lat: 41.87, lng: 12.57 },
  'toscane': { lat: 43.77, lng: 11.25 },
  'tuscany': { lat: 43.77, lng: 11.25 },
  'toscana': { lat: 43.77, lng: 11.25 },
  'piemont': { lat: 45.07, lng: 7.68 },
  'piémont': { lat: 45.07, lng: 7.68 },
  'piedmont': { lat: 45.07, lng: 7.68 },
  'piemonte': { lat: 45.07, lng: 7.68 },
  'veneto': { lat: 45.44, lng: 11.3 },
  'venetie': { lat: 45.44, lng: 11.3 },
  'vénétie': { lat: 45.44, lng: 11.3 },
  'pouilles': { lat: 40.9, lng: 16.55 },
  'puglia': { lat: 40.9, lng: 16.55 },
  'sicile': { lat: 37.6, lng: 14.0 },
  'sicily': { lat: 37.6, lng: 14.0 },
  'sicilia': { lat: 37.6, lng: 14.0 },
  'lombardie': { lat: 45.47, lng: 9.19 },
  'lombardy': { lat: 45.47, lng: 9.19 },
  'barolo': { lat: 44.6, lng: 7.93 },
  'barbaresco': { lat: 44.7, lng: 8.06 },
  'chianti': { lat: 43.5, lng: 11.3 },
  'brunello': { lat: 43.06, lng: 11.49 },
  'amarone': { lat: 45.5, lng: 10.95 },
  'soave': { lat: 45.42, lng: 11.25 },
  'prosecco': { lat: 45.88, lng: 12.05 },
  'montalcino': { lat: 43.06, lng: 11.49 },
  'montepulciano': { lat: 43.1, lng: 11.78 },

  // ── Espagne / Spain ──────────────────────────────────────────────────────────
  'espagne': { lat: 40.46, lng: -3.75 },
  'spain': { lat: 40.46, lng: -3.75 },
  'rioja': { lat: 42.29, lng: -2.54 },
  'la rioja': { lat: 42.29, lng: -2.54 },
  'ribera del duero': { lat: 41.63, lng: -3.92 },
  'priorat': { lat: 41.2, lng: 0.74 },
  'jerez': { lat: 36.69, lng: -6.14 },
  'sherry': { lat: 36.69, lng: -6.14 },
  'penedes': { lat: 41.35, lng: 1.55 },
  'galice': { lat: 42.6, lng: -8.0 },
  'galicia': { lat: 42.6, lng: -8.0 },
  'rias baixas': { lat: 42.4, lng: -8.67 },

  // ── Portugal ─────────────────────────────────────────────────────────────────
  'portugal': { lat: 39.4, lng: -8.22 },
  'porto': { lat: 41.16, lng: -8.63 },
  'douro': { lat: 41.1, lng: -7.65 },
  'alentejo': { lat: 38.27, lng: -7.86 },
  'vinho verde': { lat: 41.55, lng: -8.43 },
  'madere': { lat: 32.76, lng: -16.96 },
  'madeira': { lat: 32.76, lng: -16.96 },

  // ── Écosse / Scotland ────────────────────────────────────────────────────────
  'ecosse': { lat: 56.49, lng: -4.2 },
  'écosse': { lat: 56.49, lng: -4.2 },
  'scotland': { lat: 56.49, lng: -4.2 },
  'speyside': { lat: 57.47, lng: -3.05 },
  'highland': { lat: 57.33, lng: -4.45 },
  'highlands': { lat: 57.33, lng: -4.45 },
  'islay': { lat: 55.77, lng: -6.23 },
  'lowland': { lat: 56.0, lng: -3.44 },
  'lowlands': { lat: 56.0, lng: -3.44 },
  'campbeltown': { lat: 55.43, lng: -5.6 },
  'islands': { lat: 57.6, lng: -5.8 },
  'orkney': { lat: 59.0, lng: -3.05 },
  'skye': { lat: 57.27, lng: -6.22 },
  'arran': { lat: 55.57, lng: -5.25 },

  // ── Irlande / Ireland ─────────────────────────────────────────────────────────
  'irlande': { lat: 53.18, lng: -8.18 },
  'ireland': { lat: 53.18, lng: -8.18 },

  // ── États-Unis / USA ──────────────────────────────────────────────────────────
  'etats-unis': { lat: 37.09, lng: -95.71 },
  'états-unis': { lat: 37.09, lng: -95.71 },
  'usa': { lat: 37.09, lng: -95.71 },
  'united states': { lat: 37.09, lng: -95.71 },
  'kentucky': { lat: 37.84, lng: -84.27 },
  'bourbon': { lat: 37.84, lng: -84.27 },
  'napa valley': { lat: 38.3, lng: -122.26 },
  'napa': { lat: 38.3, lng: -122.26 },
  'sonoma': { lat: 38.3, lng: -122.72 },
  'california': { lat: 36.78, lng: -119.42 },
  'californie': { lat: 36.78, lng: -119.42 },
  'oregon': { lat: 44.0, lng: -120.5 },
  'washington': { lat: 47.5, lng: -120.5 },
  'tennessee': { lat: 35.5, lng: -86.58 },

  // ── Mexique / Mexico ──────────────────────────────────────────────────────────
  'mexique': { lat: 23.63, lng: -102.55 },
  'mexico': { lat: 23.63, lng: -102.55 },
  'jalisco': { lat: 20.66, lng: -103.35 },
  'tequila': { lat: 20.88, lng: -103.84 },
  'oaxaca': { lat: 17.07, lng: -96.72 },

  // ── Antilles / Caribbean ──────────────────────────────────────────────────────
  'martinique': { lat: 14.64, lng: -61.02 },
  'guadeloupe': { lat: 16.27, lng: -61.55 },
  'cuba': { lat: 22.0, lng: -80.0 },
  'jamaique': { lat: 18.1, lng: -77.29 },
  'jamaica': { lat: 18.1, lng: -77.29 },
  'barbade': { lat: 13.19, lng: -59.54 },
  'barbados': { lat: 13.19, lng: -59.54 },
  'haiti': { lat: 18.97, lng: -72.29 },
  'trinidad': { lat: 10.69, lng: -61.22 },
  'reunion': { lat: -21.12, lng: 55.54 },
  'la reunion': { lat: -21.12, lng: 55.54 },

  // ── Amérique du Sud / South America ─────────────────────────────────────────
  'argentine': { lat: -38.42, lng: -63.62 },
  'argentina': { lat: -38.42, lng: -63.62 },
  'mendoza': { lat: -32.89, lng: -68.84 },
  'chili': { lat: -35.68, lng: -71.54 },
  'chile': { lat: -35.68, lng: -71.54 },
  'bresil': { lat: -14.24, lng: -51.93 },
  'brazil': { lat: -14.24, lng: -51.93 },
  'colombie': { lat: 4.57, lng: -74.3 },
  'colombia': { lat: 4.57, lng: -74.3 },

  // ── Afrique du Sud / South Africa ────────────────────────────────────────────
  'afrique du sud': { lat: -30.56, lng: 22.94 },
  'south africa': { lat: -30.56, lng: 22.94 },
  'stellenbosch': { lat: -33.93, lng: 18.86 },
  'franschhoek': { lat: -33.91, lng: 19.13 },
  'constantia': { lat: -34.04, lng: 18.44 },

  // ── Australie / Nouvelle-Zélande ──────────────────────────────────────────────
  'australie': { lat: -25.27, lng: 133.78 },
  'australia': { lat: -25.27, lng: 133.78 },
  'barossa': { lat: -34.52, lng: 138.97 },
  'barossa valley': { lat: -34.52, lng: 138.97 },
  'mclaren vale': { lat: -35.22, lng: 138.55 },
  'hunter valley': { lat: -32.76, lng: 151.15 },
  'margaret river': { lat: -33.95, lng: 115.08 },
  'yarra valley': { lat: -37.75, lng: 145.55 },
  'nouvelle-zelande': { lat: -40.9, lng: 174.89 },
  'new zealand': { lat: -40.9, lng: 174.89 },
  'marlborough': { lat: -41.51, lng: 173.96 },
  'hawkes bay': { lat: -39.64, lng: 176.87 },

  // ── Japon / Japan ─────────────────────────────────────────────────────────────
  'japon': { lat: 36.2, lng: 138.25 },
  'japan': { lat: 36.2, lng: 138.25 },
  'yamazaki': { lat: 34.87, lng: 135.65 },
  'hakushu': { lat: 35.78, lng: 138.38 },
  'yoichi': { lat: 43.2, lng: 140.75 },
  'miyagikyo': { lat: 38.25, lng: 140.94 },

  // ── Allemagne / Germany ────────────────────────────────────────────────────────
  'allemagne': { lat: 51.17, lng: 10.45 },
  'germany': { lat: 51.17, lng: 10.45 },
  'rhin': { lat: 50.0, lng: 8.27 },
  'moselle': { lat: 49.79, lng: 6.67 },
  'mosel': { lat: 49.79, lng: 6.67 },
  'rheingau': { lat: 50.0, lng: 8.0 },
  'franconie': { lat: 49.8, lng: 9.94 },

  // ── Autriche / Austria ────────────────────────────────────────────────────────
  'autriche': { lat: 47.52, lng: 14.55 },
  'austria': { lat: 47.52, lng: 14.55 },
  'wachau': { lat: 48.37, lng: 15.42 },

  // ── Grèce / Greece ────────────────────────────────────────────────────────────
  'grece': { lat: 39.07, lng: 21.82 },
  'grèce': { lat: 39.07, lng: 21.82 },
  'greece': { lat: 39.07, lng: 21.82 },
  'santorini': { lat: 36.4, lng: 25.43 },

  // ── Liban / Lebanon ───────────────────────────────────────────────────────────
  'liban': { lat: 33.85, lng: 35.86 },
  'lebanon': { lat: 33.85, lng: 35.86 },
  'bekaa': { lat: 33.85, lng: 36.0 },

  // ── Russie / Russia ───────────────────────────────────────────────────────────
  'russie': { lat: 61.52, lng: 105.32 },
  'russia': { lat: 61.52, lng: 105.32 },

  // ── Canada ────────────────────────────────────────────────────────────────────
  'canada': { lat: 56.13, lng: -106.35 },
  'colombie-britannique': { lat: 53.73, lng: -127.65 },
  'british columbia': { lat: 53.73, lng: -127.65 },
  'ontario': { lat: 51.25, lng: -85.32 },
  'niagara': { lat: 43.06, lng: -79.07 },

  // ── Inde / India ──────────────────────────────────────────────────────────────
  'inde': { lat: 20.59, lng: 78.96 },
  'india': { lat: 20.59, lng: 78.96 },
  'nashik': { lat: 20.0, lng: 73.79 },

  // ── Chine / China ─────────────────────────────────────────────────────────────
  'chine': { lat: 35.86, lng: 104.2 },
  'china': { lat: 35.86, lng: 104.2 },

  // ── Royaume-Uni / UK ──────────────────────────────────────────────────────────
  'royaume-uni': { lat: 55.38, lng: -3.44 },
  'united kingdom': { lat: 55.38, lng: -3.44 },
  'uk': { lat: 55.38, lng: -3.44 },
  'angleterre': { lat: 52.35, lng: -1.17 },
  'england': { lat: 52.35, lng: -1.17 },
  'pays de galles': { lat: 52.13, lng: -3.78 },
  'wales': { lat: 52.13, lng: -3.78 },

  // ── Suisse / Switzerland ──────────────────────────────────────────────────────
  'suisse': { lat: 46.82, lng: 8.23 },
  'switzerland': { lat: 46.82, lng: 8.23 },
};

function normalize(str: string): string {
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim();
}

export function getRegionCoordinates(region: string): RegionCoord | null {
  const key = normalize(region);
  return COORDS[key] ?? null;
}
