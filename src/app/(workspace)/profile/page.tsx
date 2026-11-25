import { Suspense } from "react";
import { SettingsWorkspace } from "@/components/settings-workspace";
export default function ProfilePage() { return <Suspense fallback={<section className="content">Loading profile…</section>}><SettingsWorkspace/></Suspense>; }
