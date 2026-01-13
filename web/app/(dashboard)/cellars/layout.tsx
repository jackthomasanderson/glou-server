import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { AppHeaderClient } from "@/components/AppHeaderClient";
import { LocaleSync } from "@/components/LocaleSync";

export default function CellarsLayout({ children }: { children: React.ReactNode }) {
  return (
    <ProtectedRoute>
      <div className="dashboard">
        <LocaleSync />
        <AppHeaderClient />
        {children}
      </div>
    </ProtectedRoute>
  );
}
