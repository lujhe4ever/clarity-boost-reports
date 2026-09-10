import type { ReactNode } from "react";
import { useAuth } from "@/hooks/useAuth";
import { Navigate } from "@tanstack/react-router";
import { DashboardSkeleton } from "@/components/DashboardSkeleton";

export function AuthGuard({
  children,
  requireAdmin = false,
}: {
  children: ReactNode;
  requireAdmin?: boolean;
}) {
  const { user, canManageClients, loading } = useAuth();

  if (loading) {
    return <DashboardSkeleton />;
  }

  if (!user) return <Navigate to="/login" />;
  if (requireAdmin && !canManageClients) return <Navigate to="/dashboard" />;

  return <>{children}</>;
}
