import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth";

export const metadata: Metadata = { title: "Variáveis — TCS Certificados" };

const variableGroups = [
  {
    title: "Participante",
    description: "Campos que identificam cada pessoa certificada.",
    items: [
      {
        variable: "{{NOME}}",
        use: "Nome exibido no certificado.",
        normal: "Preenchido no campo Aluno.",
        batch: "Uma pessoa por linha. Ex.: Maria Silva",
        result: "Maria Silva",
      },
      {
        variable: "{{DOC}}, {{CPF}}",
        use: "Documento individual. Pode ser CPF, RG ou outro documento, conforme o modelo.",
        normal: "Aparece como campo de documento quando o modelo exige documento.",
        batch: "Pode entrar como segunda coluna. Ex.: Maria Silva; 000.000.000-00",
        result: "000.000.000-00",
      },
      {
        variable: "{{DOCUMENTO_PARTICIPANTE_TEXTO}}",
        use: "Texto calculado para CPF opcional. Se houver documento, monta a frase; se não houver, fica vazio.",
        normal: "Use junto da opção Com CPF / Sem CPF.",
        batch: "Use quando o lote puder ter pessoas com ou sem documento.",
        result: ", portador(a) do CPF 000.000.000-00",
      },
    ],
  },
  {
    title: "Curso e período",
    description: "Campos compartilhados normalmente iguais para todos os certificados de um lote.",
    items: [
      {
        variable: "{{CURSO}}",
        use: "Nome do curso quando o modelo não tem o curso fixo no texto.",
        normal: "Preenchido uma vez no formulário.",
        batch: "Valor compartilhado para todos os certificados do lote.",
        result: "Instrutor de Primeiros Socorros",
      },
      {
        variable: "{{PERIODO}}",
        use: "Período textual do curso, geralmente mês e ano.",
        normal: "Campo de mês. Ex.: maio de 2026.",
        batch: "Valor compartilhado para todos do lote.",
        result: "maio de 2026",
      },
      {
        variable: "{{DATA_EXTENSO}}",
        use: "Data principal por extenso e, quando existir, ponto de partida para distribuir dias da carga horária.",
        normal: "Campo de data convertido para texto.",
        batch: "Data compartilhada do lote.",
        result: "2 de maio de 2026",
      },
      {
        variable: "{{CIDADE}}",
        use: "Cidade exibida no certificado.",
        normal: "Preenchida no formulário.",
        batch: "Valor repetido em todos os certificados do lote.",
        result: "Cataguases",
      },
    ],
  },
  {
    title: "Carga horária",
    description: "Campos usados para evitar texto errado quando o curso passa de 8 horas.",
    items: [
      {
        variable: "{{HORAS}}, {{HORA}}",
        use: "Valor numérico ou curto da carga horária.",
        normal: "O usuário informa 1, 8, 12, 40 etc.",
        batch: "Valor compartilhado para todos os certificados.",
        result: "40",
      },
      {
        variable: "{{CARGA_HORARIA_COM_UNIDADE}}",
        use: "Texto calculado com singular/plural.",
        normal: "Calculado a partir de {{HORAS}}.",
        batch: "Calculado antes de gerar cada certificado.",
        result: "40 horas",
      },
      {
        variable: "{{COMPLEMENTO_CARGA_HORARIA}}",
        use: "Complemento calculado. Até 8 horas fica vazio; acima de 8 horas distribui em dias com no máximo 8 horas por dia.",
        normal: "Use logo depois de {{CARGA_HORARIA_COM_UNIDADE}}.",
        batch: "O motor calcula para cada geração do lote.",
        result: ", distribuída nos dias 2, 3, 4, 5 e 6 de maio de 2026",
      },
      {
        variable: "{{PERIODO_CARGA_HORARIA}}",
        use: "Apelido compatível para o mesmo cálculo de {{COMPLEMENTO_CARGA_HORARIA}}.",
        normal: "Pode ser usado em modelos antigos que já tinham esse nome.",
        batch: "Funciona como variável calculada no lote.",
        result: ", distribuída nos dias 2, 3, 4, 5 e 6 de maio de 2026",
      },
    ],
  },
  {
    title: "Sistema",
    description: "Campos preenchidos automaticamente pelo sistema.",
    items: [
      {
        variable: "{{COD}}",
        use: "Código público de validação do certificado.",
        normal: "Não precisa preencher manualmente.",
        batch: "Cada certificado recebe seu próprio código.",
        result: "TCS-BR-2026-0042",
      },
    ],
  },
];

