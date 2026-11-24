import type { Metadata } from "next";
import "@xyflow/react/dist/style.css";
import "@fontsource-variable/inter";
import "./globals.css";

export const metadata: Metadata = {
  title: "Singularity | Pension & Public Grievances",
  description: "Assam Pension and Public Grievances departmental workspace.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
