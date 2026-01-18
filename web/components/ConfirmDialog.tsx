"use client";

import React from "react";
import {
    Dialog,
    DialogTitle,
    DialogContent,
    DialogContentText,
    DialogActions,
    Button,
} from "@mui/material";
import { useTranslations } from "@/lib/i18n/I18nProvider";

interface ConfirmDialogProps {
    open: boolean;
    title: string;
    content: string;
    onConfirm: () => void;
    onCancel: () => void;
    confirmLabel?: string;
    cancelLabel?: string;
    isDanger?: boolean;
}

export function ConfirmDialog({
    open,
    title,
    content,
    onConfirm,
    onCancel,
    confirmLabel,
    cancelLabel,
    isDanger = false,
}: ConfirmDialogProps) {
    const { t } = useTranslations();

    return (
        <Dialog open={open} onClose={onCancel}>
            <DialogTitle>{title}</DialogTitle>
            <DialogContent>
                <DialogContentText>{content}</DialogContentText>
            </DialogContent>
            <DialogActions>
                <Button onClick={onCancel} color="inherit">
                    {cancelLabel || t("actions.cancel")}
                </Button>
                <Button
                    onClick={onConfirm}
                    color={isDanger ? "error" : "primary"}
                    variant="contained"
                    autoFocus
                >
                    {confirmLabel || t("actions.confirm")}
                </Button>
            </DialogActions>
        </Dialog>
    );
}
