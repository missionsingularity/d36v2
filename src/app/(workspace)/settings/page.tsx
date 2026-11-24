"use client";

import { Suspense } from "react";
import { SettingsWorkspace } from "@/components/settings-workspace";

export default function SettingsPage() { return <Suspense fallback={<section className="content">Loading settings…</section>}><SettingsWorkspace/></Suspense>; }
