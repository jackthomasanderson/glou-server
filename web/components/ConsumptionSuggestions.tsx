import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "../lib/i18n/I18nProvider";
import { fetchWithAuth } from "../lib/api/fetchWithAuth";
import {
  Paper,
  Box,
  Typography,
  List,
  ListItem,
  ListItemText,
  Chip,
  CircularProgress,
  Alert,
  useTheme,
  alpha,
} from "@mui/material";
import { AutoAwesome as SuggestionIcon } from "@mui/icons-material";

export function ConsumptionSuggestions() {
  const { t } = useTranslations();
  const theme = useTheme();

  const { data, isLoading, error } = useQuery({
    queryKey: ["consumption-suggestions"],
    queryFn: async () => {
      const res = await fetchWithAuth("/api/consumption-plan/suggestions");
      if (!res.ok) throw new Error("Failed to fetch suggestions");
      return (await res.json()).data as Array<{
        bottleId: string;
        reason: string;
        score: number;
      }>;
    },
  });

  if (isLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
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
    <Paper sx={{ p: 3, borderRadius: 3, mt: 3 }}>
      <Box sx={{ mb: 2 }}>
        <Typography variant="caption" sx={{ color: 'primary.main', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
          {t("app.suggestions")}
        </Typography>
        <Typography variant="h6" sx={{ fontWeight: 700 }}>
          {t("consumption.suggestion.title")}
        </Typography>
      </Box>

      {!hasData ? (
        <Typography variant="body2" sx={{ color: 'text.secondary', py: 2 }}>
          {t("consumption.suggestion.none")}
        </Typography>
      ) : (
        <List disablePadding>
          {data.map((s) => (
            <ListItem
              key={s.bottleId}
              sx={{
                px: 2,
                py: 1.5,
                mb: 1,
                bgcolor: 'background.default',
                borderRadius: 2,
                border: '1px solid',
                borderColor: 'divider',
                display: 'flex',
                justifyContent: 'space-between',
                transition: 'transform 0.2s',
                '&:hover': {
                  transform: 'translateX(4px)',
                  borderColor: 'primary.light',
                }
              }}
            >
              <ListItemText
                primary={t(s.reason.split(",")[0])}
                primaryTypographyProps={{ fontWeight: 600, fontSize: '0.9rem' }}
              />
              <Chip
                label={`${s.score}%`}
                size="small"
                color="primary"
                variant="outlined"
                sx={{ fontWeight: 700, bgcolor: alpha(theme.palette.primary.main, 0.05) }}
              />
            </ListItem>
          ))}
        </List>
      )}
    </Paper>
  );
}
