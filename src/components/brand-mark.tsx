import Image from "next/image";

/** The supplied Singularity mark, shared by the header, home screen, and answers. */
export function BrandMark({ size = 40 }: { size?: number }) {
  return <Image src="/branding/logo.png" alt="Singularity" width={size} height={size} unoptimized className="brand-mark" />;
}
