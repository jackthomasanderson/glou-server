import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { DashboardLayoutClient } from "@/components/DashboardLayoutClient";

export default function DashboardGroupLayout({ children }: { children: React.ReactNode }) {
  return (
    <ProtectedRoute>
      <DashboardLayoutClient>{children}</DashboardLayoutClient>
    </ProtectedRoute>
  );
}
