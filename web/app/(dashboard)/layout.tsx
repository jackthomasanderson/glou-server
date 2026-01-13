import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import Sidebar from "@/components/Sidebar";
import BottomNav from "@/components/BottomNav";

export default function DashboardGroupLayout({ children }: { children: React.ReactNode }) {
  return (
    <ProtectedRoute>
      <div className="app-shell">
        <Sidebar />
        <main className="app-content">{children}</main>
        <BottomNav />
      </div>
    </ProtectedRoute>
  );
}
