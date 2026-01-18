"use client";

import { useMemo, useState, useEffect, useCallback } from "react";
import ImageUpload from "./ImageUpload";
import { imagesClient } from "../lib/images/client";
import {
    type BottleCategory,
    type BottleInput,
    type BottleRecord,
    type CigarBottleInput,
    type SparklingBottleInput,
    type SpiritBottleInput,
    type WineBottleInput
} from "../lib/bottles/schema";
import { useTranslations } from "../lib/i18n/I18nProvider";
import { OpenedBottleReminder } from "./OpenedBottleReminder";


type BottleFormProps = {
    cellars: { id: string; name: string; cellarType: string }[];
    initialData: BottleRecord | null;
    defaultCategory?: BottleCategory;
    fixedCategory?: BottleCategory;
    onSave: (data: BottleInput) => void;
    onCancel: () => void;
    readOnly?: boolean;
};

const baseFields = {
    cellarId: "",
    label: "",
    location: "",
    collection: "",
    tags: [] as string[],
    photoUrl: "",
    isOpened: false,
    fillLevel: undefined,
    estimatedValue: undefined as number | undefined,
    peakMaturity: undefined as { from?: number; to?: number } | undefined,
    alertStatus: "none" as BottleInput["alertStatus"],
    tastingNote: "",
    purchasePlace: "",
    purchasePrice: undefined as number | undefined,
    quantity: 1
};

type WineInput = WineBottleInput;
type SparklingInput = SparklingBottleInput;
type SpiritInput = SpiritBottleInput;
type CigarInput = CigarBottleInput;

const buildDefaults = (category: BottleCategory): BottleInput => {
    switch (category) {
        case "sparkling":
            return {
                ...baseFields,
                category,
                house: "",
                name: "",
                vintageOrNone: "",
                style: "",
                dosage: "",
                disgorgement: "",
                pressure: "",
                baseWine: "",
                servingTemp: "",
                bottlingDate: "",
                baseYear: undefined
            };
        case "spirit":
            return {
                ...baseFields,
                category,
                distillery: "",
                nameEdition: "",
                abv: 40,
                ageStatement: "",
                caskType: "",
                batch: "",
                additiveNote: "",
                angelShare: "",
                aromaProfile: ""
            };
        case "cigar":
            return {
                ...baseFields,
                category,
                brand: "",
                format: "",
                quantity: 1,
                wrapper: "",
                binder: "",
                filler: "",
                factoryCode: "",
                targetHumidity: "",
                humidifier: "",
                manufactureYear: undefined
            };
        case "wine":
        default:
            return {
                ...baseFields,
                category: "wine",
                producer: "",
                name: "",
                vintageOrNone: "NV",
                color: "red",
                appellation: "",
                grapes: "",
                abv: 13,
                format: "",
                servingTemp: "",
                lotNumber: "",
                carafing: "",
                requiresAeration: false
            };
    }
};

function Field({ label, children, required, hint }: { label: string; children: React.ReactNode; required?: boolean; hint?: string }) {
    return (
        <label className="field">
            <span className="field__label">
                {label}
                {required && <span className="field__required">*</span>}
                {hint ? (
                    <span className="field__hint" aria-label={hint} title={hint}>i</span>
                ) : null}
            </span>
            {children}
        </label>
    );
}

