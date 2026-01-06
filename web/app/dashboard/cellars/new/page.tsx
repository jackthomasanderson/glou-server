import { Metadata } from "next";
import { CellarForm } from "@/components/cellars/CellarForm";

export const metadata: Metadata = {
  title: "New Cellar | Glou",
};

export default function NewCellarPage() {
  return (
    <div className="space-y-6">
      <CellarForm />
    </div>
  );
}
