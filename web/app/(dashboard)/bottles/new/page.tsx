"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "@/lib/i18n/I18nProvider";
import { bottlesClient } from "@/lib/bottles/client";
import { useMutation, useQueryClient } from "@tanstack/react-query";

export default function NewBottlePage() {
  const { t } = useTranslations();
  const router = useRouter();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const createMutation = useMutation({
    mutationFn: (label: string) => bottlesClient.create({ label } as any),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bottles"] });
      queryClient.invalidateQueries({ queryKey: ["cellars"] });
      router.push("/bottles");
    },
    onError: (err: any) => {
      setError(err?.message || "Save failed");
    }
  });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    createMutation.mutate(name);
  }

  return (
    <div style={{ padding: 16 }}>
      <h2>{t("pageTitles.addBottle")}</h2>
      <form onSubmit={handleSubmit}>
        <div>
          <label>{t("fields.label")}</label>
          <input value={name} onChange={(e) => setName(e.target.value)} required className="input" />
        </div>
        {error && <div className="error">{error}</div>}
        <div style={{ marginTop: 12 }}>
          <button type="submit" disabled={createMutation.isPending}>
            {createMutation.isPending ? t("actions.save") : t("actions.save")}
          </button>
        </div>
      </form>
    </div>
  );
}
