import { readFileSync } from "node:fs";
import forge from "node-forge";

export interface Certificado {
  chavePem: string;
  certPem: string;
  /** Demais certificados da cadeia contidos no .pfx (intermediárias). */
  cadeiaPem: string[];
  titular: string;
  documento: string | null; // CNPJ extraído do CN (formato ICP-Brasil "RAZAO:CNPJ")
  validoAte: Date;
}

export function lerCertificadoPfx(pfx: Buffer, senha: string): Certificado {
  let p12: forge.pkcs12.Pkcs12Pfx;
  try {
    p12 = forge.pkcs12.pkcs12FromAsn1(forge.asn1.fromDer(pfx.toString("binary")), senha);
  } catch (e) {
    throw new Error(`Não foi possível abrir o certificado .pfx (senha incorreta ou formato não suportado): ${(e as Error).message}`);
  }

  const chaves = [
    ...(p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag })[forge.pki.oids.pkcs8ShroudedKeyBag] ?? []),
    ...(p12.getBags({ bagType: forge.pki.oids.keyBag })[forge.pki.oids.keyBag] ?? []),
  ];
  const chave = chaves.find((b) => b.key)?.key as forge.pki.rsa.PrivateKey | undefined;
  if (!chave) throw new Error("O .pfx não contém chave privada.");

  const certs = (p12.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag] ?? [])
    .map((b) => b.cert)
    .filter((c): c is forge.pki.Certificate => !!c);

  // O certificado do titular é o que corresponde à chave privada.
  const modulo = chave.n.toString(16);
  const cert = certs.find((c) => (c.publicKey as forge.pki.rsa.PublicKey).n.toString(16) === modulo);
  if (!cert) throw new Error("Nenhum certificado do .pfx corresponde à chave privada.");

  const cn = String(cert.subject.getField("CN")?.value ?? "");
  const documento = cn.match(/:(\d{14}|[0-9A-Z]{12}\d{2})$/)?.[1] ?? null;

  return {
    chavePem: forge.pki.privateKeyToPem(chave),
    certPem: forge.pki.certificateToPem(cert),
    cadeiaPem: certs.filter((c) => c !== cert).map((c) => forge.pki.certificateToPem(c)),
    titular: cn,
    documento,
    validoAte: cert.validity.notAfter,
  };
}

let cache: { chave: string; certificado: Certificado } | null = null;

/** Certificado configurado em CERT_PFX_PATH / CERT_PFX_SENHA (lido uma vez por processo). */
export function certificadoConfigurado(): Certificado {
  const caminho = process.env.CERT_PFX_PATH;
  const senha = process.env.CERT_PFX_SENHA ?? "";
  if (!caminho) throw new Error("Defina CERT_PFX_PATH no .env apontando para o certificado A1 (.pfx).");
  const chave = `${caminho}:${senha}`;
  if (cache?.chave !== chave) {
    cache = { chave, certificado: lerCertificadoPfx(readFileSync(caminho), senha) };
  }
  return cache.certificado;
}
