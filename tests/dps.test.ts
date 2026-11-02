import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import forge from "node-forge";
import { describe, expect, it } from "vitest";
import { SignedXml } from "xml-crypto";
import { assinarXml } from "@/lib/nfse/assinatura";
import { lerCertificadoPfx } from "@/lib/nfse/certificado";
import { leiauteDoAmbiente, montarDps, montarIdDps, montarPedidoCancelamento, type DadosDps } from "@/lib/nfse/dps";
import { aplicarModeloDescricao, dataHoraBrasilia, lerValor } from "@/lib/nfse/formatos";

const XSD_RESTRITA = path.resolve(__dirname, "../docs/oficial/xsd-restrita");
/**
 * O XSD de produção tem padrões com "^...$". Na especificação XSD isso não é âncora, e o libxml
 * (xmllint) trata como caractere literal, recusando qualquer valor; a Sefin aceita. Os testes
 * validam contra uma cópia sem as âncoras.
 */
const XSD_PRODUCAO = (() => {
  const origem = path.resolve(__dirname, "../docs/oficial/xsd-producao");
  const destino = mkdtempSync(path.join(tmpdir(), "xsd-producao-"));
  for (const arq of readdirSync(origem)) {
    const conteudo = readFileSync(path.join(origem, arq), "utf-8");
    writeFileSync(path.join(destino, arq), conteudo.replace(/pattern value="\^([^"]*)\$"/g, 'pattern value="$1"'));
  }
  return destino;
})();

function gerarPfxDeTeste(senha: string): Buffer {
  const chaves = forge.pki.rsa.generateKeyPair(2048);
  const cert = forge.pki.createCertificate();
  cert.publicKey = chaves.publicKey;
  cert.serialNumber = "01";
  cert.validity.notBefore = new Date();
  cert.validity.notAfter = new Date(Date.now() + 365 * 24 * 3600 * 1000);
  const attrs = [{ name: "commonName", value: "EMPRESA TESTE LTDA:12345678000195" }];
  cert.setSubject(attrs);
  cert.setIssuer(attrs);
  cert.sign(chaves.privateKey, forge.md.sha256.create());
  const p12 = forge.pkcs12.toPkcs12Asn1(chaves.privateKey, [cert], senha, { algorithm: "3des" });
  return Buffer.from(forge.asn1.toDer(p12).getBytes(), "binary");
}

const certificado = lerCertificadoPfx(gerarPfxDeTeste("1234"), "1234");

const dados: DadosDps = {
  ambiente: "2",
  serie: "1",
  numero: 42,
  valor: 5000,
  descricao: "Desenvolvimento de software & consultoria <novembro/2026>",
  competencia: "2026-11-02",
  emitidaEm: new Date("2026-11-02T15:00:00Z"),
  prestador: {
    cnpj: "12.345.678/0001-95",
    codMunicipio: "3550308",
    email: "contato@empresa.com.br",
    opSimpNac: "3",
    regApTribSN: "1",
    regEspTrib: "0",
  },
  servico: {
    cTribNac: "010101",
    cNBS: "1.1502.10.00",
    tribISSQN: "1",
    tpRetISSQN: "1",
    pTotTribSN: "6",
    ibscbsAtivo: true,
    cIndOp: "100301",
    cClassTrib: "000001",
  },
  tomador: {
    documento: "11222333000181",
    nome: "CLIENTE EXEMPLO S.A.",
    email: "financeiro@cliente.com",
    codMunicipio: "3304557",
    cep: "20040-020",
    logradouro: "Av. Rio Branco",
    numero: "1",
    bairro: "Centro",
  },
};

function validarXsd(xml: string, schema: string, pasta = XSD_RESTRITA) {
  const dir = mkdtempSync(path.join(tmpdir(), "dps-"));
  const arquivo = path.join(dir, "doc.xml");
  writeFileSync(arquivo, xml);
  try {
    execFileSync("xmllint", ["--noout", "--schema", path.join(pasta, schema), arquivo], { stdio: "pipe" });
  } catch (e) {
    throw new Error(String((e as { stderr?: Buffer }).stderr ?? e));
  }
}

function verificarAssinatura(xml: string) {
  const sig = new SignedXml({ publicCert: certificado.certPem });
  const no = xml.match(/<Signature[\s\S]*<\/Signature>/)![0];
  sig.loadSignature(no);
  return sig.checkSignature(xml);
}

