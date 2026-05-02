import pptxgen from "pptxgenjs";

const pptx = new pptxgen();
pptx.layout = "LAYOUT_WIDE";
pptx.author = "TCS Certificados";
pptx.subject = "Apresentação técnica do painel de certificados";
pptx.title = "TCS Certificados";
pptx.company = "TCS Certificados";
pptx.lang = "pt-BR";
pptx.theme = {
  headFontFace: "Aptos Display",
  bodyFontFace: "Aptos",
  lang: "pt-BR",
};
pptx.defineLayout({ name: "CUSTOM_WIDE", width: 13.333, height: 7.5 });
pptx.layout = "CUSTOM_WIDE";

const colors = {
  ink: "0F172A",
  muted: "475569",
  faint: "E2E8F0",
  paper: "F8FAFC",
  teal: "0F766E",
  tealDark: "115E59",
  blue: "2563EB",
  green: "16A34A",
  white: "FFFFFF",
};

function addTitle(slide, title, subtitle) {
  slide.addText(title, {
    x: 0.7,
    y: 0.42,
    w: 8.4,
    h: 0.45,
    fontFace: "Aptos Display",
    fontSize: 23,
    bold: true,
    color: colors.ink,
    margin: 0,
    breakLine: false,
    fit: "shrink",
  });
  if (subtitle) {
    slide.addText(subtitle, {
      x: 0.7,
      y: 0.92,
      w: 9.7,
      h: 0.35,
      fontSize: 10.5,
      color: colors.muted,
      margin: 0,
      fit: "shrink",
    });
  }
  slide.addShape(pptx.ShapeType.line, {
    x: 0.7,
    y: 1.35,
    w: 1.15,
    h: 0,
    line: { color: colors.teal, width: 3 },
  });
}

function addFooter(slide, index) {
  slide.addText(`TCS Certificados · ${index}`, {
    x: 0.7,
    y: 7.05,
    w: 3,
    h: 0.2,
    fontSize: 7.5,
    color: "64748B",
    margin: 0,
  });
}

function card(slide, x, y, w, h, title, body, accent = colors.teal) {
  slide.addShape(pptx.ShapeType.roundRect, {
    x,
    y,
    w,
    h,
    rectRadius: 0.05,
    fill: { color: colors.white },
    line: { color: colors.faint, width: 1 },
  });
  slide.addShape(pptx.ShapeType.rect, {
    x,
    y,
    w: 0.07,
    h,
    fill: { color: accent },
    line: { color: accent },
  });
  slide.addText(title, {
    x: x + 0.22,
    y: y + 0.18,
    w: w - 0.42,
    h: 0.28,
    fontSize: 12.5,
    bold: true,
    color: colors.ink,
    margin: 0,
  });
  slide.addText(body, {
    x: x + 0.22,
    y: y + 0.58,
    w: w - 0.42,
    h: h - 0.72,
    fontSize: 9.6,
    color: colors.muted,
    breakLine: false,
    fit: "shrink",
    valign: "top",
    margin: 0,
  });
}

function pill(slide, x, y, text, color = colors.teal) {
  slide.addShape(pptx.ShapeType.roundRect, {
    x,
    y,
    w: 1.45,
    h: 0.34,
    rectRadius: 0.06,
    fill: { color },
    line: { color },
  });
  slide.addText(text, {
    x,
    y: y + 0.075,
    w: 1.45,
    h: 0.15,
    align: "center",
    fontSize: 7.3,
    bold: true,
    color: colors.white,
    margin: 0,
  });
}

