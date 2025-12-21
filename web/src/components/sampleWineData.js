/**
 * Sample Wine Data for Testing Heatmap Features
 * 
 * Copy these wines to your database to test the heatmap visualizations
 */

export const sampleWineData = [
  // Bordeaux - Heavy red concentration
  { name: "Château Margaux", region: "Bordeaux", type: "Red", vintage: 2015, quantity: 12, producer: "Château Margaux" },
  { name: "Pauillac Premier", region: "Bordeaux", type: "Red", vintage: 2018, quantity: 8, producer: "Various" },
  { name: "Pomerol Selection", region: "Bordeaux", type: "Red", vintage: 2016, quantity: 15, producer: "Various" },
  { name: "Saint-Émilion", region: "Bordeaux", type: "Red", vintage: 2017, quantity: 10, producer: "Various" },
  { name: "Graves White", region: "Bordeaux", type: "White", vintage: 2019, quantity: 3, producer: "Various" },
  
  // Burgundy - Pinot Noir and Chardonnay
  { name: "Pinot Noir Grand Cru", region: "Burgundy", type: "Red", vintage: 2015, quantity: 6, producer: "Various" },
  { name: "Chardonnay Premier", region: "Burgundy", type: "White", vintage: 2018, quantity: 9, producer: "Various" },
  { name: "Côte de Nuits", region: "Burgundy", type: "Red", vintage: 2017, quantity: 5, producer: "Various" },
  
  // Rhone - Syrah focus
  { name: "Côtes du Rhône Red", region: "Rhone", type: "Red", vintage: 2018, quantity: 7, producer: "Various" },
  { name: "Syrah Reserve", region: "Rhone", type: "Red", vintage: 2016, quantity: 4, producer: "Various" },
  { name: "Grenache Blend", region: "Rhone", type: "Red", vintage: 2019, quantity: 6, producer: "Various" },
  
  // Loire - Sauvignon & Cabernet Franc
  { name: "Sauvignon Blanc Loire", region: "Loire", type: "White", vintage: 2020, quantity: 5, producer: "Various" },
  { name: "Cabernet Franc", region: "Loire", type: "Red", vintage: 2018, quantity: 3, producer: "Various" },
  
  // Alsace - White wines
  { name: "Riesling Alsace", region: "Alsace", type: "White", vintage: 2019, quantity: 4, producer: "Various" },
  { name: "Gewürztraminer", region: "Alsace", type: "White", vintage: 2018, quantity: 2, producer: "Various" },
  
  // Champagne
  { name: "Champagne Brut", region: "Champagne", type: "Sparkling", vintage: 2016, quantity: 6, producer: "Various" },
  { name: "Vintage Champagne", region: "Champagne", type: "Sparkling", vintage: 2012, quantity: 2, producer: "Various" },
  
  // Provence - Rosé
  { name: "Provence Rosé", region: "Provence", type: "Rosé", vintage: 2020, quantity: 8, producer: "Various" },
  
  // Languedoc - Diversity
  { name: "Languedoc Red", region: "Languedoc", type: "Red", vintage: 2019, quantity: 5, producer: "Various" },
  { name: "Languedoc White", region: "Languedoc", type: "White", vintage: 2020, quantity: 3, producer: "Various" },
  
  // Southwest
  { name: "Cahors", region: "Southwest", type: "Red", vintage: 2017, quantity: 4, producer: "Various" },
];

/**
 * Use this curl command to add sample data:
 * 
 * for wine in [sampleWineData]; do
 *   curl -X POST http://localhost:8080/wines \
 *     -H "Content-Type: application/json" \
 *     -d '$wine'
 * done
 */