export function BottleForm({ cellars, initialData, defaultCategory = "wine", fixedCategory, onSave, onCancel, readOnly }: BottleFormProps) {
    const { t } = useTranslations();
    const [form, setForm] = useState<BottleInput>(() => buildDefaults(fixedCategory || defaultCategory));
    const [showOptionals, setShowOptionals] = useState(false);
    const [isSearchingImage, setIsSearchingImage] = useState(false);
    const [showReminder, setShowReminder] = useState(false);

    const handleAutoSearch = useCallback(async () => {
        if (form.photoUrl && !form.photoUrl.startsWith('http')) return; // If manually uploaded base64, don't overwrite

        let query = "";
        if (form.category === "wine") {
            const f = form as WineInput;
            const colorLabel = t(`fields.wineColors.${f.color}`) || f.color;
            query = `${f.producer} ${f.name} ${f.vintageOrNone} ${colorLabel} wine bottle white background`.trim();
        } else if (form.category === "sparkling") {
            const f = form as SparklingInput;
            query = `${f.house} ${f.name} ${f.vintageOrNone} champagne bottle white background`.trim();
        } else if (form.category === "spirit") {
            const f = form as SpiritInput;
            query = `${f.distillery} ${f.nameEdition} bottle white background`.trim();
        } else if (form.category === "cigar") {
            const f = form as CigarInput;
            query = `${f.brand} ${f.format} cigar sticks`.trim();
        }

        if (!query || query.length < 5) {
            return;
        }

        setIsSearchingImage(true);
        try {
            const url = await imagesClient.search(query);
            if (url) {
                setForm(prev => ({ ...prev, photoUrl: url }));
            }
        } finally {
            setIsSearchingImage(false);
        }
    }, [form]);

    // Check if all required fields are filled
    const areRequiredFieldsFilled = useCallback(() => {
        if (!form.cellarId) return false;

        if (form.category === "wine") {
            const f = form as WineInput;
            return !!(f.producer && f.name && f.vintageOrNone && f.color);
        } else if (form.category === "sparkling") {
            const f = form as SparklingInput;
            return !!(f.house && f.name && f.vintageOrNone);
        } else if (form.category === "spirit") {
            const f = form as SpiritInput;
            return !!(f.distillery && f.nameEdition);
        } else if (form.category === "cigar") {
            const f = form as CigarInput;
            return !!(f.brand && f.format);
        }
        return false;
    }, [form]);

    // Auto-search when required fields are filled
    useEffect(() => {
        if (readOnly || initialData) return; // Don't auto-search in edit mode
        if (!areRequiredFieldsFilled()) return;
        if (form.photoUrl) return; // Already has an image

        // Debounce the search to avoid excessive API calls
        const timer = setTimeout(() => {
            handleAutoSearch();
        }, 800); // Wait 800ms after last field change

        return () => clearTimeout(timer);
    }, [form, areRequiredFieldsFilled, handleAutoSearch, readOnly, initialData]);



    // Auto-populate cellarId when cellars load
    useEffect(() => {
        if (cellars.length > 0 && !form.cellarId) {
            setForm(prev => ({ ...prev, cellarId: cellars[0].id } as BottleInput));
        }
    }, [cellars, form.cellarId]);

    // Handle edit mode
    useEffect(() => {
        if (initialData) {
            // Sanitize all null values from DB to undefined/defaults
            const sanitized = { ...initialData } as any;
            Object.keys(sanitized).forEach(key => {
                if (sanitized[key] === null) {
                    sanitized[key] = undefined;
                }
            });

            // Specific defaults
            if (sanitized.quantity === undefined) sanitized.quantity = 1;
            if (!sanitized.tags) sanitized.tags = [];
            if (sanitized.category === "wine") {
                if (!sanitized.color) sanitized.color = "red";
            } else {
                delete sanitized.color;
            }
            if (sanitized.photoUrl === undefined) sanitized.photoUrl = "";
            if (sanitized.peakMaturity === null) sanitized.peakMaturity = undefined;

            setForm(sanitized as BottleInput);
            setShowOptionals(true);
            window.scrollTo({ top: 0, behavior: "smooth" });
        } else {
            setForm(buildDefaults(fixedCategory || defaultCategory));
            setShowOptionals(false);
            // Re-apply cellarId on reset if available
            if (cellars.length > 0) {
                setForm(prev => ({ ...prev, cellarId: cellars[0].id } as BottleInput));
            }
        }
    }, [initialData, cellars, fixedCategory, defaultCategory]);

    const handleCategoryChange = (category: BottleCategory) => {
        if (category === "cigar") {
            const hasTobaccoCellar = cellars.some(c => ["combined", "hybrid", "cigar", "other"].includes(c.cellarType));
            if (!hasTobaccoCellar) {
                alert(t("errors.noTobaccoCellar") || "Vous devez créer une cave à cigares, hybride ou combinée avant de pouvoir ajouter du tabac.");
                return;
            }
        }

        const preserved = {
            ...baseFields,
            label: form.label,
            location: form.location,
            collection: form.collection,
            tags: form.tags ?? [],
            photoUrl: form.photoUrl,
            isOpened: form.isOpened,
            fillLevel: form.fillLevel,
            estimatedValue: form.estimatedValue,
            peakMaturity: form.peakMaturity,
            alertStatus: form.alertStatus,
            tastingNote: form.tastingNote,
            purchasePlace: form.purchasePlace,
            purchasePrice: form.purchasePrice,
            quantity: form.quantity ?? 1,
            cellarId: form.cellarId // Preserve cellarId
        };
        setForm({ ...buildDefaults(category), ...preserved, category });
    };

    const handleSubmit = (event: React.FormEvent) => {
        event.preventDefault();
        if (!form.cellarId) {
            alert(t("errors.cellarIdRequired") || "Cellar is required");
            return;
        }
        onSave(form);

        // If creating (no initialData), reset form to defaults but keep cellarId
        if (!initialData) {
            setForm(prev => ({ ...buildDefaults(prev.category), cellarId: prev.cellarId }));
        }
    };

    const essentials = useMemo(() => {
        switch (form.category) {
            case "sparkling": {
                const sparklingForm = form as SparklingInput;
                return (
                    <div className="grid">
                        <Field label={t("fields.house")} required hint={t("hints.house")}
                        >
                            <input value={sparklingForm.house ?? ""}
                                onChange={(e) => setForm((prev) => ({ ...prev, house: e.target.value }))}
                                disabled={readOnly} />
                        </Field>
                        <Field label={t("fields.sparkling.name")} required hint={t("hints.sparklingName")}
                        >
                            <input value={sparklingForm.name ?? ""}
                                onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                                disabled={readOnly} />
                        </Field>
                        <Field label={t("fields.vintageOrNone")} hint={t("hints.vintageOrNone")}
                        >
                            <input
                                value={sparklingForm.vintageOrNone ?? ""}
                                onChange={(e) => setForm((prev) => ({ ...prev, vintageOrNone: e.target.value }))}
                                disabled={readOnly}
                            />
                        </Field>
                    </div>
                );
            }
            case "spirit": {
                const spiritForm = form as SpiritInput;
                return (
                    <div className="grid">
                        <Field label={t("fields.distillery")} required hint={t("hints.distillery")}
                        >
                            <input value={spiritForm.distillery ?? ""}
                                onChange={(e) => setForm((prev) => ({ ...prev, distillery: e.target.value }))}
                                disabled={readOnly} />
                        </Field>
                        <Field label={t("fields.spirit.nameEdition")} required hint={t("hints.nameEdition")}
                        >
                            <input value={spiritForm.nameEdition ?? ""}
                                onChange={(e) => setForm((prev) => ({ ...prev, nameEdition: e.target.value }))}
                                onBlur={() => !form.photoUrl && handleAutoSearch()}
                                disabled={readOnly} />
                        </Field>
                        <Field label={t("fields.abv")} required hint={t("hints.abv")}
                        >
                            <input
                                type="number"
                                min={20}
                                max={80}
                                step={0.5}
                                value={spiritForm.abv ?? ""}
                                onChange={(e) =>
                                    setForm((prev) => ({ ...prev, abv: e.target.value ? Number(e.target.value) : undefined }))
                                }
                                disabled={readOnly}
                            />
                        </Field>
                    </div>
                );
            }
            case "cigar": {
                const cigarForm = form as CigarInput;
                return (
                    <div className="grid">
                        <Field label={t("fields.brand")} required hint={t("hints.brand")}
                        >
                            <input value={cigarForm.brand ?? ""}
                                onChange={(e) => setForm((prev) => ({ ...prev, brand: e.target.value }))}
                                onBlur={() => !form.photoUrl && handleAutoSearch()}
                                disabled={readOnly} />
                        </Field>
                        <Field label={t("fields.format")} required hint={t("hints.formatCigar")}
                        >
                            <input value={cigarForm.format ?? ""}
                                onChange={(e) => setForm((prev) => ({ ...prev, format: e.target.value }))}
                                onBlur={() => !form.photoUrl && handleAutoSearch()}
                                disabled={readOnly} />
                        </Field>
                        <Field label={t("fields.quantity")} required hint={t("hints.quantity")}
                        >
                            <input
                                type="number"
                                min={1}
                                value={cigarForm.quantity ?? 1}
                                onChange={(e) => setForm((prev) => ({ ...prev, quantity: Number(e.target.value) }))}
                                disabled={readOnly}
                            />
                        </Field>
                    </div>
                );
            }
            case "wine":
            default: {
                const wineForm = form as WineInput;
                return (
                    <div className="grid">
                        <Field label={t("fields.producer")} required hint={t("hints.producer")}
                        >
                            <input value={wineForm.producer ?? ""}
                                onChange={(e) => setForm((prev) => ({ ...prev, producer: e.target.value }))}
                                disabled={readOnly} />
                        </Field>
                        <Field label={t("fields.wine.name")} required hint={t("hints.wineName")}
                        >
                            <input value={wineForm.name ?? ""}
                                onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                                disabled={readOnly} />
                        </Field>
                        <Field label={t("fields.vintageOrNone")} hint={t("hints.vintageOrNone")}
                        >
                            <input value={wineForm.vintageOrNone ?? ""}
                                onChange={(e) => setForm((prev) => ({ ...prev, vintageOrNone: e.target.value }))}
                                disabled={readOnly} />
                        </Field>
                        <Field label={t("fields.color")} required hint={t("hints.color")}>
                            <select
                                value={wineForm.color ?? "red"}
                                onChange={(e) => setForm((prev) => ({ ...prev, color: e.target.value as any }))}
                                disabled={readOnly}
                            >
                                <option value="red">{t("fields.wineColors.red")}</option>
                                <option value="white">{t("fields.wineColors.white")}</option>
                                <option value="rose">{t("fields.wineColors.rose")}</option>
                                <option value="orange">{t("fields.wineColors.orange")}</option>
                                <option value="yellow">{t("fields.wineColors.yellow")}</option>
                            </select>
                        </Field>
                    </div>
                );
            }
        }
    }, [form, t, handleAutoSearch, readOnly]);


    const renderTagInput = () => (
        <input
            value={(form.tags ?? []).join(", ")}
            onChange={(e) =>
                setForm((prev) => ({
                    ...prev,
                    tags: e.target.value
                        .split(",")
                        .map((tag) => tag.trim())
                        .filter(Boolean)
                }))
            }
            placeholder={t("fields.tagsPlaceholder")}
            disabled={readOnly}
        />
    );

    const renderFillLevelSelect = () => (
        <select
            aria-label={t("fields.fillLevel")}
            value={form.fillLevel ?? ""}
            onChange={(e) => setForm((prev) => ({ ...prev, fillLevel: (e.target.value || undefined) as BottleInput["fillLevel"] }))}
            disabled={readOnly}
        >
            <option value="">--</option>
            <option value="full">{t("levels.full")}</option>
            <option value="threeQuarters">{t("levels.threeQuarters")}</option>
            <option value="half">{t("levels.half")}</option>
            <option value="low">{t("levels.low")}</option>
            <option value="empty">{t("levels.empty")}</option>
        </select>
    );

    const optionalFields = useMemo(() => {
        switch (form.category) {
            case "sparkling": {
                const sparklingForm = form as SparklingInput;
                return (
                    <div className="grid">
                        <Field label={t("fields.style")} hint={t("hints.style")}>
                            <input value={sparklingForm.style ?? ""} onChange={(e) => setForm((prev) => ({ ...prev, style: e.target.value }))} disabled={readOnly} />
                        </Field>
                        <Field label={t("fields.dosage")} hint={t("hints.dosage")}>
                            <input value={sparklingForm.dosage ?? ""} onChange={(e) => setForm((prev) => ({ ...prev, dosage: e.target.value }))} disabled={readOnly} />
                        </Field>
                        <Field label={t("fields.disgorgement")} hint={t("hints.disgorgement")}>
                            <input value={sparklingForm.disgorgement ?? ""} onChange={(e) => setForm((prev) => ({ ...prev, disgorgement: e.target.value }))} disabled={readOnly} />
                        </Field>
                        <Field label={t("fields.pressure")} hint={t("hints.pressure")}>
                            <input value={sparklingForm.pressure ?? ""} onChange={(e) => setForm((prev) => ({ ...prev, pressure: e.target.value }))} disabled={readOnly} />
                        </Field>
                        <Field label={t("fields.baseWine")} hint={t("hints.baseWine")}>
                            <input value={sparklingForm.baseWine ?? ""} onChange={(e) => setForm((prev) => ({ ...prev, baseWine: e.target.value }))} disabled={readOnly} />
                        </Field>
                        <Field label={t("fields.servingTemp")} hint={t("hints.servingTemp")}>
                            <input value={sparklingForm.servingTemp ?? ""} onChange={(e) => setForm((prev) => ({ ...prev, servingTemp: e.target.value }))} disabled={readOnly} />
                        </Field>
                        <Field label={t("fields.bottlingDate")} hint={t("hints.bottlingDate")}>
                            <input value={sparklingForm.bottlingDate ?? ""} onChange={(e) => setForm((prev) => ({ ...prev, bottlingDate: e.target.value }))} disabled={readOnly} />
                        </Field>
                        <Field label={t("fields.baseYear")} hint={t("hints.baseYear")}>
                            <input
                                type="number"
                                min={1900}
                                max={2100}
                                value={sparklingForm.baseYear ?? ""}
                                onChange={(e) => setForm((prev) => ({ ...prev, baseYear: e.target.value ? Number(e.target.value) : undefined }))}
                                disabled={readOnly}
                            />
                        </Field>
                    </div>
                );
            }
            case "spirit": {
                const spiritForm = form as SpiritInput;
                return (
                    <div className="grid">
                        <Field label={t("fields.ageStatement")} hint={t("hints.ageStatement")}>
                            <input value={spiritForm.ageStatement ?? ""} onChange={(e) => setForm((prev) => ({ ...prev, ageStatement: e.target.value }))} disabled={readOnly} />
                        </Field>
                        <Field label={t("fields.caskType")} hint={t("hints.caskType")}>
                            <input value={spiritForm.caskType ?? ""} onChange={(e) => setForm((prev) => ({ ...prev, caskType: e.target.value }))} disabled={readOnly} />
                        </Field>
                        <Field label={t("fields.batch")} hint={t("hints.batch")}>
                            <input value={spiritForm.batch ?? ""} onChange={(e) => setForm((prev) => ({ ...prev, batch: e.target.value }))} disabled={readOnly} />
                        </Field>
                        <Field label={t("fields.additiveNote")} hint={t("hints.additiveNote")}>
                            <input value={spiritForm.additiveNote ?? ""} onChange={(e) => setForm((prev) => ({ ...prev, additiveNote: e.target.value }))} disabled={readOnly} />
                        </Field>
                        <Field label={t("fields.angelShare")} hint={t("hints.angelShare")}>
                            <input value={spiritForm.angelShare ?? ""} onChange={(e) => setForm((prev) => ({ ...prev, angelShare: e.target.value }))} disabled={readOnly} />
                        </Field>
                        <Field label={t("fields.aromaProfile")} hint={t("hints.aromaProfile")}>
                            <input value={spiritForm.aromaProfile ?? ""} onChange={(e) => setForm((prev) => ({ ...prev, aromaProfile: e.target.value }))} disabled={readOnly} />
                        </Field>
                    </div>
                );
            }
            case "cigar": {
                const cigarForm = form as CigarInput;
                return (
                    <div className="grid">
                        <Field label={t("fields.wrapper")} hint={t("hints.wrapper")}>
                            <input value={cigarForm.wrapper ?? ""} onChange={(e) => setForm((prev) => ({ ...prev, wrapper: e.target.value }))} disabled={readOnly} />
                        </Field>
                        <Field label={t("fields.binder")} hint={t("hints.binder")}>
                            <input value={cigarForm.binder ?? ""} onChange={(e) => setForm((prev) => ({ ...prev, binder: e.target.value }))} disabled={readOnly} />
                        </Field>
                        <Field label={t("fields.filler")} hint={t("hints.filler")}>
                            <input value={cigarForm.filler ?? ""} onChange={(e) => setForm((prev) => ({ ...prev, filler: e.target.value }))} disabled={readOnly} />
                        </Field>
                        <Field label={t("fields.factoryCode")} hint={t("hints.factoryCode")}>
                            <input value={cigarForm.factoryCode ?? ""} onChange={(e) => setForm((prev) => ({ ...prev, factoryCode: e.target.value }))} disabled={readOnly} />
                        </Field>
                        <Field label={t("fields.targetHumidity")} hint={t("hints.targetHumidity")}>
                            <input value={cigarForm.targetHumidity ?? ""} onChange={(e) => setForm((prev) => ({ ...prev, targetHumidity: e.target.value }))} disabled={readOnly} />
                        </Field>
                        <Field label={t("fields.humidifier")} hint={t("hints.humidifier")}>
                            <input value={cigarForm.humidifier ?? ""} onChange={(e) => setForm((prev) => ({ ...prev, humidifier: e.target.value }))} disabled={readOnly} />
                        </Field>
                        <Field label={t("fields.manufactureYear")} hint={t("hints.manufactureYear")}>
                            <input
                                type="number"
                                min={1900}
                                max={2100}
                                value={cigarForm.manufactureYear ?? ""}
                                onChange={(e) => setForm((prev) => ({ ...prev, manufactureYear: e.target.value ? Number(e.target.value) : undefined }))}
                                disabled={readOnly}
                            />
                        </Field>
                    </div>
                );
            }
            case "wine":
            default: {
                const wineForm = form as WineInput;
                return (
                    <div className="grid">
                        <Field label={t("fields.appellation")} hint={t("hints.appellation")}>
                            <input value={wineForm.appellation ?? ""} onChange={(e) => setForm((prev) => ({ ...prev, appellation: e.target.value }))} disabled={readOnly} />
                        </Field>
                        <Field label={t("fields.grapes")} hint={t("hints.grapes")}>
                            <input value={wineForm.grapes ?? ""} onChange={(e) => setForm((prev) => ({ ...prev, grapes: e.target.value }))} disabled={readOnly} />
                        </Field>
                        <Field label={t("fields.abv")} hint={t("hints.abv")}
                        >
                            <input
                                type="number"
                                min={0}
                                max={20}
                                step={0.1}
                                value={wineForm.abv ?? ""}
                                onChange={(e) =>
                                    setForm((prev) => ({ ...prev, abv: e.target.value ? Number(e.target.value) : undefined }))
                                }
                                disabled={readOnly}
                            />
                        </Field>
                        <Field label={t("fields.format")} hint={t("hints.formatBottle")}
                        >
                            <input value={wineForm.format ?? ""} onChange={(e) => setForm((prev) => ({ ...prev, format: e.target.value }))} disabled={readOnly} />
                        </Field>
                        <Field label={t("fields.servingTemp")} hint={t("hints.servingTemp")}
                        >
                            <input value={wineForm.servingTemp ?? ""} onChange={(e) => setForm((prev) => ({ ...prev, servingTemp: e.target.value }))} disabled={readOnly} />
                        </Field>
                        <Field label={t("fields.lotNumber")} hint={t("hints.lotNumber")}
                        >
                            <input value={wineForm.lotNumber ?? ""} onChange={(e) => setForm((prev) => ({ ...prev, lotNumber: e.target.value }))} disabled={readOnly} />
                        </Field>
                        <Field label={t("fields.carafing")} hint={t("hints.carafing")}
                        >
                            <input value={wineForm.carafing ?? ""} onChange={(e) => setForm((prev) => ({ ...prev, carafing: e.target.value }))} disabled={readOnly} />
                        </Field>
                        <Field label={t("fields.requiresAeration")} hint={t("hints.requiresAeration")}
                        >
                            <label className="toggle">
                                <input
                                    type="checkbox"
                                    checked={wineForm.requiresAeration ?? false}
                                    aria-label={t("fields.requiresAeration")}
                                    onChange={(e) => setForm((prev) => ({ ...prev, requiresAeration: e.target.checked }))}
                                    disabled={readOnly}
                                />
                            </label>
                        </Field>
                    </div>
                );
            }
        }
    }, [form, t]);

    const renderCommonOptionalFields = () => (
        <div className="grid">
            <Field label={t("fields.tags")} hint={t("hints.tags")}>
                {renderTagInput()}
            </Field>
            <div className="field">
                <span className="field__label">{t("fields.photo")}</span>
                <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
                    <ImageUpload
                        value={form.photoUrl ?? null}
                        onChange={(val) => setForm(prev => ({ ...prev, photoUrl: val ?? "" }))}
                        shape="square"
                    />
                    {!readOnly && (
                        <button
                            type="button"
                            className="ghost small"
                            onClick={handleAutoSearch}
                            disabled={isSearchingImage}
                        >
                            {isSearchingImage ? t("actions.searching") || "..." : t("actions.searchVisual") || "🔍 Auto search"}
                        </button>
                    )}
                </div>
            </div>
            <Field label={t("fields.estimatedValue")} hint={t("hints.estimatedValue")}>

                <input
                    type="number"
                    min={0}
                    step={1}
                    value={form.estimatedValue ?? ""}
                    onChange={(e) => setForm((prev) => ({ ...prev, estimatedValue: e.target.value ? Number(e.target.value) : undefined }))}
                    disabled={readOnly}
                />
            </Field>
            <Field label={t("fields.purchasePrice")} hint={t("hints.purchasePrice")}>
                <input
                    type="number"
                    min={0}
                    step={1}
                    value={form.purchasePrice ?? ""}
                    onChange={(e) => setForm((prev) => ({ ...prev, purchasePrice: e.target.value ? Number(e.target.value) : undefined }))}
                    disabled={readOnly}
                />
            </Field>
            <Field label={t("fields.purchasePlace")} hint={t("hints.purchasePlace")}>
                <input
                    value={form.purchasePlace ?? ""}
                    onChange={(e) => setForm((prev) => ({ ...prev, purchasePlace: e.target.value }))}
                    disabled={readOnly}
                />
            </Field>
            <Field label={t("fields.tastingNote")} hint={t("hints.tastingNote")}>
                <textarea
                    value={form.tastingNote ?? ""}
                    onChange={(e) => setForm((prev) => ({ ...prev, tastingNote: e.target.value }))}
                    rows={3}
                    disabled={readOnly}
                />
            </Field>
            <Field label={t("fields.fillLevel")} hint={t("hints.fillLevel")}>{renderFillLevelSelect()}</Field>
            <Field label={t("fields.isOpened")} hint={t("hints.isOpened")}>
                <label className="toggle">
                    <input
                        type="checkbox"
                        checked={form.isOpened ?? false}
                        aria-label={t("fields.isOpened")}
                        onChange={(e) => {
                            const isOpened = e.target.checked;
                            setForm((prev) => ({ ...prev, isOpened }));
                            if (isOpened && initialData?.id) {
                                setShowReminder(true);
                            }
                        }}
                        disabled={readOnly}
                    />
                    <span>{form.isOpened ? t("list.opened") : t("list.closed")}</span>
                </label>
            </Field>
            <Field label={t("fields.peakFrom")} hint={t("hints.peakFrom")}>
                <input
                    type="number"
                    min={1900}
                    max={2100}
                    value={form.peakMaturity?.from ?? ""}
                    onChange={(e) =>
                        setForm((prev) => {
                            const newFrom = e.target.value ? Number(e.target.value) : undefined;
                            let newTo = prev.peakMaturity?.to;
                            // Auto-adjust 'to' if 'from' is after it
                            if (newFrom && newTo && newFrom > newTo) {
                                newTo = newFrom;
                            }
                            return {
                                ...prev,
                                peakMaturity: { ...prev.peakMaturity, from: newFrom, to: newTo }
                            };
                        })
                    }
                    disabled={readOnly}
                />
            </Field>
            <Field label={t("fields.peakTo")} hint={t("hints.peakTo")}>
                <input
                    type="number"
                    min={1900}
                    max={2100}
                    value={form.peakMaturity?.to ?? ""}
                    onChange={(e) =>
                        setForm((prev) => {
                            const newTo = e.target.value ? Number(e.target.value) : undefined;
                            let newFrom = prev.peakMaturity?.from;
                            // Auto-adjust 'from' if 'to' is before it
                            if (newTo && newFrom && newTo < newFrom) {
                                newFrom = newTo;
                            }
                            return {
                                ...prev,
                                peakMaturity: { ...prev.peakMaturity, from: newFrom, to: newTo }
                            }
                        })
                    }
                    disabled={readOnly}
                />
            </Field>
            <Field label={t("fields.alertStatus")} hint={t("hints.alertStatus")}>
                <select
                    value={form.alertStatus ?? "none"}
                    onChange={(e) => setForm((prev) => ({ ...prev, alertStatus: e.target.value as BottleInput["alertStatus"] }))}
                    disabled={readOnly}
                >
                    <option value="none">{t("alerts.none")}</option>
                    <option value="approaching">{t("alerts.approaching")}</option>
                    <option value="critical">{t("alerts.critical")}</option>
                </select>
            </Field>
        </div>
    );

    const renderPreviewCard = () => (
        <article className="card card--muted" aria-label={t("preview.title")}>
            <div className="card__header">
                <div>
                    <p className="eyebrow">{t(`categories.${form.category}`)}</p>
                    <h3>{form.label || t("preview.placeholder")}</h3>
                </div>
                <div className="pills">
                    {form.isOpened ? <span className="pill info">{t("list.opened")}</span> : null}
                    {form.fillLevel ? <span className="pill">{t(`levels.${form.fillLevel}`)}</span> : null}
                    {form.alertStatus && form.alertStatus !== "none" ? (
                        <span className="pill danger">{t(`alerts.${form.alertStatus}`)}</span>
                    ) : null}
                </div>
            </div>
            <div className="card__meta">
                {form.category === "wine" && (
                    <span>{(form as WineInput).producer} • {(form as WineInput).name} • {(form as WineInput).vintageOrNone}</span>
                )}
                {form.category === "sparkling" && (
                    <span>{(form as SparklingInput).house} • {(form as SparklingInput).name} • {(form as SparklingInput).vintageOrNone}</span>
                )}
                {form.category === "spirit" && (
                    <span>{(form as SpiritInput).distillery} • {(form as SpiritInput).nameEdition} • {(form as SpiritInput).abv ?? 0}%</span>
                )}
                {form.category === "cigar" && (() => {
                    const cigarInput = form as CigarInput;
                    const parts = [] as string[];
                    if (cigarInput.brand) parts.push(cigarInput.brand);
                    if (cigarInput.format) parts.push(cigarInput.format);
                    if (cigarInput.quantity && (cigarInput.brand || cigarInput.format)) {
                        parts.push(String(cigarInput.quantity));
                    }
                    return parts.length > 0 ? <span>{parts.join(" • ")}</span> : null;
                })()}
                {form.estimatedValue !== undefined && <span>{t("list.value")}: €{form.estimatedValue}</span>}
                {form.purchasePrice !== undefined && <span>{t("list.purchasePrice")}: €{form.purchasePrice}</span>}
                {form.location && <span>{t("list.location")}: {form.location}</span>}
                {form.collection && <span>{t("list.collection")}: {form.collection}</span>}
                {form.tags && form.tags.length > 0 && <span>{t("list.tags")}: {form.tags.join(", ")}</span>}
                {form.tastingNote && <span>{t("list.tastingNote")}: {form.tastingNote}</span>}
            </div>
        </article>
    );

    return (
        <section className="panel">
            <header className="panel__header">
                <h2>{t("sections.common")}</h2>
                <div className="actions-inline">
                    <button type="button" className="ghost" onClick={onCancel}>
                        {readOnly ? t("actions.cancel") : (initialData ? t("actions.cancelEdit") : t("actions.reset"))}
                    </button>
                </div>
            </header>

            <form className="form" onSubmit={handleSubmit}>
                <div className="section">
                    <div className="section__title">{t("sections.common")}</div>
                    <p className="section__hint">{t("sections.requiredHint")}</p>
                    <div className="grid">
                        <Field label={t("fields.label")} required hint={t("hints.label")}
                        >
                            <input value={form.label ?? ""} onChange={(e) => setForm((prev) => ({ ...prev, label: e.target.value }))} disabled={readOnly} />
                        </Field>
                        <Field label="Quantity" required>
                            <div style={{ display: "flex", alignItems: "center" }}>
                                <button type="button" onClick={() => setForm((prev) => ({ ...prev, quantity: Math.max(1, (prev.quantity ?? 1) - 1) }))} disabled={readOnly}>-</button>
                                <input
                                    type="number"
                                    min={1}
                                    value={form.quantity ?? 1}
                                    onChange={(e) => setForm((prev) => ({ ...prev, quantity: Math.max(1, Number(e.target.value) || 1) }))}
                                    style={{ width: "60px", textAlign: "center", margin: "0 8px" }}
                                    disabled={readOnly}
                                />
                                <button type="button" onClick={() => setForm((prev) => ({ ...prev, quantity: (prev.quantity ?? 1) + 1 }))} disabled={readOnly}>+</button>
                            </div>
                        </Field>
                        <Field label={t("fields.category")} required hint={t("hints.category")}
                        >
                            <select
                                value={form.category}
                                onChange={(e) => handleCategoryChange(e.target.value as BottleCategory)}
                                disabled={readOnly || !!fixedCategory}
                            >
                                <option value="wine">{t("categories.wine")}</option>
                                <option value="sparkling">{t("categories.sparkling")}</option>
                                <option value="spirit">{t("categories.spirit")}</option>
                                <option value="cigar">{t("categories.cigar")}</option>
                            </select>
                        </Field>
                        <Field label={t("fields.cellarId")} required hint={t("hints.cellarId")}>
                            <select
                                value={form.cellarId}
                                onChange={(e) => setForm((prev) => ({ ...prev, cellarId: e.target.value } as BottleInput))}
                                disabled={readOnly || cellars.length <= 1}
                            >
                                {cellars.length === 0 && <option value="">--</option>}
                                {cellars.map((cellar) => (
                                    <option key={cellar.id} value={cellar.id}>
                                        {cellar.name}
                                    </option>
                                ))}
                            </select>
                        </Field>
                        <Field label={t("fields.location")} hint={t("hints.location")}
                        >
                            <input value={form.location ?? ""} onChange={(e) => setForm((prev) => ({ ...prev, location: e.target.value }))} disabled={readOnly} />
                        </Field>
                        <Field label={t("fields.collection")} hint={t("hints.collection")}
                        >
                            <input value={form.collection ?? ""} onChange={(e) => setForm((prev) => ({ ...prev, collection: e.target.value }))} disabled={readOnly} />
                        </Field>
                    </div>
                </div>

                <div className="section">
                    <div className="section__title">{t("sections.category")}</div>
                    {essentials}
                </div>

                <div className="section optional">
                    <div className="section__title with-toggle">
                        <span>{t("sections.optional")}</span>
                        <button
                            type="button"
                            className="ghost"
                            aria-expanded={showOptionals}
                            aria-controls="optional-fields"
                            onClick={() => setShowOptionals((prev) => !prev)}
                        >
                            {showOptionals ? t("optionals.hide") : t("optionals.show")}
                        </button>
                    </div>
                    {showOptionals && (
                        <div id="optional-fields">
                            <p className="section__hint">{t("sections.common")}</p>
                            {renderCommonOptionalFields()}
                            <p className="section__hint">{t("sections.category")}</p>
                            {optionalFields}
                        </div>
                    )}
                </div>

                <div className="form__actions">
                    {!readOnly && (
                        <button type="submit" className="primary">
                            {initialData ? t("actions.update") : t("actions.save")}
                        </button>
                    )}
                    {(initialData || readOnly) && (
                        <button type="button" className="ghost" onClick={onCancel}>
                            {readOnly ? t("actions.cancel") : t("actions.cancelEdit")}
                        </button>
                    )}
                </div>

                <div className="section">
                    <div className="section__title">{t("preview.title")}</div>
                    {renderPreviewCard()}
                </div>

                {initialData?.id && (
                    <OpenedBottleReminder
                        open={showReminder}
                        onClose={() => setShowReminder(false)}
                        bottle={{
                            id: initialData.id,
                            label: form.label,
                            category: form.category
                        }}
                    />
                )}
            </form>
        </section>
    );
}
