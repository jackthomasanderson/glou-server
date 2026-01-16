import { useState } from "react";
import { useTranslations } from "../lib/i18n/I18nProvider";
import { useAuth } from "../lib/auth/AuthContext";
import { useQuery } from "@tanstack/react-query";
import { fetchAppSettings } from "@/lib/profile/client";
import {
  Paper,
  Box,
  Typography,
  TextField,
  Button,
  CircularProgress,
  Alert,
  alpha,
} from "@mui/material";
import { Restaurant as FoodIcon, AutoAwesome as SparklesIcon } from "@mui/icons-material";

export function FoodToBottlePairing() {
  const { t } = useTranslations();
  const { user } = useAuth();
  const [food, setFood] = useState("");
  const [result, setResult] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: appSettings } = useQuery({
    queryKey: ["app-settings"],
    queryFn: fetchAppSettings,
    staleTime: 30_000,
  });

  const isAIEnabled = !!(user?.aiApiKey || appSettings?.aiApiKey);

  if (!isAIEnabled) {
    return null;
  }

  async function handleSuggest(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/food-pairing/suggest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ prompt: `Je vais manger : ${food}. Quelles bouteilles de mon stock conviendraient le mieux ? Donne la liste triée par adéquation, avec une justification courte pour chaque.` }),
      });
      if (!res.ok) throw new Error("API error");
      const data = await res.json();
      setResult(data.data);
    } catch {
      setError(t("foodPairing.error"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Paper sx={{ p: 3, borderRadius: 3, mb: 3 }}>
      <Box sx={{ mb: 3 }}>
        <Typography variant="caption" sx={{ color: 'primary.main', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
          {t("app.suggestions")}
        </Typography>
        <Typography variant="h6" sx={{ fontWeight: 700 }}>
          {t("foodPairing.title")}
        </Typography>
      </Box>

      <Box component="form" onSubmit={handleSuggest} sx={{ display: 'flex', gap: 2, alignItems: 'flex-start' }}>
        <TextField
          fullWidth
          size="medium"
          label={t("foodPairing.foodPlaceholder")}
          value={food}
          onChange={(e) => setFood(e.target.value)}
          placeholder={t("foodPairing.foodPlaceholder")}
          disabled={loading}
          InputProps={{
            startAdornment: <FoodIcon sx={{ mr: 1, color: 'text.secondary' }} />,
          }}
          sx={{ flex: 1 }}
        />
        <Button
          variant="contained"
          type="submit"
          size="large"
          disabled={loading || !food.trim()}
          startIcon={loading ? <CircularProgress size={20} color="inherit" /> : <SparklesIcon />}
          sx={{ height: 56, px: 4, fontWeight: 700, borderRadius: 2 }}
        >
          {loading ? t("loading") : t("foodPairing.suggest")}
        </Button>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mt: 2 }}>
          {error}
        </Alert>
      )}

      {result && (
        <Paper
          variant="outlined"
          sx={{
            mt: 3,
            p: 2,
            bgcolor: 'action.hover',
            whiteSpace: 'pre-wrap',
            fontSize: '0.9rem',
            lineHeight: 1.6,
            borderColor: alpha('#2563EB', 0.2),
            borderRadius: 2
          }}
        >
          <Typography variant="body2">{result}</Typography>
        </Paper>
      )}
    </Paper>
  );
}
