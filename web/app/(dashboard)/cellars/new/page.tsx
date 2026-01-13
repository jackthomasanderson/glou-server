import { Metadata } from "next";
import { CellarForm } from "@/components/cellars/CellarForm";

export const metadata: Metadata = {
  title: "New Cellar | Glou",
};

export default function NewCellarPage() {
  return <CellarForm />;
}
