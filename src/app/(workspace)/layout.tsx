import { WorkspaceShell } from "@/components/workspace-shell";
import { requireWorkspaceProfile } from "@/lib/auth/context";

export default async function WorkspaceLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const profile = await requireWorkspaceProfile();
  return <WorkspaceShell profile={profile}>{children}</WorkspaceShell>;
}
