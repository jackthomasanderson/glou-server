
import React, { useState, useEffect } from 'react';
import {
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    Button,
    Typography,
    Box,
    Chip,
    TextField,
    Stack
} from '@mui/material';
import { useTranslations } from '../lib/i18n/I18nProvider';
import { useCreateNotification } from '../lib/api/alerts';
import { format, addDays } from 'date-fns';

interface OpenedBottleReminderProps {
    open: boolean;
    onClose: () => void;
    bottle: {
        id: string;
        label: string;
        category: string;
    };
}

export const OpenedBottleReminder: React.FC<OpenedBottleReminderProps> = ({
    open,
    onClose,
    bottle
}) => {
    const { t } = useTranslations();
    const createNotification = useCreateNotification();
    const [selectedDays, setSelectedDays] = useState<number | null>(null);
    const [customDate, setCustomDate] = useState<string>('');

    // Determine default suggestion based on category
    const getSuggestion = (category: string) => {
        const normalized = category.toLowerCase();
        if (normalized.includes('wine') || normalized === 'rouge' || normalized === 'blanc' || normalized === 'rose') return 3;
        if (normalized.includes('sparkling') || normalized === 'effervescent' || normalized === 'champagne') return 1;
        if (normalized.includes('spirit') || normalized === 'spiritueux') return 14;
        return 7; // Default
    };

    useEffect(() => {
        if (open && bottle) {
            const suggested = getSuggestion(bottle.category);
            setSelectedDays(suggested);

            // Set initial custom date
            const date = addDays(new Date(), suggested);
            setCustomDate(format(date, 'yyyy-MM-dd'));
        }
    }, [open, bottle]);

    const handlePresetClick = (days: number) => {
        setSelectedDays(days);
        const date = addDays(new Date(), days);
        setCustomDate(format(date, 'yyyy-MM-dd'));
    };

    const handleConfirm = async () => {
        if (!process.env.NEXT_PUBLIC_API_URL) return; // Safety check

        const targetDate = new Date(customDate);
        const formattedDate = format(targetDate, 'dd/MM/yyyy');

        // Create the notification
        // Note: Ideally this would be a "scheduled" notification, but for now we creating an immediate one
        // acting as a "task" or "reminder" in the list.
        // A true scheduled notification would require backend scheduling.
        // For MVP, we create a notification that says "Consumption goal: [Date]"

        await createNotification.mutateAsync({
            title: `Rappel consommation : ${bottle.label}`,
            message: `Objectif de consommation pour le ${formattedDate}`,
            type: 'reminder',
            data: {
                bottleId: bottle.id,
                targetDate: customDate
            }
        });

        onClose();
    };

    return (
        <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
            <DialogTitle>
                Bouteille entamée
            </DialogTitle>
            <DialogContent>
                <Typography variant="body1" gutterBottom>
                    Vous venez d'ouvrir <strong>{bottle.label}</strong>.
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                    Souhaitez-vous définir un rappel de consommation ?
                </Typography>

                <Typography variant="subtitle2" gutterBottom>
                    Suggestions :
                </Typography>
                <Stack direction="row" spacing={1} sx={{ mb: 3 }}>
                    <Chip
                        label="Demain (+1j)"
                        onClick={() => handlePresetClick(1)}
                        color={selectedDays === 1 ? "primary" : "default"}
                        variant={selectedDays === 1 ? "filled" : "outlined"}
                    />
                    <Chip
                        label="3 jours (+3j)"
                        onClick={() => handlePresetClick(3)}
                        color={selectedDays === 3 ? "primary" : "default"}
                        variant={selectedDays === 3 ? "filled" : "outlined"}
                    />
                    <Chip
                        label="1 semaine (+7j)"
                        onClick={() => handlePresetClick(7)}
                        color={selectedDays === 7 ? "primary" : "default"}
                        variant={selectedDays === 7 ? "filled" : "outlined"}
                    />
                    <Chip
                        label="2 semaines (+14j)"
                        onClick={() => handlePresetClick(14)}
                        color={selectedDays === 14 ? "primary" : "default"}
                        variant={selectedDays === 14 ? "filled" : "outlined"}
                    />
                </Stack>

                <TextField
                    label="Date cible"
                    type="date"
                    fullWidth
                    value={customDate}
                    onChange={(e) => {
                        setCustomDate(e.target.value);
                        setSelectedDays(null);
                    }}
                    InputLabelProps={{
                        shrink: true,
                    }}
                />

            </DialogContent>
            <DialogActions>
                <Button onClick={onClose} color="inherit">
                    Pas de rappel
                </Button>
                <Button onClick={handleConfirm} variant="contained" color="primary">
                    Créer le rappel
                </Button>
            </DialogActions>
        </Dialog>
    );
};
