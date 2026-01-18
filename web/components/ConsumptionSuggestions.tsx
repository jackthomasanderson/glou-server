"use client";

import { useState } from "react";
import { useTranslations } from "../lib/i18n/I18nProvider";
import {
  useConsumptionSuggestions,
  useMarkConsumed,
  useSkipBottle,
  useActiveObjective,
} from "../lib/api/consumption";
import {
  Paper,
  Box,
  Typography,
  List,
  ListItem,
  ListItemText,
  ListItemAvatar,
  Avatar,
  Chip,
  CircularProgress,
  Alert,
  Button,
  Stack,
  IconButton,
  Tooltip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  LinearProgress,
  alpha,
  useTheme,
} from "@mui/material";
import {
  AutoAwesome as SuggestionIcon,
  CheckCircle as ConsumeIcon,
  SkipNext as SkipIcon,
  LocalBar as BottleIcon,
} from "@mui/icons-material";

export function ConsumptionSuggestions() {
  const { t } = useTranslations();
  const theme = useTheme();
  const { data, isLoading, error } = useConsumptionSuggestions({ limit: 10 });
  const { data: objective } = useActiveObjective();
  const markConsumed = useMarkConsumed();
  const skipBottle = useSkipBottle();

  const [consumeDialogOpen, setConsumeDialogOpen] = useState(false);
  const [skipDialogOpen, setSkipDialogOpen] = useState(false);
  const [selectedBottleId, setSelectedBottleId] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [skipReason, setSkipReason] = useState("");

  const handleConsumeClick = (bottleId: string) => {
    setSelectedBottleId(bottleId);
    setConsumeDialogOpen(true);
  };

  const handleSkipClick = (bottleId: string) => {
    setSelectedBottleId(bottleId);
    setSkipDialogOpen(true);
  };

  const handleConfirmConsume = async () => {
    if (!selectedBottleId) return;
    await markConsumed.mutateAsync({
      bottleId: selectedBottleId,
      notes: notes || undefined,
    });
    setConsumeDialogOpen(false);
    setNotes("");
    setSelectedBottleId(null);
  };

  const handleConfirmSkip = async () => {
    if (!selectedBottleId) return;
    await skipBottle.mutateAsync({
      bottleId: selectedBottleId,
      reason: skipReason || undefined,
    });
    setSkipDialogOpen(false);
    setSkipReason("");
    setSelectedBottleId(null);
  };

  if (isLoading) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", p: 4 }}>
        <CircularProgress size={32} />
      </Box>
    );
  }

  if (error) {
    return (
      <Alert severity="error" sx={{ mt: 3 }}>
        {t("error")}
      </Alert>
    );
  }

  const hasData = data && data.length > 0;

  return (
    <>
      <Paper sx={{ p: 3, borderRadius: 3, mt: 3 }}>
        <Box sx={{ mb: 2 }}>
          <Typography
            variant="caption"
            sx={{
              color: "primary.main",
              fontWeight: 800,
              textTransform: "uppercase",
              letterSpacing: "0.1em",
            }}
          >
            {t("app.suggestions")}
          </Typography>
          <Typography variant="h6" sx={{ fontWeight: 700 }}>
            {t("consumption.suggestion.title")}
          </Typography>

          {objective && (
            <Box sx={{ mt: 2, p: 2, bgcolor: alpha(theme.palette.primary.main, 0.05), borderRadius: 2 }}>
              <Typography variant="caption" color="text.secondary">
                {t("consumption.objective.current")}:
              </Typography>
              <Typography variant="body2" fontWeight={600}>
                {objective.targetCount} {t("stats.totalBottles")} / {t(`consumption.objective.${objective.period}`)}
              </Typography>
            </Box>
          )}
        </Box>

        {!hasData ? (
          <Typography variant="body2" sx={{ color: "text.secondary", py: 2 }}>
            {t("consumption.suggestion.none")}
          </Typography>
        ) : (
          <List disablePadding>
            {data.map((suggestion) => (
              <ListItem
                key={suggestion.bottleId}
                sx={{
                  px: 2,
                  py: 1.5,
                  mb: 1,
                  bgcolor: "background.default",
                  borderRadius: 2,
                  border: "1px solid",
                  borderColor:
                    suggestion.priority === "high"
                      ? "error.light"
                      : suggestion.priority === "medium"
                        ? "warning.light"
                        : "divider",
                  borderLeft: `4px solid`,
                  borderLeftColor:
                    suggestion.priority === "high"
                      ? "error.main"
                      : suggestion.priority === "medium"
                        ? "warning.main"
                        : "primary.main",
                  transition: "transform 0.2s",
                  "&:hover": {
                    transform: "translateX(4px)",
                    borderColor: "primary.main",
                  },
                }}
              >
                <ListItemAvatar>
                  <Avatar
                    src={suggestion.bottle.photoUrl}
                    sx={{
                      bgcolor: "primary.main",
                      width: 56,
                      height: 56,
                    }}
                  >
                    <BottleIcon />
                  </Avatar>
                </ListItemAvatar>
                <ListItemText
                  primaryTypographyProps={{ component: "div" }}
                  secondaryTypographyProps={{ component: "div" }}
                  primary={
                    <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 0.5 }}>
                      <Typography variant="subtitle1" fontWeight={700}>
                        {suggestion.bottle.label}
                      </Typography>
                      <Chip
                        label={`${suggestion.score}%`}
                        size="small"
                        color={
                          suggestion.priority === "high"
                            ? "error"
                            : suggestion.priority === "medium"
                              ? "warning"
                              : "primary"
                        }
                        sx={{ fontWeight: 700, ml: "auto" }}
                      />
                    </Box>
                  }
                  secondary={
                    <Box>
                      <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
                        {suggestion.bottle.category} • {suggestion.bottle.vintageOrNone || "NV"}
                      </Typography>
                      <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5 }}>
                        {suggestion.reasons.slice(0, 3).map((reason, idx) => (
                          <Chip
                            key={idx}
                            label={t(reason)}
                            size="small"
                            variant="outlined"
                            sx={{ height: 22, fontSize: "0.7rem" }}
                          />
                        ))}
                      </Box>
                      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ mt: 2 }}>
                        <Button
                          size="small"
                          variant="contained"
                          startIcon={<ConsumeIcon />}
                          onClick={() => handleConsumeClick(suggestion.bottleId)}
                          sx={{ flex: 1 }}
                        >
                          {t("consumption.actions.markConsumed")}
                        </Button>
                        <Button
                          size="small"
                          variant="outlined"
                          startIcon={<SkipIcon />}
                          onClick={() => handleSkipClick(suggestion.bottleId)}
                          sx={{ flex: 1 }}
                        >
                          {t("consumption.actions.skip")}
                        </Button>
                      </Stack>
                    </Box>
                  }
                />
              </ListItem>
            ))}
          </List>
        )}
      </Paper>

      {/* Consume Dialog */}
      <Dialog open={consumeDialogOpen} onClose={() => setConsumeDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{t("consumption.actions.markConsumed")}</DialogTitle>
        <DialogContent>
          <TextField
            label={t("consumption.history.notes")}
            multiline
            rows={3}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            fullWidth
            sx={{ mt: 2 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConsumeDialogOpen(false)}>{t("actions.cancel")}</Button>
          <Button variant="contained" onClick={handleConfirmConsume} disabled={markConsumed.isPending}>
            {t("actions.save")}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Skip Dialog */}
      <Dialog open={skipDialogOpen} onClose={() => setSkipDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{t("consumption.actions.skip")}</DialogTitle>
        <DialogContent>
          <TextField
            label={t("consumption.actions.skipReason")}
            multiline
            rows={2}
            value={skipReason}
            onChange={(e) => setSkipReason(e.target.value)}
            fullWidth
            sx={{ mt: 2 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSkipDialogOpen(false)}>{t("actions.cancel")}</Button>
          <Button variant="contained" onClick={handleConfirmSkip} disabled={skipBottle.isPending}>
            {t("actions.save")}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
