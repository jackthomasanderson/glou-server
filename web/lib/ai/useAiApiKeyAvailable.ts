import { useEffect, useState } from "react";


export function useAiApiKeyAvailable() {
  const [available, setAvailable] = useState<boolean | null>(null);

  useEffect(() => {
    fetch("/api/admin/ai-api-key", { credentials: "include" })
      .then(res => res.ok ? res.json() : Promise.reject())
      .then(data => setAvailable(!!data.aiApiKey))
      .catch(() => setAvailable(false));
  }, []);

  return available;
}
