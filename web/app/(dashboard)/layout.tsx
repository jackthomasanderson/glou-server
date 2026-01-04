import { ProtectedRoute } from "@/components/auth/ProtectedRoute";

export default function DashboardGroupLayout({ children }: { children: React.ReactNode }) {
  return <ProtectedRoute>{children}</ProtectedRoute>;
}
