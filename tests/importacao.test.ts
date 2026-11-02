import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/db", () => ({ db: {} }));
const { extrairModeloDescricao } = await import("@/lib/importacao");

const nota = (descricao: string, competencia: string, servico: string, valorMoeda?: string) =>
  ({ dps: { descricao, competencia, valorMoeda }, valores: { servico }, prestador: {}, tomador: {} }) as never;

describe("extrairModeloDescricao", () => {
  it("troca o mês anterior à competência por variável", () => {
    expect(extrairModeloDescricao(nota("SUPORTE MENSAL 09/2026 - Chave Pix: 12.345.678/0001-95", "2026-10-01", "5000.00"))).toBe(
      "SUPORTE MENSAL {mesAnoAnterior} - Chave Pix: 12.345.678/0001-95",
    );
  });

  it("troca valor em moeda, cotação, data e total em reais", () => {
    expect(
      extrairModeloDescricao(
        nota("Serviços de Desenvolvimento de Software. Total 1,234.56 USD x 5,00 (PTAX 05/10/2026) = 6.172,80", "2026-10-05", "6172.80", "1234.56"),
      ),
    ).toBe("Serviços de Desenvolvimento de Software. Total {valorMoeda} USD x {cotacao} (PTAX {dataCotacao}) = {valor}");
  });
});
