import { v4 as uuidv4 } from "uuid";
import { CreateBottleInput, UpdateBottleInput, Bottle } from "../schemas/bottles.js";
import { BottleRepository } from "../repositories/bottle.repository.js";
import { logger } from "../utils/logger.js";
import { Prisma } from "@prisma/client";

/**
 * Bottle management service
 */
export class BottleService {
  private repo: BottleRepository;

  constructor() {
    this.repo = new BottleRepository();
  }

  /**
   * Get all bottles for a cellar (filtered by user ownership)
   */
  async getBottlesBycellarId(cellarId: string, userId: string): Promise<Bottle[]> {
    try {
      const bottles = await this.repo.getBottlesByCellarId(cellarId, userId);
      return bottles.map(this.mapToBottle);
    } catch (err) {
      logger.error(`Failed to list bottles: ${err instanceof Error ? err.message : String(err)}`);
      throw err;
    }
  }

  /**
   * Get all bottles for a user
   */
  async getBottlesByUserId(userId: string): Promise<Bottle[]> {
    try {
      const bottles = await this.repo.getBottlesByUserId(userId);
      return bottles.map(this.mapToBottle);
    } catch (err) {
      logger.error(`Failed to list user bottles: ${err instanceof Error ? err.message : String(err)}`);
      throw err;
    }
  }

