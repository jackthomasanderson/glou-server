import { AdminAiApiKeyForm } from "../../../components/AdminAiApiKeyForm";
import { useTranslation } from "react-i18next";

export default function AdminAiPage() {
  const { t } = useTranslation();
  return (
    <main style={{ padding: 32 }}>
      <h1>{t("admin.aiApiKey.title")}</h1>
      <p>{t("admin.aiApiKey.intro")}</p>
      <AdminAiApiKeyForm />
    </main>
  );
}
