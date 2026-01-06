import { Metadata } from "next";
import { CellarDetails } from "@/components/cellars/CellarDetails";

export const metadata: Metadata = {
  title: "Cellar Details | Glou",
};

interface CellarPageProps {
  params: Promise<{
    caveId: string;
  }>;
}

export default async function CellarPage({ params }: CellarPageProps) {
  const { caveId: cellarId } = await params;

  return (
    <div className="space-y-6">
      <CellarDetails cellarId={cellarId} />
    </div>
  );
}
