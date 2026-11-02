import { mkdtempSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:https";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import type { TLSSocket } from "node:tls";
import forge from "node-forge";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { assinarXml } from "@/lib/nfse/assinatura";
import { lerCertificadoPfx, type Certificado } from "@/lib/nfse/certificado";
import { montarDps } from "@/lib/nfse/dps";
import { lerNfse } from "@/lib/nfse/leitura";
import { compactarXml, consultarChavePorDps, descompactarXml, enviarDps } from "@/lib/nfse/sefin";

/** Gera par chave/certificado autoassinado; usado tanto pelo "contribuinte" quanto pelo servidor falso. */
function gerarCert(cn: string, altNames?: { type: number; ip?: string; value?: string }[]) {
  const chaves = forge.pki.rsa.generateKeyPair(2048);
  const cert = forge.pki.createCertificate();
  cert.publicKey = chaves.publicKey;
  cert.serialNumber = String(Date.now());
  cert.validity.notBefore = new Date(Date.now() - 60_000);
  cert.validity.notAfter = new Date(Date.now() + 86_400_000);
  cert.setSubject([{ name: "commonName", value: cn }]);
  cert.setIssuer([{ name: "commonName", value: cn }]);
  if (altNames) cert.setExtensions([{ name: "subjectAltName", altNames }]);
  cert.sign(chaves.privateKey, forge.md.sha256.create());
  return { chaves, cert, certPem: forge.pki.certificateToPem(cert), chavePem: forge.pki.privateKeyToPem(chaves.privateKey) };
}

const CHAVE = "355030821234567800019500000000000000126110000000001".slice(0, 50);

const NFSE_FALSA = (dpsAssinada: string) =>
  `<?xml version="1.0" encoding="UTF-8"?><NFSe xmlns="http://www.sped.fazenda.gov.br/nfse" versao="1.01"><infNFSe Id="NFS${CHAVE}">` +
  `<xLocEmi>São Paulo</xLocEmi><nNFSe>123</nNFSe><dhProc>2026-11-02T10:00:00-03:00</dhProc>` +
  `<emit><CNPJ>12345678000195</CNPJ><xNome>EMPRESA TESTE LTDA</xNome></emit>` +
  `<valores><vLiq>5000.00</vLiq></valores>` +
  dpsAssinada.replace(/^<\?xml[^>]*\?>/, "") +
  `</infNFSe></NFSe>`;

describe("cliente Sefin (servidor falso com mTLS)", () => {
  let servidor: Server;
  let contribuinte: Certificado;
  const recebidos: { metodo: string; caminho: string; corpo: string; certCliente?: string }[] = [];

  beforeAll(async () => {
    const c = gerarCert("EMPRESA TESTE LTDA:12345678000195");
    const p12 = forge.pkcs12.toPkcs12Asn1(c.chaves.privateKey, [c.cert], "x", { algorithm: "3des" });
    contribuinte = lerCertificadoPfx(Buffer.from(forge.asn1.toDer(p12).getBytes(), "binary"), "x");

    const srv = gerarCert("localhost", [{ type: 7, ip: "127.0.0.1" }]);
    servidor = createServer(
      { key: srv.chavePem, cert: srv.certPem, requestCert: true, rejectUnauthorized: true, ca: [c.certPem] },
      (req, res) => {
        let corpo = "";
        req.on("data", (p) => (corpo += p));
        req.on("end", () => {
          const certCliente = String((req.socket as TLSSocket).getPeerCertificate().subject?.CN);
          recebidos.push({ metodo: req.method!, caminho: req.url!, corpo, certCliente });
          res.setHeader("Content-Type", "application/json");
          if (req.method === "POST" && req.url === "/nfse") {
            const xml = descompactarXml(JSON.parse(corpo).dpsXmlGZipB64);
            if (xml.includes("<vServ>0.01</vServ>")) {
              res.statusCode = 400;
              return res.end(JSON.stringify({ erros: [{ Codigo: "E0310", Descricao: "Valor inválido", Complemento: "teste" }] }));
            }
            res.statusCode = 201;
            return res.end(JSON.stringify({ chaveAcesso: CHAVE, nfseXmlGZipB64: compactarXml(NFSE_FALSA(xml)), alertas: [] }));
          }
          if (req.method === "GET" && req.url?.startsWith("/dps/")) {
            res.statusCode = 404;
            return res.end(JSON.stringify({ erro: { codigo: "E404", descricao: "DPS não encontrada" } }));
          }
          res.statusCode = 404;
          res.end("{}");
        });
      },
    );
    await new Promise<void>((r) => servidor.listen(0, "127.0.0.1", r));
    process.env.NFSE_URL_SEFIN = `https://127.0.0.1:${(servidor.address() as AddressInfo).port}`;
    // O cliente precisa confiar no certificado do servidor falso.
    const caminhoCa = path.join(mkdtempSync(path.join(tmpdir(), "sefin-")), "ca.pem");
    writeFileSync(caminhoCa, srv.certPem);
    process.env.NFSE_CA_PATH = caminhoCa;
  });

  afterAll(() => {
    servidor?.close();
    delete process.env.NFSE_URL_SEFIN;
    delete process.env.NFSE_CA_PATH;
  });

  const dps = (valor: number) =>
    assinarXml(
      montarDps({
        ambiente: "2",
        serie: "1",
        numero: 7,
        valor,
        descricao: "Teste",
        competencia: "2026-11-02",
        prestador: {
          cnpj: "12345678000195",
          codMunicipio: "3550308",
          opSimpNac: "3",
          regApTribSN: "1",
          regEspTrib: "0",
        },
        servico: {
          cTribNac: "010101",
          tribISSQN: "1",
          tpRetISSQN: "1",
          ibscbsAtivo: true,
          cIndOp: "100301",
          cClassTrib: "000001",
        },
        tomador: { documento: "11222333000181", nome: "Cliente" },
      }).xml,
      "infDPS",
      contribuinte,
    );

  it("envia a DPS compactada, autenticando com o certificado, e lê a NFS-e", async () => {
    const r = await enviarDps("2", contribuinte, dps(5000));
    expect(r.tipo).toBe("autorizada");
    if (r.tipo !== "autorizada") return;
    expect(r.chaveAcesso).toBe(CHAVE);
    const lida = lerNfse(r.xmlNfse);
    expect(lida.numero).toBe("123");
    expect(lida.dps.cTribNac).toBe("010101");
    expect(lida.tomador.nome).toBe("Cliente");
    expect(recebidos.at(-1)?.certCliente).toBe("EMPRESA TESTE LTDA:12345678000195");
  });

  it("traduz rejeição em lista de erros", async () => {
    const r = await enviarDps("2", contribuinte, dps(0.01));
    expect(r).toEqual({ tipo: "rejeitada", erros: [{ codigo: "E0310", descricao: "Valor inválido", complemento: "teste" }] });
  });

  it("consulta DPS inexistente retorna null", async () => {
    expect(await consultarChavePorDps("2", contribuinte, "DPS123")).toBeNull();
  });
});