const phraseExamples = [
  {
    label: "Modelo com CPF opcional",
    template:
      "A T.C.S Tico Cursos e Serviços confere o presente certificado a Sr(a). {{NOME}}{{DOCUMENTO_PARTICIPANTE_TEXTO}}, concluiu com êxito o Curso de Instrutor de Primeiros Socorros...",
    withData:
      "A T.C.S Tico Cursos e Serviços confere o presente certificado a Sr(a). Maria Silva, portador(a) do CPF 000.000.000-00, concluiu com êxito o Curso de Instrutor de Primeiros Socorros...",
    withoutData:
      "A T.C.S Tico Cursos e Serviços confere o presente certificado a Sr(a). Joãozinho Souza, concluiu com êxito o Curso de Instrutor de Primeiros Socorros...",
  },
  {
    label: "Modelo com carga horária acima de 8 horas",
    template:
      "realizado no período de {{PERIODO}} na cidade de {{CIDADE}}, com carga horária total de {{CARGA_HORARIA_COM_UNIDADE}}{{COMPLEMENTO_CARGA_HORARIA}};",
    withData:
      "realizado no período de maio de 2026 na cidade de Cataguases, com carga horária total de 40 horas, distribuída nos dias 2, 3, 4, 5 e 6 de maio de 2026;",
    withoutData:
      "realizado no período de maio de 2026 na cidade de Cataguases, com carga horária total de 8 horas;",
  },
  {
    label: "Curso virando o mês",
    template:
      "com carga horária total de {{CARGA_HORARIA_COM_UNIDADE}}{{COMPLEMENTO_CARGA_HORARIA}};",
    withData:
      "com carga horária total de 40 horas, distribuída nos dias 30 de maio de 2026, 31 de maio de 2026, 1 de junho de 2026, 2 de junho de 2026 e 3 de junho de 2026;",
    withoutData:
      "Quando a data inicial não é informada, o sistema usa o período do curso como referência.",
  },
];

export default async function VariablesPage() {
  await requireAdmin();

  return (
    <div className="page-shell page-shell-wide">
      <div className="page-header">
        <div>
          <h1 className="page-title">Variáveis dos modelos</h1>
          <p className="page-subtitle">
            Guia rápido para saber onde cada variável entra, como o sistema trata o valor e o que muda na emissão normal ou em lote.
          </p>
        </div>
      </div>

      <section className="dark-card-flat" style={{ padding: "1.25rem", marginBottom: "1.25rem" }}>
        <div style={{ display: "grid", gap: "1rem", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))" }}>
          <GuideStat title="CPF opcional" value="Use {{DOCUMENTO_PARTICIPANTE_TEXTO}}" />
          <GuideStat title="Horas acima de 8" value="Use {{COMPLEMENTO_CARGA_HORARIA}}" />
          <GuideStat title="Lote" value="Campos por pessoa + campos compartilhados" />
        </div>
      </section>

      <div style={{ display: "grid", gap: "1.25rem" }}>
        {variableGroups.map((group) => (
          <section key={group.title} className="dark-card-flat">
            <div className="dark-card-header">
              <div>
                <h2>{group.title}</h2>
                <p style={{ marginTop: 4, color: "var(--text-muted)", fontSize: "0.86rem" }}>
                  {group.description}
                </p>
              </div>
              <span className="chip chip-brand">{group.items.length} variáveis</span>
            </div>
            <div style={{ display: "grid", gap: "0.85rem", padding: "1rem" }}>
              {group.items.map((item) => (
                <VariableCard key={item.variable} item={item} />
              ))}
            </div>
          </section>
        ))}
      </div>

      <section className="dark-card-flat" style={{ marginTop: "1.25rem" }}>
        <div className="dark-card-header">
          <h2>Frases prontas para usar no modelo</h2>
          <span className="chip">copiar e adaptar</span>
        </div>
        <div style={{ display: "grid", gap: "1rem", padding: "1rem" }}>
          {phraseExamples.map((example) => (
            <article
              key={example.label}
              style={{
                display: "grid",
                gap: "0.75rem",
                border: "1px solid var(--border-subtle)",
                borderRadius: 8,
                background: "var(--surface-2)",
                padding: "1rem",
              }}
            >
              <h3 style={{ margin: 0, color: "var(--text-primary)", fontSize: "1rem" }}>{example.label}</h3>
              <ExampleBlock label="Frase com variável" text={example.template} />
              <ExampleBlock label="Resultado com dados" text={example.withData} />
              <ExampleBlock label="Resultado sem dado / até 8h" text={example.withoutData} />
            </article>
          ))}
        </div>
      </section>

      <section className="dark-card-flat" style={{ marginTop: "1.25rem", padding: "1.25rem" }}>
        <h2 className="section-title">Regra principal para não quebrar o modelo</h2>
        <p className="section-subtitle" style={{ maxWidth: 920 }}>
          Para textos novos, prefira separar valor e complemento: <code style={codeStyle}>{"{{CARGA_HORARIA_COM_UNIDADE}}"}</code>{" "}
          <code style={codeStyle}>{"{{COMPLEMENTO_CARGA_HORARIA}}"}</code>. Assim o certificado fica correto com 8 horas ou menos e também com cursos de vários dias.
        </p>
      </section>
    </div>
  );
}

