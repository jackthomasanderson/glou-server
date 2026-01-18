import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient({
    log: ['error'],
});

async function main() {
    console.log("Starting seed of 20 bottles...");

    // 1. Find a user (take the first one)
    const user = await prisma.users.findFirst({
        where: { email: "demo@glou.com" }
    });
    if (!user) {
        console.error("❌ No users found in the database. Please register a user first.");
        process.exit(1);
    }
    console.log(`👤 Using user: ${user.display_name || user.username} (${user.id})`);

    // 2. Find a cellar for this user or create one
    let cellar = await prisma.cellars.findFirst({
        where: { user_id: user.id },
    });

    if (!cellar) {
        console.log("⚠️ No cellar found for user. Creating 'Default Cellar'...");
        cellar = await prisma.cellars.create({
            data: {
                user_id: user.id,
                name: "Default Cellar",
                cellar_type: "combined",
                location_description: "Created by seed script",
            },
        });
    }
    console.log(`🏠 Using cellar: ${cellar.name} (${cellar.id})`);

    // 3. Define 20 realistic bottles
    const bottlesToCreate = [
        {
            label: "Château Margaux",
            category: "wine",
            vintage_or_none: "2015",
            producer_name: "Château Margaux",
            appellation: "Margaux",
            color: "red",
            region: "Bordeaux",
            country: "France",
            purchase_price: 350.00,
            peak_maturity_from: 2025,
            peak_maturity_to: 2040,
            fill_level: "full",
        },
        {
            label: "Château Latour",
            category: "wine",
            vintage_or_none: "2010",
            producer_name: "Château Latour",
            appellation: "Pauillac",
            color: "red",
            region: "Bordeaux",
            country: "France",
            purchase_price: 800.00,
            peak_maturity_from: 2030,
            peak_maturity_to: 2050,
            fill_level: "full",
        },
        {
            label: "Opus One",
            category: "wine",
            vintage_or_none: "2018",
            producer_name: "Opus One Winery",
            appellation: "Napa Valley",
            color: "red",
            region: "California",
            country: "USA",
            purchase_price: 320.00,
            peak_maturity_from: 2028,
            peak_maturity_to: 2045,
            fill_level: "full",
        },
        {
            label: "Sassicaia",
            category: "wine",
            vintage_or_none: "2016",
            producer_name: "Tenuta San Guido",
            appellation: "Bolgheri",
            color: "red",
            region: "Tuscany",
            country: "Italy",
            purchase_price: 250.00,
            peak_maturity_from: 2026,
            peak_maturity_to: 2040,
            fill_level: "full",
        },
        {
            label: "Tignanello",
            category: "wine",
            vintage_or_none: "2019",
            producer_name: "Marchesi Antinori",
            appellation: "Toscana IGT",
            color: "red",
            region: "Tuscany",
            country: "Italy",
            purchase_price: 140.00,
            peak_maturity_from: 2025,
            peak_maturity_to: 2035,
            fill_level: "full",
        },
        {
            label: "Dom Pérignon",
            category: "wine",
            vintage_or_none: "2012",
            producer_name: "Moët & Chandon",
            appellation: "Champagne",
            color: "sparkling",
            region: "Champagne",
            country: "France",
            purchase_price: 180.00,
            peak_maturity_from: 2020,
            peak_maturity_to: 2035,
            fill_level: "full",
        },
        {
            label: "Krug Grande Cuvée",
            category: "wine",
            vintage_or_none: "NV",
            producer_name: "Krug",
            appellation: "Champagne",
            color: "sparkling",
            region: "Champagne",
            country: "France",
            purchase_price: 200.00,
            peak_maturity_from: 2023,
            peak_maturity_to: 2030,
            fill_level: "full",
        },
        {
            label: "Grange",
            category: "wine",
            vintage_or_none: "2014",
            producer_name: "Penfolds",
            appellation: "South Australia",
            color: "red",
            region: "South Australia",
            country: "Australia",
            purchase_price: 600.00,
            peak_maturity_from: 2030,
            peak_maturity_to: 2050,
            fill_level: "full",
        },
        {
            label: "Unico",
            category: "wine",
            vintage_or_none: "2009",
            producer_name: "Vega Sicilia",
            appellation: "Ribera del Duero",
            color: "red",
            region: "Castilla y León",
            country: "Spain",
            purchase_price: 400.00,
            peak_maturity_from: 2025,
            peak_maturity_to: 2045,
            fill_level: "full",
        },
        {
            label: "Meursault Les Perrières",
            category: "wine",
            vintage_or_none: "2017",
            producer_name: "Coche-Dury",
            appellation: "Meursault",
            color: "white",
            region: "Burgundy",
            country: "France",
            purchase_price: 1200.00,
            peak_maturity_from: 2024,
            peak_maturity_to: 2035,
            fill_level: "full",
        },
        {
            label: "Montrachet",
            category: "wine",
            vintage_or_none: "2015",
            producer_name: "Domaine de la Romanée-Conti",
            appellation: "Montrachet",
            color: "white",
            region: "Burgundy",
            country: "France",
            purchase_price: 8000.00,
            peak_maturity_from: 2030,
            peak_maturity_to: 2050,
            fill_level: "full",
        },
        {
            label: "Macallan 18 Year Old",
            category: "spirit",
            vintage_or_none: "NV",
            producer_name: "The Macallan",
            appellation: "Speyside",
            color: "amber",
            region: "Scotland",
            country: "UK",
            purchase_price: 350.00,
            alcohol_percentage: 43.0,
            fill_level: "full",
        },
        {
            label: "Lagavulin 16 Year Old",
            category: "spirit",
            vintage_or_none: "NV",
            producer_name: "Lagavulin",
            appellation: "Islay",
            color: "amber",
            region: "Scotland",
            country: "UK",
            purchase_price: 85.00,
            alcohol_percentage: 43.0,
            fill_level: "full",
        },
        {
            label: "Yamazaki 12 Year Old",
            category: "spirit",
            vintage_or_none: "NV",
            producer_name: "Suntory",
            appellation: "Japan",
            color: "amber",
            region: "Japan",
            country: "Japan",
            purchase_price: 150.00,
            alcohol_percentage: 43.0,
            fill_level: "full",
        },
        {
            label: "Hibiki Harmony",
            category: "spirit",
            vintage_or_none: "NV",
            producer_name: "Suntory",
            appellation: "Japan",
            color: "amber",
            region: "Japan",
            country: "Japan",
            purchase_price: 90.00,
            alcohol_percentage: 43.0,
            fill_level: "full",
        },
        {
            label: "Clase Azul Reposado",
            category: "spirit",
            vintage_or_none: "NV",
            producer_name: "Clase Azul",
            appellation: "Tequila",
            color: "gold",
            region: "Jalisco",
            country: "Mexico",
            purchase_price: 160.00,
            alcohol_percentage: 40.0,
            fill_level: "full",
        },
        {
            label: "Don Julio 1942",
            category: "spirit",
            vintage_or_none: "NV",
            producer_name: "Don Julio",
            appellation: "Tequila",
            color: "gold",
            region: "Jalisco",
            country: "Mexico",
            purchase_price: 150.00,
            alcohol_percentage: 40.0,
            fill_level: "full",
        },
        {
            label: "Pappy Van Winkle 15 Year",
            category: "spirit",
            vintage_or_none: "NV",
            producer_name: "Old Rip Van Winkle",
            appellation: "Bourbon",
            color: "amber",
            region: "Kentucky",
            country: "USA",
            purchase_price: 1500.00,
            alcohol_percentage: 53.5,
            fill_level: "full",
        },
        {
            label: "Chartreuse V.E.P. Green",
            category: "spirit",
            vintage_or_none: "NV",
            producer_name: "Chartreuse Monks",
            appellation: "Liqueur",
            color: "green",
            region: "France",
            country: "France",
            purchase_price: 180.00,
            alcohol_percentage: 54.0,
            fill_level: "full",
        },
        {
            label: "Hennessy XO",
            category: "spirit",
            vintage_or_none: "NV",
            producer_name: "Hennessy",
            appellation: "Cognac",
            color: "amber",
            region: "Cognac",
            country: "France",
            purchase_price: 220.00,
            alcohol_percentage: 40.0,
            fill_level: "high_fill",
        },
    ];

    // 4. Insert them
    let createdCount = 0;
    for (const info of bottlesToCreate) {
        const { alcohol_percentage, region, country, ...rest } = info;

        // Map data to schema
        const data = {
            user_id: user.id,
            cellar_id: cellar.id,
            ...rest,
            name_edition: info.label, // Required field
            abv: alcohol_percentage,
            is_opened: false,
            alert_status: "none",
        };
        try {
            await prisma.bottles.create({ data });
            createdCount++;
        } catch (err) {
            console.error(`Failed to create ${info.label}:`, err);
        }
    }

    console.log(`✅ Successfully seeded ${createdCount} bottles!`);
}

main()
    .catch((e) => {
        console.error("❌ Fatal error seeding:", e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
