import Image from "next/image";

type BrandLogoProps = {
  className?: string;
  decorative?: boolean;
  priority?: boolean;
  sizes?: string;
};

export function BrandLogo({
  className = "brand-logo-image",
  decorative = false,
  priority = false,
  sizes = "96px",
}: BrandLogoProps) {
  return (
    <Image
      src="/logo/logo-app-removebg-preview.png"
      alt={decorative ? "" : "TCS Cursos e Serviços"}
      width={603}
      height={414}
      className={className}
      priority={priority}
      sizes={sizes}
    />
  );
}
