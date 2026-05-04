import { prisma } from "@/lib/prisma";
import { CertificateCarousel } from "@/components/certificate-carousel";

/** Mascara nome: "João Silva" → "J*** S***a" */
function maskName(name: string): string {
  const parts = name.trim().split(/\s+/);
  return parts
    .map((part) => {
      if (part.length <= 1) return part;
      if (part.length <= 3) return part[0] + "•".repeat(part.length - 1);
      return part[0] + "•".repeat(part.length - 2) + part[part.length - 1];
    })
    .join(" ");
}

/** Extrai iniciais do nome: "João Silva" → "JS" */
function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0].toUpperCase())
    .join("");
}

/** Mascara codigo de verificacao: "TCS-BR-2026-0001" -> "#TCS-BR-20••••1" */
function maskCode(code: string): string {
  if (code.length <= 6) return "#" + code;
  const prefix = code.slice(0, Math.ceil(code.length * 0.45));
  const suffix = code.slice(-1);
  const dots = "•".repeat(Math.max(2, code.length - prefix.length - 1));
  return "#" + prefix + dots + suffix;
}

/** Formata data: "28 abr. 2025" */
function formatDate(date: Date): string {
  return date.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

// Fallback cards when DB has no data
const FALLBACK_CARDS = [
  {
    id: "demo-1",
    recipientInitials: "MS",
    recipientMasked: "M••••a S•••a",
    course: "Desenvolvimento Web Full Stack",
    institution: "TCS Treinamentos",
    issuedAt: "28 abr. 2025",
    code: "#TCS-BR-2026-0001",
    status: "Válido" as const,
  },
  {
    id: "demo-2",
    recipientInitials: "RL",
    recipientMasked: "R•••o L•••s",
    course: "Excel Avançado com VBA",
    institution: "TCS Treinamentos",
    issuedAt: "25 abr. 2025",
    code: "#TCS-BR-2026-0002",
    status: "Válido" as const,
  },
  {
    id: "demo-3",
    recipientInitials: "AC",
    recipientMasked: "A•••e C•••o",
    course: "Gestão de Projetos — PMI",
    institution: "TCS Treinamentos",
    issuedAt: "22 abr. 2025",
    code: "#TCS-BR-2026-0003",
    status: "Válido" as const,
  },
];

export async function CertificateCarouselServer() {
  let cards = FALLBACK_CARDS;

  try {
    const issues = await prisma.certificateIssue.findMany({
      where: {
        status: "ISSUED",
        hiddenAt: null,
      },
      take: 8,
      orderBy: { issuedAt: "desc" },
      select: {
        id: true,
        verificationCode: true,
        status: true,
        issuedAt: true,
        recipient: {
          select: { name: true },
        },
        template: {
          select: { name: true, description: true },
        },
      },
    });

    if (issues.length > 0) {
      cards = issues.map((issue) => ({
        id: issue.id,
        recipientInitials: initials(issue.recipient.name),
        recipientMasked: maskName(issue.recipient.name),
        course: issue.template.name,
        institution: "TCS Treinamentos",
        issuedAt: formatDate(issue.issuedAt),
        code: maskCode(issue.verificationCode),
        status: "Válido" as const,
      }));
    }
  } catch {
    // DB offline or error → use fallback silently
  }

  return <CertificateCarousel cards={cards} />;
}