{
  const slide = pptx.addSlide();
  slide.background = { color: colors.paper };
  slide.addShape(pptx.ShapeType.rect, {
    x: 0,
    y: 0,
    w: 13.333,
    h: 7.5,
    fill: { color: colors.paper },
    line: { color: colors.paper },
  });
  slide.addText("TCS", {
    x: 0.82,
    y: 0.72,
    w: 1.1,
    h: 0.58,
    fontSize: 30,
    bold: true,
    color: colors.teal,
    margin: 0,
  });
  slide.addText("Certificados", {
    x: 0.82,
    y: 1.7,
    w: 7.8,
    h: 0.8,
    fontFace: "Aptos Display",
    fontSize: 44,
    bold: true,
    color: colors.ink,
    margin: 0,
  });
  slide.addText("Painel web para criar modelos, emitir certificados em PDF/DOCX e validar autenticidade por QR Code.", {
    x: 0.86,
    y: 2.78,
    w: 6.15,
    h: 0.72,
    fontSize: 15,
    color: colors.muted,
    fit: "shrink",
    margin: 0,
  });
  slide.addShape(pptx.ShapeType.roundRect, {
    x: 8.05,
    y: 1.08,
    w: 3.95,
    h: 4.9,
    rectRadius: 0.08,
    fill: { color: colors.white },
    line: { color: "CBD5E1", width: 1 },
  });
  slide.addShape(pptx.ShapeType.rect, {
    x: 8.43,
    y: 1.48,
    w: 3.2,
    h: 4.1,
    fill: { color: "F1F5F9" },
    line: { color: colors.teal, width: 1.2 },
  });
  slide.addText("{{nome}}", {
    x: 8.78,
    y: 3.22,
    w: 2.5,
    h: 0.42,
    align: "center",
    fontSize: 19,
    bold: true,
    color: colors.ink,
    margin: 0,
  });
  slide.addText("PDF · DOCX · QR Code", {
    x: 0.86,
    y: 6.5,
    w: 3.1,
    h: 0.24,
    fontSize: 10,
    bold: true,
    color: colors.tealDark,
    margin: 0,
  });
  addFooter(slide, 1);
}

{
  const slide = pptx.addSlide();
  addTitle(slide, "O problema que o painel resolve", "Certificados precisam manter o design original e reduzir retrabalho operacional.");
  card(slide, 0.78, 1.75, 3.65, 2.0, "Modelos reutilizáveis", "Um modelo em PDF, DOCX ou imagem vira base para múltiplas emissões.", colors.teal);
  card(slide, 4.82, 1.75, 3.65, 2.0, "Campos controlados", "Labels amigáveis no formulário alimentam placeholders técnicos como {{nome}}.", colors.blue);
  card(slide, 8.86, 1.75, 3.65, 2.0, "Validação pública", "Cada emissão recebe código único e QR Code para conferência externa.", colors.green);
  slide.addText("Resultado esperado: menos edição manual, mais consistência visual e trilha de emissão consultável.", {
    x: 1.0,
    y: 4.65,
    w: 10.9,
    h: 0.7,
    fontSize: 21,
    bold: true,
    color: colors.ink,
    align: "center",
    margin: 0,
    fit: "shrink",
  });
  addFooter(slide, 2);
}

{
  const slide = pptx.addSlide();
  addTitle(slide, "Arquitetura técnica", "Next.js, Prisma, Supabase e renderizadores especializados para PDF/DOCX.");
  const items = [
    ["Frontend", "Next.js App Router, TypeScript, Tailwind e componentes de painel."],
    ["Banco", "PostgreSQL no Supabase via Prisma ORM e migrations versionadas."],
    ["Arquivos", "Supabase Storage para PDFs/DOCX quando service role está configurada."],
    ["Renderização", "pdf-lib, docxtemplater, mammoth e fallback sem Chromium."],
  ];
  items.forEach(([title, body], index) => {
    const x = index % 2 === 0 ? 1.0 : 6.85;
    const y = index < 2 ? 1.8 : 4.0;
    card(slide, x, y, 5.25, 1.5, title, body, index % 2 === 0 ? colors.teal : colors.blue);
  });
  addFooter(slide, 3);
}

