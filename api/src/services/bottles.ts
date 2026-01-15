import { v4 as uuidv4 } from "uuid";
import { CreateBottleInput, UpdateBottleInput, Bottle } from "../schemas/bottles.js";
import { DatabaseService } from "./database.js";
import { logger } from "../utils/logger.js";

/**
 * Bottle management service
 */
export class BottleService {
  static readonly BOTTLE_SELECT = `
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

  constructor(private db: DatabaseService) { }

  /**
   * Get all bottles for a cellar (filtered by user ownership)
   */
  async getBottlesBycellarId(cellarId: string, userId: string): Promise<Bottle[]> {
    const query = `
      SELECT ${BottleService.BOTTLE_SELECT}
      FROM bottles
      WHERE cellar_id = $1 AND user_id = $2
      ORDER BY created_at DESC
    `;

    try {
      const result = await this.db.query(query, [cellarId, userId]);
      return result.rows as Bottle[];
    } catch (err) {
      logger.error(`Failed to list bottles: ${err instanceof Error ? err.message : String(err)}`);
      throw err;
    }
  }

  /**
   * Get all bottles for a user
   */
  async getBottlesByUserId(userId: string): Promise<Bottle[]> {
    const query = `
      SELECT ${BottleService.BOTTLE_SELECT}
      FROM bottles
      WHERE user_id = $1
      ORDER BY created_at DESC
    `;

    try {
      const result = await this.db.query(query, [userId]);
      return result.rows as Bottle[];
    } catch (err) {
      logger.error(`Failed to list user bottles: ${err instanceof Error ? err.message : String(err)}`);
      throw err;
    }
  }

  /**
   * Get a single bottle by ID
   */
  async getBottleById(bottleId: string, userId: string): Promise<Bottle | null> {
    const query = `
      SELECT ${BottleService.BOTTLE_SELECT}
      FROM bottles
      WHERE id = $1 AND user_id = $2
    `;

    try {
      const result = await this.db.query(query, [bottleId, userId]);
      return result.rows[0] || null;
    } catch (err) {
      logger.error(`Failed to get bottle: ${err instanceof Error ? err.message : String(err)}`);
      throw err;
    }
  }

  /**
   * Create a new bottle
   */
  async createBottle(input: CreateBottleInput, userId: string): Promise<Bottle> {
    const id = uuidv4();
    const now = new Date().toISOString();

    const query = `
      INSERT INTO bottles (
        id, user_id, cellar_id, category, label,
        producer_name, house_name, distillery_name, brand_name,
        name_edition, vintage_or_none, abv,
        is_opened, fill_level,
        color, appellation, grapes, format, serving_temp, wine_lot_number, carafing, requires_aeration,
        style, dosage, disgorgement, pressure, base_wine, bottling_date, base_year,
        age_statement, cask_type, batch, additive_note, angel_share, aroma_profile,
        format_box, cigar_format, quantity_in_box, manufacture_year, seal_state, leaf_origin, binder, filler, factory_code, target_humidity, humidification_system,
        location, collection, photo_url, estimated_value, peak_maturity_from, peak_maturity_to,
        alert_status, tasting_note, purchase_place, purchase_price, tags,
        created_at, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5,
        $6, $7, $8, $9,
        $10, $11, $12,
        $13, $14,
        $15, $16, $17, $18, $19, $20, $21, $22,
        $23, $24, $25, $26, $27, $28, $29,
        $30, $31, $32, $33, $34, $35,
        $36, $37, $38, $39, $40, $41, $42, $43, $44, $45, $46,
        $47, $48, $49, $50, $51, $52,
        $53, $54, $55, $56, $57,
        $58, $59
      )
      RETURNING ${BottleService.BOTTLE_SELECT}
    `;

    const peakMaturity = (input as any).peakMaturity || {};
    const abv = (input as any).abv;
    const values = [
      id, userId, input.cellarId, input.category, input.label,
      (input as any).producer || null,
      (input as any).house || null,
      (input as any).distillery || null,
      (input as any).brand || null,
      (input as any).name || (input as any).nameEdition || null,
      (input as any).vintageOrNone || "NV",
      typeof abv === 'number' ? abv : null,
      input.isOpened || false,
      input.fillLevel || null,
      (input as any).color || null,
      (input as any).appellation || null,
      (input as any).grapes || null,
      (input as any).format || null,
      (input as any).servingTemp || null,
      (input as any).lotNumber || null,
      (input as any).carafing || null,
      (input as any).requiresAeration || null,
      (input as any).style || null,
      (input as any).dosage || null,
      (input as any).disgorgement || null,
      (input as any).pressure || null,
      (input as any).baseWine || null,
      (input as any).bottlingDate || null,
      (input as any).baseYear || null,
      (input as any).ageStatement || null,
      (input as any).caskType || null,
      (input as any).batch || null,
      (input as any).additiveNote || null,
      (input as any).angelShare || null,
      (input as any).aromaProfile || null,
      (input as any).formatBox || null,
      (input as any).cigarFormat || null,
      (input as any).quantity || null,
      (input as any).manufactureYear || null,
      (input as any).sealState || null,
      (input as any).wrapper || null,
      (input as any).binder || null,
      (input as any).filler || null,
      (input as any).factoryCode || null,
      (input as any).targetHumidity || null,
      (input as any).humidifier || null,
      input.location || null,
      input.collection || null,
      input.photoUrl || null,
      input.estimatedValue || null,
      peakMaturity.from || null,
      peakMaturity.to || null,
      input.alertStatus || "none",
      input.tastingNote || null,
      input.purchasePlace || null,
      input.purchasePrice || null,
      input.tags || [],
      now,
      now
    ];

    try {
      const result = await this.db.query(query, values);
      return result.rows[0] as Bottle;
    } catch (err) {
      logger.error(`Failed to create bottle: ${err instanceof Error ? err.message : String(err)}`);
      throw err;
    }
  }

  /**
   * Update a bottle
   */
  async updateBottle(bottleId: string, input: UpdateBottleInput, userId: string): Promise<Bottle> {
    // Get existing bottle to merge
    const existing = await this.getBottleById(bottleId, userId);
    if (!existing) {
      throw new Error("BOTTLE_NOT_FOUND");
    }

    const merged = { ...existing, ...input };
    const peakMaturity = (merged as any).peakMaturity || { from: null, to: null };

    const query = `
      UPDATE bottles SET
        category = $1,
        label = $2,
        producer_name = $3,
        house_name = $4,
        distillery_name = $5,
        brand_name = $6,
        name_edition = $7,
        vintage_or_none = $8,
        abv = $9,
        is_opened = $10,
        fill_level = $11,
        color = $12,
        appellation = $13,
        grapes = $14,
        format = $15,
        serving_temp = $16,
        wine_lot_number = $17,
        carafing = $18,
        requires_aeration = $19,
        style = $20,
        dosage = $21,
        disgorgement = $22,
        pressure = $23,
        base_wine = $24,
        bottling_date = $25,
        base_year = $26,
        age_statement = $27,
        cask_type = $28,
        batch = $29,
        additive_note = $30,
        angel_share = $31,
        aroma_profile = $32,
        format_box = $33,
        cigar_format = $34,
        quantity_in_box = $35,
        manufacture_year = $36,
        seal_state = $37,
        leaf_origin = $38,
        binder = $39,
        filler = $40,
        factory_code = $41,
        target_humidity = $42,
        humidification_system = $43,
        location = $44,
        collection = $45,
        photo_url = $46,
        estimated_value = $47,
        peak_maturity_from = $48,
        peak_maturity_to = $49,
        alert_status = $50,
        tasting_note = $51,
        purchase_place = $52,
        purchase_price = $53,
        tags = $54
      WHERE id = $55 AND user_id = $56
      RETURNING ${BottleService.BOTTLE_SELECT}
    `;

    const values = [
      merged.category,
      merged.label,
      (merged as any).producer || null,
      (merged as any).house || null,
      (merged as any).distillery || null,
      (merged as any).brand || null,
      (merged as any).name || (merged as any).nameEdition || null,
      (merged as any).vintageOrNone || "NV",
      merged.abv || null,
      merged.isOpened || false,
      merged.fillLevel || null,
      (merged as any).color || null,
      (merged as any).appellation || null,
      (merged as any).grapes || null,
      (merged as any).format || null,
      (merged as any).servingTemp || null,
      (merged as any).lotNumber || null,
      (merged as any).carafing || null,
      (merged as any).requiresAeration || null,
      (merged as any).style || null,
      (merged as any).dosage || null,
      (merged as any).disgorgement || null,
      (merged as any).pressure || null,
      (merged as any).baseWine || null,
      (merged as any).bottlingDate || null,
      (merged as any).baseYear || null,
      (merged as any).ageStatement || null,
      (merged as any).caskType || null,
      (merged as any).batch || null,
      (merged as any).additiveNote || null,
      (merged as any).angelShare || null,
      (merged as any).aromaProfile || null,
      (merged as any).formatBox || null,
      (merged as any).cigarFormat || null,
      (merged as any).quantity || null,
      (merged as any).manufactureYear || null,
      (merged as any).sealState || null,
      (merged as any).wrapper || null,
      (merged as any).binder || null,
      (merged as any).filler || null,
      (merged as any).factoryCode || null,
      (merged as any).targetHumidity || null,
      (merged as any).humidifier || null,
      merged.location || null,
      merged.collection || null,
      merged.photoUrl || null,
      merged.estimatedValue || null,
      peakMaturity.from || null,
      peakMaturity.to || null,
      merged.alertStatus || "none",
      merged.tastingNote || null,
      merged.purchasePlace || null,
      merged.purchasePrice || null,
      merged.tags || [],
      bottleId,
      userId
    ];

    try {
      const result = await this.db.query(query, values);
      if (result.rows.length === 0) {
        throw new Error("BOTTLE_NOT_FOUND");
      }
      return result.rows[0] as Bottle;
    } catch (err) {
      logger.error(`Failed to update bottle: ${err instanceof Error ? err.message : String(err)}`);
      throw err;
    }
  }

  /**
   * Delete a bottle permanently
   */
  async deleteBottle(bottleId: string, userId: string): Promise<boolean> {
    const query = `
      DELETE FROM bottles
      WHERE id = $1 AND user_id = $2
    `;

    try {
      const result = await this.db.query(query, [bottleId, userId]);
      if ((result.rowCount ?? 0) === 0) {
        throw new Error("BOTTLE_NOT_FOUND");
      }
      return true;
    } catch (err) {
      logger.error(`Failed to delete bottle: ${err instanceof Error ? err.message : String(err)}`);
      throw err;
    }
  }
}
