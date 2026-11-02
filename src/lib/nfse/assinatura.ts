import { SignedXml } from "xml-crypto";
import type { Certificado } from "./certificado";

const C14N = "http://www.w3.org/TR/2001/REC-xml-c14n-20010315";
const ENVELOPED = "http://www.w3.org/2000/09/xmldsig#enveloped-signature";

// Padrão XMLDSig dos DF-e (NF-e/NFS-e): RSA-SHA1. Pode ser trocado por SHA-256 via NFSE_ASSINATURA=sha256.
const ALGORITMOS = {
  sha1: {
    assinatura: "http://www.w3.org/2000/09/xmldsig#rsa-sha1",
    digest: "http://www.w3.org/2000/09/xmldsig#sha1",
  },
  sha256: {
    assinatura: "http://www.w3.org/2001/04/xmldsig-more#rsa-sha256",
    digest: "http://www.w3.org/2001/04/xmlenc#sha256",
  },
} as const;

/**
 * Assina o elemento `elemento` (infDPS ou infPedReg) com assinatura enveloped,
 * inserindo <Signature> logo após ele, como irmão, dentro do elemento raiz.
 */
export function assinarXml(xml: string, elemento: "infDPS" | "infPedReg", cert: Certificado): string {
  const alg = ALGORITMOS[process.env.NFSE_ASSINATURA === "sha256" ? "sha256" : "sha1"];
  const xpath = `//*[local-name(.)='${elemento}']`;

  const sig = new SignedXml({
    privateKey: cert.chavePem,
    publicCert: cert.certPem,
    signatureAlgorithm: alg.assinatura,
    canonicalizationAlgorithm: C14N,
  });
  sig.addReference({ xpath, transforms: [ENVELOPED, C14N], digestAlgorithm: alg.digest });
  sig.computeSignature(xml, { location: { reference: xpath, action: "after" } });
  return sig.getSignedXml();
}
