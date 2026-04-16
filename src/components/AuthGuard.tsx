import { useAuth } from "@/hooks/useAuth";
import { Navigate } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";

export function AuthGuard({
  children,
  requireAdmin = false,
}: {
  children: React.ReactNode;
  requireAdmin?: boolean;
}) {
  const { user, role, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) return <Navigate to="/login" />;
  if (requireAdmin && role !== "admin") return <Navigate to="/dashboard" />;

  return <>{children}</>;
}