describe("DPS", () => {
  it("monta o Id com 45 posições", () => {
    const id = montarIdDps("3550308", "12345678000195", "1", 42);
    expect(id).toBe("DPS3550308212345678000195000010000000000000" + "42");
    expect(id).toHaveLength(45);
  });

  it("gera XML válido no XSD oficial (sem e com assinatura)", () => {
    const { xml } = montarDps(dados);
    validarXsd(xml, "DPS_v1.01.xsd");

    const assinado = assinarXml(xml, "infDPS", certificado);
    validarXsd(assinado, "DPS_v1.01.xsd");
    expect(verificarAssinatura(assinado)).toBe(true);
    expect(assinado).toMatch(/<\/infDPS><Signature xmlns="http:\/\/www.w3.org\/2000\/09\/xmldsig#">/);
    expect(assinado).toContain('<Reference URI="#DPS3550308');
    expect(assinado).toContain("<X509Certificate>");
  });

  it("escapa caracteres especiais e omite opcionais vazios", () => {
    const { xml } = montarDps({ ...dados, tomador: { documento: "12345678909", nome: "Fulano" } });
    expect(xml).toContain("software &amp; consultoria &lt;novembro/2026&gt;");
    expect(xml).toContain("<toma><CPF>12345678909</CPF><xNome>Fulano</xNome></toma>");
    validarXsd(xml, "DPS_v1.01.xsd");
  });

  it("usa indTotTrib quando não há percentual do Simples e omite IBSCBS quando desativado", () => {
    const { xml } = montarDps({ ...dados, servico: { ...dados.servico, pTotTribSN: null, ibscbsAtivo: false } });
    expect(xml).toContain("<totTrib><indTotTrib>0</indTotTrib></totTrib>");
    expect(xml).not.toContain("IBSCBS");
    validarXsd(xml, "DPS_v1.01.xsd");
  });

  it("serviço nacional com local de prestação do tomador e PIS/COFINS do Simples", () => {
    const { xml } = montarDps({
      ...dados,
      servico: { ...dados.servico, cTribNac: "170201", cNBS: null, cLocPrestacao: "3143005", cstPisCofins: "00", tpRetPisCofins: "0" },
    });
    expect(xml).toContain("<locPrest><cLocPrestacao>3143005</cLocPrestacao></locPrest>");
    expect(xml).toContain("<tribFed><piscofins><CST>00</CST><tpRetPisCofins>0</tpRetPisCofins></piscofins></tribFed>");
    expect(xml).not.toContain("comExt");
    validarXsd(xml, "DPS_v1.01.xsd");
  });

  it("exportação: tomador com NIF/endereço no exterior, comExt, cPaisResult e CST 410", () => {
    const { xml } = montarDps({
      ...dados,
      valor: 6172.8,
      valorMoeda: 1234.56,
      tomador: {
        documento: "987654321",
        nome: "ACME INC",
        pais: "US",
        codigoPostal: "10001",
        cidade: "NEW YORK",
        estadoProvincia: "NY",
        logradouro: "100 MAIN ST",
      },
      servico: {
        ...dados.servico,
        tribISSQN: "3",
        cIndOp: null,
        cClassTrib: "410004",
        comExt: { mdPrestacao: "1", vincPrest: "0", tpMoeda: "840", mecAFComexP: "01", mecAFComexT: "01", movTempBens: "1", mdic: "0" },
      },
    });
    expect(xml).toContain(
      "<toma><NIF>987654321</NIF><xNome>ACME INC</xNome><end><endExt><cPais>US</cPais><cEndPost>10001</cEndPost><xCidade>NEW YORK</xCidade><xEstProvReg>NY</xEstProvReg></endExt><xLgr>100 MAIN ST</xLgr><nro>NI</nro><xBairro>NI</xBairro></end>",
    );
    expect(xml).toContain("<comExt><mdPrestacao>1</mdPrestacao><vincPrest>0</vincPrest><tpMoeda>840</tpMoeda><vServMoeda>1234.56</vServMoeda>");
    expect(xml).toContain("<tribMun><tribISSQN>3</tribISSQN><cPaisResult>US</cPaisResult><tpRetISSQN>1</tpRetISSQN></tribMun>");
    expect(xml).toContain("<vServ>6172.80</vServ>");
    expect(xml).toContain("<IBSCBS><indDest>0</indDest><valores><trib><CST>410</CST><cClassTrib>410004</cClassTrib></trib></valores></IBSCBS>");
    validarXsd(xml, "DPS_v1.01.xsd");
  });

  it("exportação sem valor em moeda estrangeira é recusada", () => {
    const comExt = { mdPrestacao: "1", vincPrest: "0", tpMoeda: "840", mecAFComexP: "01", mecAFComexT: "01", movTempBens: "1", mdic: "0" };
    expect(() => montarDps({ ...dados, servico: { ...dados.servico, tribISSQN: "3", comExt } })).toThrow(/moeda estrangeira/);
  });

  it("gera pedido de cancelamento válido e assinado", () => {
    const chave = "35503082" + "12345678000195" + "0".repeat(28);
    const { xml } = montarPedidoCancelamento({
      ambiente: "2",
      cnpjAutor: "12345678000195",
      chaveAcesso: chave,
      codigoMotivo: "1",
      motivo: "Valor informado incorretamente",
    });
    const assinado = assinarXml(xml, "infPedReg", certificado);
    validarXsd(assinado, "pedRegEvento_v1.01.xsd");
    expect(verificarAssinatura(assinado)).toBe(true);
  });
});

