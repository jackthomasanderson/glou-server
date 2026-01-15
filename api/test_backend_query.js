import pkg from 'pg';
const { Pool } = pkg;

const pool = new Pool({
    host: 'localhost',
    user: 'glou',
    password: 'glou',
    database: 'glou',
    port: 5432,
});

const BOTTLE_SELECT = `
    id,
    user_id as "userId",
    cellar_id as "cellarId",
    category,
    label,
    producer_name as "producer",
    house_name as "house",
    distillery_name as "distillery",
    brand_name as "brand",
    name_edition as "name",
    name_edition as "nameEdition",
    vintage_or_none as "vintageOrNone",
    abv,
    is_opened as "isOpened",
    fill_level as "fillLevel",
    color,
    appellation,
    grapes,
    format,
    serving_temp as "servingTemp",
    wine_lot_number as "lotNumber",
    carafing,
    requires_aeration as "requiresAeration",
    style,
    dosage,
    disgorgement,
    pressure,
    base_wine as "baseWine",
    bottling_date as "bottlingDate",
    base_year as "baseYear",
    age_statement as "ageStatement",
    cask_type as "caskType",
    batch,
    additive_note as "additiveNote",
    angel_share as "angelShare",
    aroma_profile as "aromaProfile",
    format_box as "formatBox",
    cigar_format as "cigarFormat",
    quantity_in_box as "quantity",
    manufacture_year as "manufactureYear",
    seal_state as "sealState",
    leaf_origin as "wrapper",
    binder,
    filler,
    factory_code as "factoryCode",
    target_humidity as "targetHumidity",
    humidification_system as "humidifier",
    location,
    collection,
    photo_url as "photoUrl",
    estimated_value as "estimatedValue",
    json_build_object('from', peak_maturity_from, 'to', peak_maturity_to) as "peakMaturity",
    alert_status as "alertStatus",
    tasting_note as "tastingNote",
    purchase_place as "purchasePlace",
    purchase_price as "purchasePrice",
    tags,
    created_at as "createdAt",
    updated_at as "updatedAt"
  `;

const CELLAR_ID = '3c642481-d237-45da-812a-3a60625a2454';
const USER_ID = 'd9f09258-40ad-4806-8474-e4f808f3563f';

async function run() {
    try {
        const query = `
          SELECT ${BOTTLE_SELECT}
          FROM bottles
          WHERE cellar_id = $1 AND user_id = $2
          ORDER BY created_at DESC
        `;
        const res = await pool.query(query, [CELLAR_ID, USER_ID]);
        console.log(`Found ${res.rows.length} bottles.`);
        console.log(JSON.stringify(res.rows, null, 2));

    } catch (err) {
        console.error(err);
    } finally {
        await pool.end();
    }
}

run();
