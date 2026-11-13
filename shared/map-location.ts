// #961: where a wine sits on the Analytics world map, shared by api/ (grouping,
// counts of what cannot be placed) and web/ (markers, the "not on the map"
// filter, the Region field's suggestions). Data and pure functions only.

export interface RegionCoord {
  lat: number;
  lng: number;
}

interface PlacedRegion extends RegionCoord {
  /**
   * ISO 3166-1 alpha-2 code of the place's country (FEAT-114: a group of
   * markers names each region's country). Overseas regions keep their own
   * code ("MQ", "RE"), as the browser names them.
   */
  country: string;
}

/**
 * The names the map can place (FR + EN variants), written as they are shown.
 * They are matched through {@link normalizeRegionName}: case, accents,
 * hyphens, apostrophes and extra spaces do not matter ("vallee du rhone",
 * "Nouvelle Aquitaine"). A French administrative region sits at its
 * geographic centre.
 */
const COORDS: Record<string, PlacedRegion> = {
  // ── France ──────────────────────────────────────────────────────────────────
  'France': { lat: 46.2, lng: 2.2, country: 'FR' },
  'Bordeaux': { lat: 44.84, lng: -0.58, country: 'FR' },
  'Bourgogne': { lat: 47.05, lng: 4.85, country: 'FR' },
  'Burgundy': { lat: 47.05, lng: 4.85, country: 'FR' },
  'Champagne': { lat: 49.06, lng: 4.0, country: 'FR' },
  'Alsace': { lat: 48.32, lng: 7.44, country: 'FR' },
  'Loire': { lat: 47.7, lng: 0.0, country: 'FR' },
  'Vallée de la Loire': { lat: 47.7, lng: 0.0, country: 'FR' },
  'Rhône': { lat: 45.0, lng: 4.83, country: 'FR' },
  'Vallée du Rhône': { lat: 44.5, lng: 4.8, country: 'FR' },
  'Provence': { lat: 43.53, lng: 5.45, country: 'FR' },
  'Languedoc': { lat: 43.6, lng: 3.8, country: 'FR' },
  'Languedoc-Roussillon': { lat: 43.4, lng: 3.5, country: 'FR' },
  'Roussillon': { lat: 42.7, lng: 2.9, country: 'FR' },
  'Sud-Ouest': { lat: 43.8, lng: 1.2, country: 'FR' },
  'Cognac': { lat: 45.7, lng: -0.33, country: 'FR' },
  'Armagnac': { lat: 43.7, lng: 0.07, country: 'FR' },
  'Calvados': { lat: 49.1, lng: -0.35, country: 'FR' },
  'Jura': { lat: 46.5, lng: 5.55, country: 'FR' },
  'Savoie': { lat: 45.6, lng: 6.35, country: 'FR' },
  'Beaujolais': { lat: 46.12, lng: 4.65, country: 'FR' },
  'Chablis': { lat: 47.82, lng: 3.8, country: 'FR' },
  'Côtes du Rhône': { lat: 44.6, lng: 4.75, country: 'FR' },
  'Pomerol': { lat: 44.92, lng: -0.17, country: 'FR' },
  'Saint-Émilion': { lat: 44.9, lng: -0.15, country: 'FR' },
  'Médoc': { lat: 45.12, lng: -0.83, country: 'FR' },
  'Sauternes': { lat: 44.57, lng: -0.34, country: 'FR' },
  'Cahors': { lat: 44.45, lng: 1.44, country: 'FR' },
  'Bandol': { lat: 43.14, lng: 5.75, country: 'FR' },
  'Châteauneuf-du-Pape': { lat: 44.06, lng: 4.83, country: 'FR' },
  'Crozes-Hermitage': { lat: 45.05, lng: 4.86, country: 'FR' },
  'Hermitage': { lat: 45.08, lng: 4.84, country: 'FR' },
  'Cornas': { lat: 44.93, lng: 4.81, country: 'FR' },
  // Main French appellations, for the bottles whose region is empty (#961).
  'Margaux': { lat: 45.04, lng: -0.67, country: 'FR' },
  'Pauillac': { lat: 45.2, lng: -0.75, country: 'FR' },
  'Saint-Julien': { lat: 45.16, lng: -0.74, country: 'FR' },
  'Saint-Estèphe': { lat: 45.26, lng: -0.77, country: 'FR' },
  'Graves': { lat: 44.65, lng: -0.45, country: 'FR' },
  'Pessac-Léognan': { lat: 44.75, lng: -0.62, country: 'FR' },
  'Entre-deux-Mers': { lat: 44.75, lng: -0.3, country: 'FR' },
  'Bergerac': { lat: 44.85, lng: 0.48, country: 'FR' },
  'Monbazillac': { lat: 44.8, lng: 0.49, country: 'FR' },
  'Madiran': { lat: 43.55, lng: -0.06, country: 'FR' },
  'Jurançon': { lat: 43.29, lng: -0.39, country: 'FR' },
  'Gaillac': { lat: 43.9, lng: 1.9, country: 'FR' },
  'Gevrey-Chambertin': { lat: 47.23, lng: 4.97, country: 'FR' },
  'Chambolle-Musigny': { lat: 47.18, lng: 4.95, country: 'FR' },
  'Vosne-Romanée': { lat: 47.16, lng: 4.95, country: 'FR' },
  'Nuits-Saint-Georges': { lat: 47.14, lng: 4.95, country: 'FR' },
  'Pommard': { lat: 47.01, lng: 4.8, country: 'FR' },
  'Meursault': { lat: 46.98, lng: 4.77, country: 'FR' },
  'Puligny-Montrachet': { lat: 46.95, lng: 4.75, country: 'FR' },
  'Mâcon': { lat: 46.31, lng: 4.83, country: 'FR' },
  'Pouilly-Fuissé': { lat: 46.28, lng: 4.75, country: 'FR' },
  'Morgon': { lat: 46.16, lng: 4.67, country: 'FR' },
  'Fleurie': { lat: 46.19, lng: 4.7, country: 'FR' },
  'Moulin-à-Vent': { lat: 46.2, lng: 4.73, country: 'FR' },
  'Sancerre': { lat: 47.33, lng: 2.84, country: 'FR' },
  'Pouilly-Fumé': { lat: 47.29, lng: 2.95, country: 'FR' },
  'Vouvray': { lat: 47.41, lng: 0.8, country: 'FR' },
  'Chinon': { lat: 47.17, lng: 0.24, country: 'FR' },
  'Saumur': { lat: 47.26, lng: -0.08, country: 'FR' },
  'Anjou': { lat: 47.47, lng: -0.55, country: 'FR' },
  'Muscadet': { lat: 47.15, lng: -1.4, country: 'FR' },
  'Côte-Rôtie': { lat: 45.48, lng: 4.81, country: 'FR' },
  'Condrieu': { lat: 45.46, lng: 4.77, country: 'FR' },
  'Saint-Joseph': { lat: 45.07, lng: 4.83, country: 'FR' },
  'Gigondas': { lat: 44.16, lng: 5.01, country: 'FR' },
  'Vacqueyras': { lat: 44.14, lng: 4.98, country: 'FR' },
  'Tavel': { lat: 44.01, lng: 4.7, country: 'FR' },
  'Côtes de Provence': { lat: 43.4, lng: 6.2, country: 'FR' },
  'Minervois': { lat: 43.33, lng: 2.7, country: 'FR' },
  'Corbières': { lat: 43.05, lng: 2.65, country: 'FR' },
  'Banyuls': { lat: 42.48, lng: 3.13, country: 'FR' },
  // French administrative regions (2016), at their geographic centre (#961).
  'Auvergne-Rhône-Alpes': { lat: 45.45, lng: 4.39, country: 'FR' },
  'Bourgogne-Franche-Comté': { lat: 47.24, lng: 4.81, country: 'FR' },
  'Bretagne': { lat: 48.18, lng: -2.84, country: 'FR' },
  'Brittany': { lat: 48.18, lng: -2.84, country: 'FR' },
  'Centre-Val de Loire': { lat: 47.5, lng: 1.68, country: 'FR' },
  'Corse': { lat: 42.15, lng: 9.1, country: 'FR' },
  'Corsica': { lat: 42.15, lng: 9.1, country: 'FR' },
  'Grand Est': { lat: 48.7, lng: 5.6, country: 'FR' },
  'Hauts-de-France': { lat: 49.97, lng: 2.8, country: 'FR' },
  'Île-de-France': { lat: 48.71, lng: 2.5, country: 'FR' },
  'Normandie': { lat: 49.12, lng: 0.11, country: 'FR' },
  'Normandy': { lat: 49.12, lng: 0.11, country: 'FR' },
  'Nouvelle-Aquitaine': { lat: 45.19, lng: 0.2, country: 'FR' },
  'Occitanie': { lat: 43.7, lng: 2.14, country: 'FR' },
  'Pays de la Loire': { lat: 47.47, lng: -0.82, country: 'FR' },
  "Provence-Alpes-Côte d'Azur": { lat: 43.94, lng: 6.07, country: 'FR' },
  'PACA': { lat: 43.94, lng: 6.07, country: 'FR' },

  // ── Italie / Italy ──────────────────────────────────────────────────────────
  'Italie': { lat: 41.87, lng: 12.57, country: 'IT' },
  'Italy': { lat: 41.87, lng: 12.57, country: 'IT' },
  'Toscane': { lat: 43.77, lng: 11.25, country: 'IT' },
  'Tuscany': { lat: 43.77, lng: 11.25, country: 'IT' },
  'Toscana': { lat: 43.77, lng: 11.25, country: 'IT' },
  'Piémont': { lat: 45.07, lng: 7.68, country: 'IT' },
  'Piedmont': { lat: 45.07, lng: 7.68, country: 'IT' },
  'Piemonte': { lat: 45.07, lng: 7.68, country: 'IT' },
  'Veneto': { lat: 45.44, lng: 11.3, country: 'IT' },
  'Vénétie': { lat: 45.44, lng: 11.3, country: 'IT' },
  'Pouilles': { lat: 40.9, lng: 16.55, country: 'IT' },
  'Puglia': { lat: 40.9, lng: 16.55, country: 'IT' },
  'Sicile': { lat: 37.6, lng: 14.0, country: 'IT' },
  'Sicily': { lat: 37.6, lng: 14.0, country: 'IT' },
  'Sicilia': { lat: 37.6, lng: 14.0, country: 'IT' },
  'Lombardie': { lat: 45.47, lng: 9.19, country: 'IT' },
  'Lombardy': { lat: 45.47, lng: 9.19, country: 'IT' },
  'Barolo': { lat: 44.6, lng: 7.93, country: 'IT' },
  'Barbaresco': { lat: 44.7, lng: 8.06, country: 'IT' },
  'Chianti': { lat: 43.5, lng: 11.3, country: 'IT' },
  'Brunello': { lat: 43.06, lng: 11.49, country: 'IT' },
  'Amarone': { lat: 45.5, lng: 10.95, country: 'IT' },
  'Soave': { lat: 45.42, lng: 11.25, country: 'IT' },
  'Prosecco': { lat: 45.88, lng: 12.05, country: 'IT' },
  'Montalcino': { lat: 43.06, lng: 11.49, country: 'IT' },
  'Montepulciano': { lat: 43.1, lng: 11.78, country: 'IT' },

  // ── Espagne / Spain ──────────────────────────────────────────────────────────
  'Espagne': { lat: 40.46, lng: -3.75, country: 'ES' },
  'Spain': { lat: 40.46, lng: -3.75, country: 'ES' },
  'Rioja': { lat: 42.29, lng: -2.54, country: 'ES' },
  'La Rioja': { lat: 42.29, lng: -2.54, country: 'ES' },
  'Ribera del Duero': { lat: 41.63, lng: -3.92, country: 'ES' },
  'Priorat': { lat: 41.2, lng: 0.74, country: 'ES' },
  'Jerez': { lat: 36.69, lng: -6.14, country: 'ES' },
  'Sherry': { lat: 36.69, lng: -6.14, country: 'ES' },
  'Penedès': { lat: 41.35, lng: 1.55, country: 'ES' },
  'Galice': { lat: 42.6, lng: -8.0, country: 'ES' },
  'Galicia': { lat: 42.6, lng: -8.0, country: 'ES' },
  'Rías Baixas': { lat: 42.4, lng: -8.67, country: 'ES' },

  // ── Portugal ─────────────────────────────────────────────────────────────────
  'Portugal': { lat: 39.4, lng: -8.22, country: 'PT' },
  'Porto': { lat: 41.16, lng: -8.63, country: 'PT' },
  'Douro': { lat: 41.1, lng: -7.65, country: 'PT' },
  'Alentejo': { lat: 38.27, lng: -7.86, country: 'PT' },
  'Vinho Verde': { lat: 41.55, lng: -8.43, country: 'PT' },
  'Madère': { lat: 32.76, lng: -16.96, country: 'PT' },
  'Madeira': { lat: 32.76, lng: -16.96, country: 'PT' },

  // ── Écosse / Scotland ────────────────────────────────────────────────────────
  'Écosse': { lat: 56.49, lng: -4.2, country: 'GB' },
  'Scotland': { lat: 56.49, lng: -4.2, country: 'GB' },
  'Speyside': { lat: 57.47, lng: -3.05, country: 'GB' },
  'Highland': { lat: 57.33, lng: -4.45, country: 'GB' },
  'Highlands': { lat: 57.33, lng: -4.45, country: 'GB' },
  'Islay': { lat: 55.77, lng: -6.23, country: 'GB' },
  'Lowland': { lat: 56.0, lng: -3.44, country: 'GB' },
  'Lowlands': { lat: 56.0, lng: -3.44, country: 'GB' },
  'Campbeltown': { lat: 55.43, lng: -5.6, country: 'GB' },
  'Islands': { lat: 57.6, lng: -5.8, country: 'GB' },
  'Orkney': { lat: 59.0, lng: -3.05, country: 'GB' },
  'Skye': { lat: 57.27, lng: -6.22, country: 'GB' },
  'Arran': { lat: 55.57, lng: -5.25, country: 'GB' },

  // ── Irlande / Ireland ─────────────────────────────────────────────────────────
  'Irlande': { lat: 53.18, lng: -8.18, country: 'IE' },
  'Ireland': { lat: 53.18, lng: -8.18, country: 'IE' },

  // ── États-Unis / USA ──────────────────────────────────────────────────────────
  'États-Unis': { lat: 37.09, lng: -95.71, country: 'US' },
  'USA': { lat: 37.09, lng: -95.71, country: 'US' },
  'United States': { lat: 37.09, lng: -95.71, country: 'US' },
  'Kentucky': { lat: 37.84, lng: -84.27, country: 'US' },
  'Bourbon': { lat: 37.84, lng: -84.27, country: 'US' },
  'Napa Valley': { lat: 38.3, lng: -122.26, country: 'US' },
  'Napa': { lat: 38.3, lng: -122.26, country: 'US' },
  'Sonoma': { lat: 38.3, lng: -122.72, country: 'US' },
  'California': { lat: 36.78, lng: -119.42, country: 'US' },
  'Californie': { lat: 36.78, lng: -119.42, country: 'US' },
  'Oregon': { lat: 44.0, lng: -120.5, country: 'US' },
  'Washington': { lat: 47.5, lng: -120.5, country: 'US' },
  'Tennessee': { lat: 35.5, lng: -86.58, country: 'US' },

  // ── Mexique / Mexico ──────────────────────────────────────────────────────────
  'Mexique': { lat: 23.63, lng: -102.55, country: 'MX' },
  'Mexico': { lat: 23.63, lng: -102.55, country: 'MX' },
  'Jalisco': { lat: 20.66, lng: -103.35, country: 'MX' },
  'Tequila': { lat: 20.88, lng: -103.84, country: 'MX' },
  'Oaxaca': { lat: 17.07, lng: -96.72, country: 'MX' },

  // ── Antilles / Caribbean ──────────────────────────────────────────────────────
  'Martinique': { lat: 14.64, lng: -61.02, country: 'MQ' },
  'Guadeloupe': { lat: 16.27, lng: -61.55, country: 'GP' },
  'Cuba': { lat: 22.0, lng: -80.0, country: 'CU' },
  'Jamaïque': { lat: 18.1, lng: -77.29, country: 'JM' },
  'Jamaica': { lat: 18.1, lng: -77.29, country: 'JM' },
  'Barbade': { lat: 13.19, lng: -59.54, country: 'BB' },
  'Barbados': { lat: 13.19, lng: -59.54, country: 'BB' },
  'Haïti': { lat: 18.97, lng: -72.29, country: 'HT' },
  'Trinidad': { lat: 10.69, lng: -61.22, country: 'TT' },
  'Réunion': { lat: -21.12, lng: 55.54, country: 'RE' },
  'La Réunion': { lat: -21.12, lng: 55.54, country: 'RE' },

  // ── Amérique du Sud / South America ─────────────────────────────────────────
  'Argentine': { lat: -38.42, lng: -63.62, country: 'AR' },
  'Argentina': { lat: -38.42, lng: -63.62, country: 'AR' },
  'Mendoza': { lat: -32.89, lng: -68.84, country: 'AR' },
  'Chili': { lat: -35.68, lng: -71.54, country: 'CL' },
  'Chile': { lat: -35.68, lng: -71.54, country: 'CL' },
  'Brésil': { lat: -14.24, lng: -51.93, country: 'BR' },
  'Brazil': { lat: -14.24, lng: -51.93, country: 'BR' },
  'Colombie': { lat: 4.57, lng: -74.3, country: 'CO' },
  'Colombia': { lat: 4.57, lng: -74.3, country: 'CO' },

  // ── Afrique du Sud / South Africa ────────────────────────────────────────────
  'Afrique du Sud': { lat: -30.56, lng: 22.94, country: 'ZA' },
  'South Africa': { lat: -30.56, lng: 22.94, country: 'ZA' },
  'Stellenbosch': { lat: -33.93, lng: 18.86, country: 'ZA' },
  'Franschhoek': { lat: -33.91, lng: 19.13, country: 'ZA' },
  'Constantia': { lat: -34.04, lng: 18.44, country: 'ZA' },

  // ── Australie / Nouvelle-Zélande ──────────────────────────────────────────────
  'Australie': { lat: -25.27, lng: 133.78, country: 'AU' },
  'Australia': { lat: -25.27, lng: 133.78, country: 'AU' },
  'Barossa': { lat: -34.52, lng: 138.97, country: 'AU' },
  'Barossa Valley': { lat: -34.52, lng: 138.97, country: 'AU' },
  'McLaren Vale': { lat: -35.22, lng: 138.55, country: 'AU' },
  'Hunter Valley': { lat: -32.76, lng: 151.15, country: 'AU' },
  'Margaret River': { lat: -33.95, lng: 115.08, country: 'AU' },
  'Yarra Valley': { lat: -37.75, lng: 145.55, country: 'AU' },
  'Nouvelle-Zélande': { lat: -40.9, lng: 174.89, country: 'NZ' },
  'New Zealand': { lat: -40.9, lng: 174.89, country: 'NZ' },
  'Marlborough': { lat: -41.51, lng: 173.96, country: 'NZ' },
  'Hawkes Bay': { lat: -39.64, lng: 176.87, country: 'NZ' },

  // ── Japon / Japan ─────────────────────────────────────────────────────────────
  'Japon': { lat: 36.2, lng: 138.25, country: 'JP' },
  'Japan': { lat: 36.2, lng: 138.25, country: 'JP' },
  'Yamazaki': { lat: 34.87, lng: 135.65, country: 'JP' },
  'Hakushu': { lat: 35.78, lng: 138.38, country: 'JP' },
  'Yoichi': { lat: 43.2, lng: 140.75, country: 'JP' },
  'Miyagikyo': { lat: 38.25, lng: 140.94, country: 'JP' },

  // ── Allemagne / Germany ────────────────────────────────────────────────────────
  'Allemagne': { lat: 51.17, lng: 10.45, country: 'DE' },
  'Germany': { lat: 51.17, lng: 10.45, country: 'DE' },
  'Rhin': { lat: 50.0, lng: 8.27, country: 'DE' },
  'Moselle': { lat: 49.79, lng: 6.67, country: 'DE' },
  'Mosel': { lat: 49.79, lng: 6.67, country: 'DE' },
  'Rheingau': { lat: 50.0, lng: 8.0, country: 'DE' },
  'Franconie': { lat: 49.8, lng: 9.94, country: 'DE' },

  // ── Autriche / Austria ────────────────────────────────────────────────────────
  'Autriche': { lat: 47.52, lng: 14.55, country: 'AT' },
  'Austria': { lat: 47.52, lng: 14.55, country: 'AT' },
  'Wachau': { lat: 48.37, lng: 15.42, country: 'AT' },

  // ── Grèce / Greece ────────────────────────────────────────────────────────────
  'Grèce': { lat: 39.07, lng: 21.82, country: 'GR' },
  'Greece': { lat: 39.07, lng: 21.82, country: 'GR' },
  'Santorini': { lat: 36.4, lng: 25.43, country: 'GR' },

  // ── Liban / Lebanon ───────────────────────────────────────────────────────────
  'Liban': { lat: 33.85, lng: 35.86, country: 'LB' },
  'Lebanon': { lat: 33.85, lng: 35.86, country: 'LB' },
  'Bekaa': { lat: 33.85, lng: 36.0, country: 'LB' },

  // ── Russie / Russia ───────────────────────────────────────────────────────────
  'Russie': { lat: 61.52, lng: 105.32, country: 'RU' },
  'Russia': { lat: 61.52, lng: 105.32, country: 'RU' },

  // ── Canada ────────────────────────────────────────────────────────────────────
  'Canada': { lat: 56.13, lng: -106.35, country: 'CA' },
  'Colombie-Britannique': { lat: 53.73, lng: -127.65, country: 'CA' },
  'British Columbia': { lat: 53.73, lng: -127.65, country: 'CA' },
  'Ontario': { lat: 51.25, lng: -85.32, country: 'CA' },
  'Niagara': { lat: 43.06, lng: -79.07, country: 'CA' },

  // ── Inde / India ──────────────────────────────────────────────────────────────
  'Inde': { lat: 20.59, lng: 78.96, country: 'IN' },
  'India': { lat: 20.59, lng: 78.96, country: 'IN' },
  'Nashik': { lat: 20.0, lng: 73.79, country: 'IN' },

  // ── Chine / China ─────────────────────────────────────────────────────────────
  'Chine': { lat: 35.86, lng: 104.2, country: 'CN' },
  'China': { lat: 35.86, lng: 104.2, country: 'CN' },

  // ── Royaume-Uni / UK ──────────────────────────────────────────────────────────
  'Royaume-Uni': { lat: 55.38, lng: -3.44, country: 'GB' },
  'United Kingdom': { lat: 55.38, lng: -3.44, country: 'GB' },
  'UK': { lat: 55.38, lng: -3.44, country: 'GB' },
  'Angleterre': { lat: 52.35, lng: -1.17, country: 'GB' },
  'England': { lat: 52.35, lng: -1.17, country: 'GB' },
  'Pays de Galles': { lat: 52.13, lng: -3.78, country: 'GB' },
  'Wales': { lat: 52.13, lng: -3.78, country: 'GB' },

  // ── Suisse / Switzerland ──────────────────────────────────────────────────────
  'Suisse': { lat: 46.82, lng: 8.23, country: 'CH' },
  'Switzerland': { lat: 46.82, lng: 8.23, country: 'CH' },
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

export interface KnownRegion extends PlacedRegion {
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