describe("leiaute de produção (XSD 09/02/2026)", () => {
  const comExt = { mdPrestacao: "1", vincPrest: "0", tpMoeda: "840", mecAFComexP: "01", mecAFComexT: "01", movTempBens: "1", mdic: "0" };

  it("produção usa o leiaute atual e restrita o da NT 009", () => {
    expect(leiauteDoAmbiente("1")).toBe("atual");
    expect(leiauteDoAmbiente("2")).toBe("nt009");
  });

  it("serviço nacional: finNFSe dentro de IBSCBS, gIBSCBS e xDescServ antes de cNBS", () => {
    const { xml } = montarDps({ ...dados, ambiente: "1", servico: { ...dados.servico, cLocPrestacao: "3143005", cstPisCofins: "00", tpRetPisCofins: "0" } });
    expect(xml).not.toMatch(/<tpEmit>1<\/tpEmit><finNFSe>/);
    expect(xml).toContain("<IBSCBS><finNFSe>0</finNFSe><cIndOp>100301</cIndOp><indDest>0</indDest><valores><trib><gIBSCBS><CST>000</CST><cClassTrib>000001</cClassTrib></gIBSCBS></trib></valores></IBSCBS>");
    expect(xml).toMatch(/<xDescServ>.*<\/xDescServ><cNBS>/);
    validarXsd(xml, "DPS_v1.01.xsd", XSD_PRODUCAO);
    validarXsd(assinarXml(xml, "infDPS", certificado), "DPS_v1.01.xsd", XSD_PRODUCAO);
  });

  it("exportação com cIndOp 100302 e CST 410", () => {
    const { xml } = montarDps({
      ...dados,
      ambiente: "1",
      valor: 6172.8,
      valorMoeda: 1234.56,
      tomador: { documento: "987654321", nome: "ACME INC", pais: "US", cidade: "NEW YORK", logradouro: "100 MAIN ST" },
      servico: { ...dados.servico, tribISSQN: "3", cIndOp: "100302", cClassTrib: "410004", comExt },
    });
    expect(xml).toContain("<cIndOp>100302</cIndOp>");
    validarXsd(xml, "DPS_v1.01.xsd", XSD_PRODUCAO);
  });

  it("exige cIndOp", () => {
    expect(() => montarDps({ ...dados, ambiente: "1", servico: { ...dados.servico, cIndOp: null } })).toThrow(/cIndOp/);
  });

  it("NT 009 omite cIndOp para CST 410 mesmo se configurado", () => {
    const { xml } = montarDps({ ...dados, valorMoeda: 10, tomador: { documento: "1", nome: "X", pais: "US" }, servico: { ...dados.servico, tribISSQN: "3", cIndOp: "100302", cClassTrib: "410004", comExt } });
    expect(xml).not.toContain("cIndOp");
    validarXsd(xml, "DPS_v1.01.xsd");
  });

  it("pedido de cancelamento também vale no XSD de produção", () => {
    const { xml } = montarPedidoCancelamento({ ambiente: "1", cnpjAutor: "12345678000195", chaveAcesso: "3".repeat(50), codigoMotivo: "1", motivo: "Valor informado incorretamente" });
    validarXsd(assinarXml(xml, "infPedReg", certificado), "pedRegEvento_v1.01.xsd", XSD_PRODUCAO);
  });
});

describe("certificado", () => {
  it("extrai CNPJ do titular", () => {
    expect(certificado.documento).toBe("12345678000195");
  });

  it("rejeita senha errada", () => {
    expect(() => lerCertificadoPfx(gerarPfxDeTeste("certa"), "errada")).toThrow(/senha incorreta/);
  });
});

describe("formatos", () => {
  it("converte valores digitados", () => {
    expect(lerValor("1.234,56")).toBe(1234.56);
    expect(lerValor("R$ 5000")).toBe(5000);
    expect(lerValor("99.9")).toBe(99.9);
    expect(lerValor("1,234.56")).toBe(1234.56);
    expect(lerValor("1234,56")).toBe(1234.56);
    expect(lerValor("1.234.567")).toBe(1234567);
  });

  it("formata data/hora em -03:00", () => {
    expect(dataHoraBrasilia(new Date("2026-11-02T15:00:00Z"))).toBe("2026-11-02T12:00:00-03:00");
  });

  it("aplica modelo de descrição", () => {
    expect(aplicarModeloDescricao("Serviços prestados em {competencia}", { competencia: "2026-11-01" })).toBe("Serviços prestados em novembro/2026");
    expect(aplicarModeloDescricao("SUPORTE {mesAnoAnterior} ({mesAno})", { competencia: "2026-01-05" })).toBe("SUPORTE 12/2025 (01/2026)");
    expect(
      aplicarModeloDescricao("Total {valorMoeda} {moeda} x {cotacao} (PTAX {dataCotacao}) = {valor} {desconhecida}", {
        competencia: "2026-10-05",
        valor: 6172.8,
        moeda: "USD",
        valorMoeda: 1234.56,
        cotacao: 5,
        dataCotacao: "2026-10-05",
      }),
    ).toBe("Total 1,234.56 USD x 5,00 (PTAX 05/10/2026) = 6.172,80 {desconhecida}");
  });
});
