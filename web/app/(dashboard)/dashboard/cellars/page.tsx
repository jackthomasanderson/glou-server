import { Metadata } from "next";
import { CellarList } from "@/components/cellars/CellarList";

export const metadata: Metadata = {
  title: "Cellars | Glou",
};

export default function CellarsPage() {
  return (
    <div className="space-y-6">
      <CellarList />
    </div>
  );
}
