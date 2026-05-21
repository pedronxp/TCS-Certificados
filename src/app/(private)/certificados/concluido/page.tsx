import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Download, FileText, Files, History, ShieldCheck } from "lucide-react";
import { BrandLogo } from "@/components/brand-logo";
import { WhatsappDocumentShareButton } from "@/components/certificates/whatsapp-document-share-button";
import { requireUser } from "@/lib/auth";
import { getTemplateNativeFileType } from "@/lib/certificate-output-format";
import { prisma } from "@/lib/prisma";

export const metadata: Metadata = { title: "Certificado pronto - TCS Certificados" };
export const dynamic = "force-dynamic";

type SearchParams = Promise<{
  issueId?: string | string[];
  batchId?: string | string[];
}>;

export default async function CertificateCompletePage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const user = await requireUser();
  const params = await searchParams;
  const issueId = firstParam(params.issueId);
  const batchId = firstParam(params.batchId);

  if (issueId) {
    const issue = await prisma.certificateIssue.findFirst({
      where: {
        id: issueId,
        ...(user.role === "ADMIN" ? {} : { issuedById: user.id }),
      },
      select: {
        id: true,
        verificationCode: true,
        isTest: true,
        recipient: { select: { name: true } },
        template: { select: { name: true, layout: true } },
      },
    });

    if (!issue) notFound();
    const nativeType = getTemplateNativeFileType(issue.template.layout).toLowerCase();
    const pdfHref = `/api/certificates/${issue.id}/download/pdf?regenerate=1`;
    const whatsappMessage = issue.isTest
      ? `O certificado de teste de ${issue.recipient.name}, referente ao curso ${issue.template.name}, foi gerado para conferência. Vou enviar o arquivo em seguida.`
      : `Olá, ${issue.recipient.name}! Seu certificado do curso ${issue.template.name} foi emitido. Você pode validar a autenticidade pelo link: ${buildValidationUrl(issue.verificationCode)}. Vou enviar o arquivo em seguida.`;

    return (
      <CompletionShell
        title="Certificado pronto para envio"
        subtitle="Baixe o arquivo e envie para o cliente/aluno pelo canal combinado."
        badge={issue.isTest ? "Teste" : issue.verificationCode}
        details={[
          { label: "Participante", value: issue.recipient.name },
          { label: "Modelo", value: issue.template.name },
          { label: issue.isTest ? "Modo" : "Código", value: issue.isTest ? "Emissão de teste" : issue.verificationCode },
        ]}
      >
        <DownloadPanel
          pdfHref={pdfHref}
          nativeHref={`/api/certificates/${issue.id}/download/${nativeType}`}
          nativeLabel={nativeType.toUpperCase()}
          whatsappFileName={getPdfFilename(issue.recipient.name, issue.verificationCode)}
          whatsappMessage={whatsappMessage}
        />
      </CompletionShell>
    );
  }

  if (batchId) {
    const batch = await prisma.certificateBatch.findFirst({
      where: {
        id: batchId,
        ...(user.role === "ADMIN" ? {} : { createdById: user.id }),
      },
      select: {
        id: true,
        isTest: true,
        total: true,
        created: true,
        template: { select: { name: true, layout: true } },
        issues: {
          orderBy: { issuedAt: "asc" },
          select: {
            id: true,
            verificationCode: true,
            recipient: { select: { name: true } },
          },
        },
      },
    });

    if (!batch) notFound();
    const nativeType = getTemplateNativeFileType(batch.template.layout).toLowerCase();

    return (
      <CompletionShell
        title="Lote pronto para envio"
        subtitle="Confira os nomes, baixe os arquivos e envie cada certificado ao respectivo aluno."
        badge={batch.isTest ? "Teste" : "Lote oficial"}
        details={[
          { label: "Modelo", value: batch.template.name },
          { label: "Gerados", value: `${batch.created}/${batch.total}` },
          { label: "Modo", value: batch.isTest ? "Emissão de teste" : "Emissão oficial" },
        ]}
      >
        <section className="dark-card-flat" style={{ overflow: "hidden", textAlign: "left" }}>
          <div className="dark-card-header">
            <h2>Downloads do lote</h2>
            <span className="chip chip-brand">{batch.issues.length} gerados</span>
          </div>
          <div style={{ display: "grid" }}>
            {batch.issues.map((issue) => {
              const pdfHref = `/api/certificates/${issue.id}/download/pdf?regenerate=1`;
              const whatsappMessage = batch.isTest
                ? `O certificado de teste de ${issue.recipient.name}, referente ao curso ${batch.template.name}, foi gerado para conferência. Vou enviar o arquivo em seguida.`
                : `Olá, ${issue.recipient.name}! Seu certificado do curso ${batch.template.name} foi emitido. Você pode validar a autenticidade pelo link: ${buildValidationUrl(issue.verificationCode)}. Vou enviar o arquivo em seguida.`;

              return (
                <div key={issue.id} className="dark-list-row" style={{ alignItems: "center" }}>
                  <div style={{ minWidth: 0 }}>
                    <p style={{ color: "var(--text-primary)", fontWeight: 800 }}>{issue.recipient.name}</p>
                    <p style={{ color: "var(--text-muted)", fontSize: "0.78rem" }}>{issue.verificationCode}</p>
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
                    <DownloadButton href={pdfHref} label="PDF" />
                    <DownloadButton href={`/api/certificates/${issue.id}/download/${nativeType}`} label={nativeType.toUpperCase()} />
                    <WhatsappDocumentShareButton
                      fileUrl={pdfHref}
                      fileName={getPdfFilename(issue.recipient.name, issue.verificationCode)}
                      message={whatsappMessage}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </CompletionShell>
    );
  }

  notFound();
}

function CompletionShell({
  title,
  subtitle,
  badge,
  details,
  children,
}: {
  title: string;
  subtitle: string;
  badge: string;
  details: Array<{ label: string; value: string }>;
  children: ReactNode;
}) {
  return (
    <div className="page-shell" style={{ maxWidth: "980px", margin: "0 auto", textAlign: "center" }}>
      <section className="dark-card-flat" style={{ padding: "1.75rem", marginBottom: "1rem" }}>
        <div style={{ display: "grid", justifyItems: "center", gap: "0.9rem" }}>
          <span className="sidebar-logo-mark brand-logo-mark" aria-hidden="true" style={{ width: "4.5rem", height: "4.5rem" }}>
            <BrandLogo decorative priority sizes="72px" />
          </span>
          <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: "0.5rem" }}>
            <span className="chip chip-success">
              <ShieldCheck style={{ width: 13, height: 13, marginRight: 4 }} />
              Pronto
            </span>
            <span className="chip chip-brand">{badge}</span>
          </div>
          <div>
            <h1 className="page-title">{title}</h1>
            <p className="page-subtitle" style={{ maxWidth: "42rem", margin: "0.35rem auto 0" }}>{subtitle}</p>
          </div>
        </div>

        <div style={{ display: "grid", gap: "0.75rem", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", marginTop: "1.35rem", textAlign: "left" }}>
          {details.map((item) => (
            <div key={item.label} style={{ border: "1px solid var(--border-subtle)", borderRadius: 8, background: "var(--surface-2)", padding: "0.8rem" }}>
              <p style={{ color: "var(--text-muted)", fontSize: "0.75rem", fontWeight: 800, textTransform: "uppercase" }}>{item.label}</p>
              <p style={{ color: "var(--text-primary)", fontSize: "0.95rem", fontWeight: 800, marginTop: "0.25rem", overflowWrap: "anywhere" }}>{item.value}</p>
            </div>
          ))}
        </div>

        <p style={{ maxWidth: "46rem", margin: "1.25rem auto 0", color: "var(--text-secondary)", fontSize: "0.92rem", lineHeight: 1.6 }}>
          Recomendação: baixe o PDF ou o arquivo editável agora e envie imediatamente. Assim você evita confusão de versões, perda de prazo ou esquecimento depois da emissão.
        </p>
      </section>
      {children}
      <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: "0.65rem", marginTop: "1rem" }}>
        <Link href="/certificados/emitir" className="btn btn-primary">
          <FileText style={{ width: 15, height: 15 }} />
          Emitir outro
        </Link>
        <Link href="/certificados/historico" className="btn btn-ghost">
          <History style={{ width: 15, height: 15 }} />
          Ver histórico
        </Link>
      </div>
    </div>
  );
}

function DownloadPanel({
  pdfHref,
  nativeHref,
  nativeLabel,
  whatsappFileName,
  whatsappMessage,
}: {
  pdfHref: string;
  nativeHref: string;
  nativeLabel: string;
  whatsappFileName: string;
  whatsappMessage: string;
}) {
  return (
    <section className="dark-card-flat" style={{ padding: "1rem" }}>
      <div style={{ display: "grid", gap: "0.75rem", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))" }}>
        <DownloadButton href={pdfHref} label="PDF" large />
        <DownloadButton href={nativeHref} label={nativeLabel} large />
        <WhatsappDocumentShareButton
          fileUrl={pdfHref}
          fileName={whatsappFileName}
          message={whatsappMessage}
          large
        />
      </div>
    </section>
  );
}

function DownloadButton({
  href,
  label,
  large = false,
}: {
  href: string;
  label: string;
  large?: boolean;
}) {
  return (
    <a
      href={href}
      className="btn btn-primary"
      style={{
        minHeight: large ? "4.25rem" : undefined,
        justifyContent: "center",
        gap: "0.5rem",
      }}
    >
      {label === "PDF" ? <Download style={{ width: 18, height: 18 }} /> : <Files style={{ width: 18, height: 18 }} />}
      Baixar {label}
    </a>
  );
}

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function buildValidationUrl(code: string) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  return `${appUrl.replace(/\/$/, "")}/validar/${encodeURIComponent(code)}`;
}

function getPdfFilename(recipientName: string, verificationCode: string) {
  return `${sanitizeFilenamePart(recipientName)}-${sanitizeFilenamePart(verificationCode)}.pdf`;
}

function sanitizeFilenamePart(value: string) {
  return (
    value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[<>:"/\\|?*\u0000-\u001F]/g, " ")
      .replace(/\s+/g, " ")
      .trim() || "certificado"
  );
}
