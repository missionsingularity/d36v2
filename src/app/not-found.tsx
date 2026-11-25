import { WorkspaceShell } from "@/components/workspace-shell";
import { WorkspaceNotFound } from "@/components/workspace-not-found";
import { requireWorkspaceProfile } from "@/lib/auth/context";

export default async function NotFound() {
  const profile = await requireWorkspaceProfile();
  return (
    <WorkspaceShell profile={profile}>
      <WorkspaceNotFound />
    </WorkspaceShell>
  );
}
