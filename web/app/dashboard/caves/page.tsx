import { Metadata } from "next";
import { CaveList } from "@/components/caves/CaveList";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Caves | Glou",
};

export default function CavesPage() {
  const locale = "en" as "en" | "fr";

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold text-white">
          {locale === "fr" ? "Mes caves" : "My Caves"}
        </h1>
        <Link
          href="/dashboard/caves/new"
          className="px-4 py-2 bg-yellow-600 hover:bg-yellow-700 text-white font-medium rounded transition-colors"
        >
          {locale === "fr" ? "+ Nouvelle cave" : "+ New Cave"}
        </Link>
      </div>

      <CaveList locale={locale} />
    </div>
  );
}
