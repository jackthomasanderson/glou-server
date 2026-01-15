"use client";

import React, { memo } from "react";
import { BottleToFoodPairing } from "./BottleToFoodPairing";
import { type BottleRecord } from "../lib/bottles/schema";
import { useTranslations } from "../lib/i18n/I18nProvider";

type BottleListProps = {
    bottles: BottleRecord[];
    isLoading: boolean;
    onEdit: (bottle: BottleRecord) => void;
    onDelete: (id: string) => void;
};

function BottleListComponent({ bottles, isLoading, onEdit, onDelete }: BottleListProps) {
    const { t } = useTranslations();



    if (isLoading) {
        return (
            <div className="empty">
                <div className="skeleton" style={{ width: "100%", height: "120px" }} />
                <div className="skeleton" style={{ width: "100%", height: "120px" }} />
            </div>
        );
    }

    if (bottles.length === 0) {
        return (
            <div className="empty">
                <svg className="empty__icon" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M24 8h16v8h-16V8zM20 16h24v40c0 2.2-1.8 4-4 4H24c-2.2 0-4-1.8-4-4V16z" stroke="currentColor" strokeWidth="1.5" fill="none" />
                    <line x1="28" y1="24" x2="28" y2="48" stroke="currentColor" strokeWidth="1.5" />
                    <line x1="32" y1="24" x2="32" y2="48" stroke="currentColor" strokeWidth="1.5" />
                    <line x1="36" y1="24" x2="36" y2="48" stroke="currentColor" strokeWidth="1.5" />
                </svg>
                <p>{t("list.empty")}</p>
            </div>
        );
    }

    return (
        <div className="cards">
            {bottles.map((bottle) => (
                <article key={bottle.id} className="card">
                    <div className="card__header">
                        <div>
                            <p className="eyebrow">{t(`categories.${bottle.category}`)}</p>
                            <h3>{bottle.label}</h3>
                        </div>
                        <div className="pills">
                            {bottle.quantity && bottle.quantity > 1 ? (
                                <span className="pill success">Quantité: {bottle.quantity}</span>
                            ) : null}
                            {bottle.isOpened ? <span className="pill info">{t("list.opened")}</span> : null}
                            {bottle.fillLevel ? <span className="pill">{t(`levels.${bottle.fillLevel}`)}</span> : null}
                            {bottle.alertStatus && bottle.alertStatus !== "none" ? (
                                <span className="pill danger">{t(`alerts.${bottle.alertStatus}`)}</span>
                            ) : null}
                        </div>
                    </div>

                    <div className="card__meta">
                        {bottle.estimatedValue !== undefined && (
                            <span>{t("list.value")}: €{bottle.estimatedValue}</span>
                        )}
                        {bottle.purchasePrice !== undefined && (
                            <span>{t("list.purchasePrice")}: €{bottle.purchasePrice}</span>
                        )}
                        {bottle.purchasePlace && <span>{t("list.purchasePlace")}: {bottle.purchasePlace}</span>}
                        {bottle.peakMaturity && (bottle.peakMaturity.from || bottle.peakMaturity.to) && (
                            <span>
                                {t("list.peak")}: {bottle.peakMaturity.from ?? "?"} – {bottle.peakMaturity.to ?? "?"}
                            </span>
                        )}
                        {bottle.location && <span>{t("list.location")}: {bottle.location}</span>}
                        {bottle.collection && <span>{t("list.collection")}: {bottle.collection}</span>}
                        {bottle.tags && bottle.tags.length > 0 && <span>{t("list.tags")}: {bottle.tags.join(", ")}</span>}
                        {bottle.tastingNote && <span>{t("list.tastingNote")}: {bottle.tastingNote}</span>}
                    </div>

                    {/* AI food pairing button and result */}
                    <div style={{ margin: "0.5em 0" }}>
                        <BottleToFoodPairing bottle={{ name: bottle.label, description: bottle.tastingNote }} />
                    </div>

                    <div className="card__actions">
                        <button type="button" onClick={() => onEdit(bottle)}>{t("actions.edit")}</button>
                        <button type="button" className="ghost" onClick={() => onDelete(bottle.id)}>
                            {t("actions.delete")}
                        </button>
                    </div>

                    {bottle.id.startsWith("temp-") && <p className="muted">{t("list.optimistic")}</p>}
                </article>
            ))}
        </div>
    );
}

export const BottleList = memo(BottleListComponent);
