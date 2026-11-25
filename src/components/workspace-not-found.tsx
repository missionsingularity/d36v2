"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Search } from "lucide-react";

export function WorkspaceNotFound() {
  const router = useRouter();

  return (
    <section className="content">
      <div className="mx-auto flex min-h-[60vh] max-w-2xl items-center justify-center py-12">
        <div className="panel w-full p-8 text-center sm:p-12">
          <div className="mx-auto flex size-16 items-center justify-center rounded-2xl bg-blue-50 text-primary">
            <Search size={28} aria-hidden="true" />
          </div>
          <p className="eyebrow mt-6">Singularity workspace</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">We couldn’t find that page</h1>
          <p className="mx-auto mt-3 max-w-lg text-sm leading-6 text-secondary">
            The link may be out of date, or this record may not be available in the current workspace.
          </p>
          <div className="mt-7 flex flex-wrap justify-center gap-3">
            <button type="button" className="btn" onClick={() => router.back()}>
              <ArrowLeft size={16} aria-hidden="true" /> Back
            </button>
            <Link className="btn btn-primary" href="/search">
              <Search size={16} aria-hidden="true" /> Go to Search
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
