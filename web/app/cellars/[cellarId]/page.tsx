import { Metadata } from "next";
import { CellarDetails } from "@/components/cellars/CellarDetails";

export const metadata: Metadata = {
  title: "Cellar Details | Glou",
};

interface CellarPageProps {
  params: Promise<{
    cellarId: string;
  }>;
}

export default async function CellarPage({ params }: CellarPageProps) {
  const { cellarId } = await params;

  return <CellarDetails cellarId={cellarId} />;
}
