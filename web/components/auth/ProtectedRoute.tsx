"use client";

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  // Authentification désactivée pour FEAT-01 - passage direct des children
  return <>{children}</>;

  // Code d'authentification original (désactivé) :
  // const { isAuthenticated, isLoading } = useAuth();
  // const router = useRouter();
  //
  // useEffect(() => {
  //   if (!isLoading && !isAuthenticated) {
  //     router.push("/login");
  //   }
  // }, [isLoading, isAuthenticated, router]);
  //
  // if (isLoading) {
  //   return (
  //     <div className="flex items-center justify-center min-h-screen">
  //       <LoadingWine />
  //     </div>
  //   );
  // }
  //
  // if (!isAuthenticated) {
  //   return null;
  // }
  //
  // return <>{children}</>;
}
