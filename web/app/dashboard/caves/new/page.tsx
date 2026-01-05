import { Metadata } from "next";
import { CaveForm } from "@/components/caves/CaveForm";

export const metadata: Metadata = {
  title: "New Cave | Glou",
};

export default function NewCavePage() {
  const locale = "en" as "en" | "fr";

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold text-white">
        {locale === "fr" ? "Créer une cave" : "Create Cave"}
      </h1>
      <CaveForm locale={locale} />
    </div>
  );
}
