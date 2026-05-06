/* eslint-disable @next/next/no-img-element */

type CertificateTemplatePreviewProps = {
  title: string;
  subtitle?: string | null;
  orientation?: string | null;
  imageSrc?: string | null;
};

export function getTemplatePreviewImage(input: {
  background?: string | null;
  layout?: unknown;
}) {
  const layout = input.layout;
  const layoutObject = layout && typeof layout === "object" && !Array.isArray(layout)
    ? (layout as Record<string, unknown>)
    : null;

  for (const key of ["baseRenderDataUrl", "baseImageDataUrl"]) {
    const value = layoutObject?.[key];
    if (typeof value === "string" && value.startsWith("data:image/")) return value;
  }

  const pages = layoutObject?.basePages;
  if (Array.isArray(pages)) {
    const firstPage = pages.find((page) => page && typeof page === "object") as Record<string, unknown> | undefined;
    const imageDataUrl = firstPage?.imageDataUrl;
    if (typeof imageDataUrl === "string" && imageDataUrl.startsWith("data:image/")) return imageDataUrl;
  }

  if (typeof input.background === "string" && input.background.startsWith("data:image/")) {
    return input.background;
  }

  return null;
}

export function CertificateTemplatePreview({
  title,
  subtitle,
  orientation,
  imageSrc,
}: CertificateTemplatePreviewProps) {
  const portrait = orientation === "portrait";

  return (
    <div className={`certificate-preview${portrait ? " certificate-preview-portrait" : ""}`}>
      {imageSrc ? (
        <img className="certificate-preview-image" src={imageSrc} alt={`Preview do modelo ${title}`} />
      ) : (
        <div className="certificate-preview-frame">
          <span className="certificate-preview-kicker">TCS Certificados</span>
          <strong>{title}</strong>
          {subtitle ? <span>{subtitle}</span> : null}
        </div>
      )}
    </div>
  );
}