  /**
   * Get a single bottle by ID
   */
  async getBottleById(bottleId: string, userId: string): Promise<Bottle | null> {
    try {
      const bottle = await this.repo.getBottleById(bottleId, userId);
      return bottle ? this.mapToBottle(bottle) : null;
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
    const now = new Date();

    try {
      const peakMaturity = (input as any).peakMaturity || {};

      const data: Prisma.bottlesCreateInput = {
        id,
        users: { connect: { id: userId } },
        cellars: { connect: { id: input.cellarId } }, // Assuming cellarId is present and valid
        category: input.category,
        label: input.label,
        producer_name: (input as any).producer || null,
        house_name: (input as any).house || null,
        distillery_name: (input as any).distillery || null,
        brand_name: (input as any).brand || null,
        name_edition: (input as any).name || (input as any).nameEdition || null,
        vintage_or_none: (input as any).vintageOrNone || "NV",
        abv: typeof (input as any).abv === 'number' ? (input as any).abv : null,
        is_opened: input.isOpened || false,
        fill_level: input.fillLevel || null,
        color: (input as any).color || null,
        appellation: (input as any).appellation || null,
        grapes: (input as any).grapes || null,
        format: (input as any).format || null,
        serving_temp: (input as any).servingTemp || null,
        wine_lot_number: (input as any).lotNumber || null,
        carafing: (input as any).carafing || null,
        requires_aeration: (input as any).requiresAeration || null,
        style: (input as any).style || null,
        dosage: (input as any).dosage || null,
        disgorgement: (input as any).disgorgement || null,
        pressure: (input as any).pressure || null,
        base_wine: (input as any).baseWine || null,
        bottling_date: (input as any).bottlingDate || null,
        base_year: (input as any).baseYear || null,
        age_statement: (input as any).ageStatement || null,
        cask_type: (input as any).caskType || null,
        batch: (input as any).batch || null,
        additive_note: (input as any).additiveNote || null,
        angel_share: (input as any).angelShare || null,
        aroma_profile: (input as any).aromaProfile || null,
        format_box: (input as any).formatBox || null,
        cigar_format: (input as any).cigarFormat || null,
        quantity_in_box: (input as any).quantity || null,
        manufacture_year: (input as any).manufactureYear || null,
        seal_state: (input as any).sealState || null,
        leaf_origin: (input as any).wrapper || null,
        binder: (input as any).binder || null,
        filler: (input as any).filler || null,
        factory_code: (input as any).factoryCode || null,
        target_humidity: (input as any).targetHumidity || null,
        humidification_system: (input as any).humidifier || null,
        location: input.location || null,
        collection: input.collection || null,
        photo_url: input.photoUrl || null,
        estimated_value: input.estimatedValue || null,
        peak_maturity_from: peakMaturity.from || null,
        peak_maturity_to: peakMaturity.to || null,
        alert_status: input.alertStatus || "none",
        tasting_note: input.tastingNote || null,
        purchase_place: input.purchasePlace || null,
        purchase_price: input.purchasePrice || null,
        tags: input.tags || [],
        created_at: now,
        updated_at: now
      };

      const bottle = await this.repo.createBottle(userId, input.cellarId, data);
      const mappedBottle = this.mapToBottle(bottle);

      // Trigger alert check
      try {
        const { AlertService } = await import('./alert.service.js');
        const alertService = new AlertService();
        await alertService.checkAndUpdateBottleAlert(mappedBottle);
      } catch (e) {
        logger.error({ error: e }, "Failed to update alert status after bottle creation");
      }

      return mappedBottle;
    } catch (err) {
      logger.error(`Failed to create bottle: ${err instanceof Error ? err.message : String(err)}`);
      throw err;
    }
  }

  /**
   * Update a bottle
   */
  async updateBottle(bottleId: string, input: UpdateBottleInput, userId: string): Promise<Bottle> {
    try {
      const param: any = input;
      const peakMaturity = param.peakMaturity || {}; // Could be partial in update, logic in original was merge

      // In repository pattern, we pass partial update.
      // But original code merged existing.
      // Prisma update takes partial.
      // We map inputs to Prisma fields.

      const data: Prisma.bottlesUpdateInput = {
        updated_at: new Date()
      };

      if (input.category !== undefined) data.category = input.category;
      if (input.label !== undefined) data.label = input.label;
      if (param.producer !== undefined) data.producer_name = param.producer;
      if (param.house !== undefined) data.house_name = param.house;
      if (param.distillery !== undefined) data.distillery_name = param.distillery;
      if (param.brand !== undefined) data.brand_name = param.brand;
      if (param.name !== undefined || param.nameEdition !== undefined) data.name_edition = param.name || param.nameEdition;
      if (param.vintageOrNone !== undefined) data.vintage_or_none = param.vintageOrNone;
      if (param.abv !== undefined) data.abv = param.abv;
      if (input.isOpened !== undefined) data.is_opened = input.isOpened;
      if (input.fillLevel !== undefined) data.fill_level = input.fillLevel;
      if (param.color !== undefined) data.color = param.color;
      if (param.appellation !== undefined) data.appellation = param.appellation;
      if (param.grapes !== undefined) data.grapes = param.grapes;
      if (param.format !== undefined) data.format = param.format;
      if (param.servingTemp !== undefined) data.serving_temp = param.servingTemp;
      if (param.lotNumber !== undefined) data.wine_lot_number = param.lotNumber;
      if (param.carafing !== undefined) data.carafing = param.carafing;
      if (param.requiresAeration !== undefined) data.requires_aeration = param.requiresAeration;
      if (param.style !== undefined) data.style = param.style;
      if (param.dosage !== undefined) data.dosage = param.dosage;
      if (param.disgorgement !== undefined) data.disgorgement = param.disgorgement;
      if (param.pressure !== undefined) data.pressure = param.pressure;
      if (param.baseWine !== undefined) data.base_wine = param.baseWine;
      if (param.bottlingDate !== undefined) data.bottling_date = param.bottlingDate;
      if (param.baseYear !== undefined) data.base_year = param.baseYear;
      if (param.ageStatement !== undefined) data.age_statement = param.ageStatement;
      if (param.caskType !== undefined) data.cask_type = param.caskType;
      if (param.batch !== undefined) data.batch = param.batch;
      if (param.additiveNote !== undefined) data.additive_note = param.additiveNote;
      if (param.angelShare !== undefined) data.angel_share = param.angelShare;
      if (param.aromaProfile !== undefined) data.aroma_profile = param.aromaProfile;
      if (param.formatBox !== undefined) data.format_box = param.formatBox;
      if (param.cigarFormat !== undefined) data.cigar_format = param.cigarFormat;
      if (param.quantity !== undefined) data.quantity_in_box = param.quantity;
      if (param.manufactureYear !== undefined) data.manufacture_year = param.manufactureYear;
      if (param.sealState !== undefined) data.seal_state = param.sealState;
      if (param.wrapper !== undefined) data.leaf_origin = param.wrapper;
      if (param.binder !== undefined) data.binder = param.binder;
      if (param.filler !== undefined) data.filler = param.filler;
      if (param.factoryCode !== undefined) data.factory_code = param.factoryCode;
      if (param.targetHumidity !== undefined) data.target_humidity = param.targetHumidity;
      if (param.humidifier !== undefined) data.humidification_system = param.humidifier;
      if (input.location !== undefined) data.location = input.location;
      if (input.collection !== undefined) data.collection = input.collection;
      if (input.photoUrl !== undefined) data.photo_url = input.photoUrl;
      if (input.estimatedValue !== undefined) data.estimated_value = input.estimatedValue;
      if (peakMaturity.from !== undefined) data.peak_maturity_from = peakMaturity.from;
      if (peakMaturity.to !== undefined) data.peak_maturity_to = peakMaturity.to;
      if (input.alertStatus !== undefined) data.alert_status = input.alertStatus;
      if (input.tastingNote !== undefined) data.tasting_note = input.tastingNote;
      if (input.purchasePlace !== undefined) data.purchase_place = input.purchasePlace;
      if (input.purchasePrice !== undefined) data.purchase_price = input.purchasePrice;
      if (input.tags !== undefined) data.tags = input.tags;

      const bottle = await this.repo.updateBottle(bottleId, userId, data);

      // Update alert status immediately
      const mappedBottle = this.mapToBottle(bottle);
      // We need to instantiate AlertService here to avoid circular dependency issues at module level,
      // or better, use dependency injection correctly. For now, dynamic import or local instantiation.
      // Since BottleService is used in AlertService, we have a circular dependency risk.
      // However, AlertService depends on BottleService. BottleService depending on AlertService is a cycle.
      // To break it, we can instantiate AlertService locally just for this operation, 
      // or move the trigger logic to the controller/route handler.
      // Given the architecture, let's try local dynamic import to be safe, or just instantiate if the module system handles it.
      // Actually, let's keep it simple: The best place for this orchestration is often the controller or a higher level service.
      // But user wants "immediate" feedback. 
      // Let's modify the service to accept an optional AlertService or similar, OR just do it here.

      // Ideally, we'd emit an event.
      // For this codebase, let's use a lazy-loaded AlertService approach to minimize refactoring impact.

      try {
        const { AlertService } = await import('./alert.service.js');
        const alertService = new AlertService();
        await alertService.checkAndUpdateBottleAlert(mappedBottle);
        // Re-fetch to get updated status if it changed?
        // checkAndUpdateBottleAlert updates the DB. The returned 'bottle' here doesn't have the new status.
        // But for the UI return, it might matter.
        // It's acceptable for the API response to show the pre-alert-calc state, 
        // as the notification will pop up asynchronously.
      } catch (e) {
        logger.error({ error: e }, "Failed to update alert status after bottle update");
      }

      return mappedBottle;
    } catch (err) {
      logger.error(`Failed to update bottle: ${err instanceof Error ? err.message : String(err)}`);
      throw err;
    }
  }

  /**
   * Delete a bottle permanently
   */
  async deleteBottle(bottleId: string, userId: string): Promise<boolean> {
    try {
      const success = await this.repo.deleteBottle(bottleId, userId);
      if (!success) {
        throw new Error("BOTTLE_NOT_FOUND");
      }
      return true;
    } catch (err) {
      logger.error(`Failed to delete bottle: ${err instanceof Error ? err.message : String(err)}`);
      throw err;
    }
  }

  /**
   * Map Prisma bottle result to Bottle schema
   */
  public mapToBottle(b: any): Bottle {
    return {
      id: b.id,
      userId: b.user_id,
      cellarId: b.cellar_id,
      category: b.category,
      label: b.label,
      producer: b.producer_name,
      house: b.house_name,
      distillery: b.distillery_name,
      brand: b.brand_name,
      name: b.name_edition, // Alias for name
      nameEdition: b.name_edition,
      vintageOrNone: b.vintage_or_none,
      abv: b.abv ? Number(b.abv) : null,
      isOpened: b.is_opened,
      fillLevel: b.fill_level,
      color: b.color,
      appellation: b.appellation,
      grapes: b.grapes,
      format: b.format,
      servingTemp: b.serving_temp,
      lotNumber: b.wine_lot_number,
      carafing: b.carafing,
      requiresAeration: b.requires_aeration,
      style: b.style,
      dosage: b.dosage,
      disgorgement: b.disgorgement,
      pressure: b.pressure,
      baseWine: b.base_wine,
      bottlingDate: b.bottling_date,
      baseYear: b.base_year,
      ageStatement: b.age_statement,
      caskType: b.cask_type,
      batch: b.batch,
      additiveNote: b.additive_note,
      angelShare: b.angel_share,
      aromaProfile: b.aroma_profile,
      formatBox: b.format_box,
      cigarFormat: b.cigar_format,
      quantity: b.quantity_in_box,
      manufactureYear: b.manufacture_year,
      sealState: b.seal_state,
      wrapper: b.leaf_origin,
      binder: b.binder,
      filler: b.filler,
      factoryCode: b.factory_code,
      targetHumidity: b.target_humidity,
      humidifier: b.humidification_system,
      location: b.location,
      collection: b.collection,
      photoUrl: b.photo_url,
      estimatedValue: b.estimated_value ? Number(b.estimated_value) : null,
      peakMaturity: {
        from: b.peak_maturity_from,
        to: b.peak_maturity_to
      },
      alertStatus: b.alert_status,
      tastingNote: b.tasting_note,
      purchasePlace: b.purchase_place,
      purchasePrice: b.purchase_price ? Number(b.purchase_price) : null,
      tags: b.tags,
      createdAt: b.created_at,
      updatedAt: b.updated_at,
      deletedAt: null
    } as Bottle;
  }
}
