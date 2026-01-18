"use client";

import React from "react";
import { ToggleButton, ToggleButtonGroup, Tooltip } from "@mui/material";
import { ViewModule as GridIcon, ViewList as ListIcon } from "@mui/icons-material";
import { useTranslations } from "@/lib/i18n/I18nProvider";

export type ViewMode = "grid" | "list";

interface ViewSwitchProps {
    value: ViewMode;
    onChange: (value: ViewMode) => void;
    storageKey?: string;
}

export function ViewSwitch({ value, onChange, storageKey }: ViewSwitchProps) {
    const { t } = useTranslations();

    const handleAlignment = (
        event: React.MouseEvent<HTMLElement>,
        newView: ViewMode | null
    ) => {
        if (newView !== null) {
            onChange(newView);
            if (storageKey) {
                localStorage.setItem(storageKey, newView);
            }
        }
    };

    return (
        <ToggleButtonGroup
            value={value}
            exclusive
            onChange={handleAlignment}
            aria-label="view mode"
            size="small"
            sx={{
                bgcolor: 'background.paper',
                '& .MuiToggleButton-root': {
                    border: '1px solid',
                    borderColor: 'divider',
                    borderRadius: 2,
                    px: 1.5,
                    '&.Mui-selected': {
                        bgcolor: 'primary.light',
                        color: 'primary.contrastText',
                        '&:hover': {
                            bgcolor: 'primary.main',
                        },
                    },
                },
            }}
        >
            <Tooltip title={t("actions.gridView") || "Grid View"}>
                <ToggleButton value="grid" aria-label="grid view">
                    <GridIcon fontSize="small" />
                </ToggleButton>
            </Tooltip>
            <Tooltip title={t("actions.listView") || "List View"}>
                <ToggleButton value="list" aria-label="list view">
                    <ListIcon fontSize="small" />
                </ToggleButton>
            </Tooltip>
        </ToggleButtonGroup>
    );
}