{
  const slide = pptx.addSlide();
  addTitle(slide, "Fluxo de emissão", "Do modelo enviado ao certificado validável.");
  const steps = [
    ["1", "Subir modelo", "PDF, DOCX ou imagem"],
    ["2", "Marcar campos", "Labels e obrigatoriedade"],
    ["3", "Emitir", "Individual ou lote"],
    ["4", "Validar", "Código e QR público"],
  ];
  steps.forEach(([num, title, body], index) => {
    const x = 0.9 + index * 3.05;
    slide.addShape(pptx.ShapeType.ellipse, {
      x,
      y: 2.25,
      w: 0.62,
      h: 0.62,
      fill: { color: colors.teal },
      line: { color: colors.teal },
    });
    slide.addText(num, {
      x,
      y: 2.39,
      w: 0.62,
      h: 0.22,
      align: "center",
      fontSize: 10,
      bold: true,
      color: colors.white,
      margin: 0,
    });
    slide.addText(title, {
      x: x - 0.15,
      y: 3.05,
      w: 2.2,
      h: 0.28,
      fontSize: 13,
      bold: true,
      color: colors.ink,
      margin: 0,
    });
    slide.addText(body, {
      x: x - 0.15,
      y: 3.48,
      w: 2.2,
      h: 0.44,
      fontSize: 10,
      color: colors.muted,
      margin: 0,
      fit: "shrink",
    });
    if (index < steps.length - 1) {
      slide.addShape(pptx.ShapeType.line, {
        x: x + 0.75,
        y: 2.56,
        w: 1.85,
        h: 0,
        line: { color: "94A3B8", width: 2, beginArrowType: "none", endArrowType: "triangle" },
      });
    }
  });
  addFooter(slide, 4);
}

{
  const slide = pptx.addSlide();
  addTitle(slide, "Documento como fonte de verdade visual", "A estratégia é preservar o arquivo base e preencher variáveis sem reconstruir o design.");
  card(slide, 0.9, 1.75, 3.55, 2.5, "PDF", "Usa o PDF original como base e desenha valores e QR Code sobre a página.", colors.teal);
  card(slide, 4.88, 1.75, 3.55, 2.5, "DOCX", "Extrai preview com Mammoth e substitui placeholders com docxtemplater.", colors.blue);
  card(slide, 8.86, 1.75, 3.55, 2.5, "Imagem", "Mantém a arte como fundo e aplica campos posicionados manualmente.", colors.green);
  slide.addText("Essa abordagem evita perda de margem, tipografia e espaçamento causada por conversões automáticas frágeis.", {
    x: 1.15,
    y: 5.05,
    w: 10.65,
    h: 0.48,
    fontSize: 16,
    bold: true,
    color: colors.ink,
    align: "center",
    margin: 0,
    fit: "shrink",
  });
  addFooter(slide, 5);
}

{
  const slide = pptx.addSlide();
  addTitle(slide, "Estado atual e próximos passos", "Base funcional para evoluir o produto com mais fidelidade visual e governança.");
  pill(slide, 0.95, 1.68, "Implementado", colors.green);
  slide.addText("Login, perfis, modelos, upload PDF/DOCX/imagem, campos, emissão, histórico, revogação, validação pública e Supabase.", {
    x: 0.95,
    y: 2.18,
    w: 5.1,
    h: 1.2,
    fontSize: 14,
    color: colors.ink,
    margin: 0,
    fit: "shrink",
  });
  pill(slide, 6.65, 1.68, "Próximos passos", colors.blue);
  slide.addText("Arrastar campos no canvas, múltiplas páginas de PDF, renderização DOCX mais fiel, auditoria e melhorias de armazenamento.", {
    x: 6.65,
    y: 2.18,
    w: 5.3,
    h: 1.2,
    fontSize: 14,
    color: colors.ink,
    margin: 0,
    fit: "shrink",
  });
  card(slide, 1.25, 4.6, 10.8, 0.95, "Critério de sucesso", "Emitir certificados preservando o modelo original e reduzindo intervenção manual.", colors.teal);
  addFooter(slide, 6);
}

await pptx.writeFile({ fileName: "docs/TCS-Certificados-Apresentacao.pptx" });