function GuideStat({ title, value }: { title: string; value: string }) {
  return (
    <div style={{ border: "1px solid var(--border-subtle)", borderRadius: 8, padding: "1rem", background: "var(--surface-2)" }}>
      <p style={{ margin: 0, color: "var(--text-muted)", fontSize: "0.78rem", fontWeight: 700 }}>{title}</p>
      <p style={{ margin: "0.35rem 0 0", color: "var(--text-primary)", fontSize: "0.95rem", fontWeight: 700, overflowWrap: "anywhere" }}>{value}</p>
    </div>
  );
}

function VariableCard({
  item,
}: {
  item: {
    variable: string;
    use: string;
    normal: string;
    batch: string;
    result: string;
  };
}) {
  return (
    <article
      style={{
        display: "grid",
        gap: "0.85rem",
        border: "1px solid var(--border-subtle)",
        borderRadius: 8,
        background: "var(--surface-2)",
        padding: "1rem",
      }}
    >
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "0.5rem" }}>
        {item.variable.split(",").map((variable) => (
          <code key={variable.trim()} style={codeStyle}>{variable.trim()}</code>
        ))}
      </div>
      <div style={{ display: "grid", gap: "0.75rem", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
        <ExampleBlock label="Como trata" text={item.use} />
        <ExampleBlock label="Normal" text={item.normal} />
        <ExampleBlock label="Lote" text={item.batch} />
        <ExampleBlock label="Exemplo" text={item.result} />
      </div>
    </article>
  );
}

function ExampleBlock({ label, text }: { label: string; text: string }) {
  return (
    <div>
      <p style={{ margin: "0 0 0.35rem", color: "var(--text-muted)", fontSize: "0.76rem", fontWeight: 800 }}>
        {label}
      </p>
      <p
        style={{
          margin: 0,
          color: "var(--text-secondary)",
          fontSize: "0.9rem",
          lineHeight: 1.55,
          overflowWrap: "anywhere",
        }}
      >
        {text}
      </p>
    </div>
  );
}

const codeStyle = {
  display: "inline-block",
  maxWidth: "100%",
  border: "1px solid var(--border-subtle)",
  borderRadius: 6,
  background: "var(--surface-1)",
  color: "var(--text-primary)",
  padding: "0.15rem 0.35rem",
  fontSize: "0.82rem",
  fontWeight: 700,
  overflowWrap: "anywhere",
  whiteSpace: "normal",
} as const;
