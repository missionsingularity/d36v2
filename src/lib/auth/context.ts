import { createClient } from "@/lib/supabase/server";

export type WorkspaceProfile = { employee_id: string; name: string; designation: string; office_id: string; role: string };

export async function getWorkspaceProfile() {
  return { supabase: await createClient(), profile: getDemoProfile() };
}

export async function requireWorkspaceProfile(): Promise<WorkspaceProfile> {
  return getDemoProfile();
}

function getDemoProfile(): WorkspaceProfile {
  return { employee_id: "DEMO-PB", name: "Prabir Borgohain", designation: "Deputy Secretary, Personnel Department", office_id: "PENSION", role: "supervisor" };
}
