import { Metadata } from "next";
import { CaveDetails } from "@/components/caves/CaveDetails";

export const metadata: Metadata = {
  title: "Cave Details | Glou",
};

interface CavePageProps {
  params: Promise<{
    caveId: string;
  }>;
}

export default async function CavePage({ params }: CavePageProps) {
  const { caveId } = await params;
  const locale = "en" as "en" | "fr";

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold text-white">
        {locale === "fr" ? "Détails de la cave" : "Cave Details"}
      </h1>
      <CaveDetails caveId={caveId} locale={locale} />
    </div>
  );
}
