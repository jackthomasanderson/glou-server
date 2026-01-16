import { useEffect, useState } from "react";
import { fetchWithAuth } from "../api/fetchWithAuth";

export function useAiApiKeyAvailable() {
  const [available, setAvailable] = useState<boolean | null>(null);

  useEffect(() => {
    fetchWithAuth("/api/admin/ai-api-key")
      .then(res => res.ok ? res.json() : Promise.reject())
      .then(data => setAvailable(!!data.aiApiKey))
      .catch(() => setAvailable(false));
  }, []);

  return available;
}
