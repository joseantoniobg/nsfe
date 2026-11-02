# Emissor NFS-e (padrão nacional)

Emissão de NFS-e direto na API oficial da **Sefin Nacional** (a mesma que está por trás do Emissor Nacional em nfse.gov.br), para prestador **optante pelo Simples Nacional**. Os dados fiscais ficam configurados uma vez; para emitir, basta **escolher o cliente e o valor**.

## Como funciona

1. Monta a DPS (Declaração de Prestação de Serviço) no leiaute **v1.01**, já com o grupo **IBSCBS** da reforma tributária.
2. Assina o XML com o seu **certificado A1** (XMLDSig).
3. Envia a DPS compactada (gzip + base64) para `POST /SefinNacional/nfse` com autenticação mútua TLS (mTLS) usando o mesmo certificado.
4. Guarda o XML da NFS-e autorizada e gera o **PDF (DANFSe)** localmente. A API oficial de DANFSe foi desativada em 08/2026.

A DPS é gravada no banco **antes** do envio. Se a conexão cair no meio, a nota fica como "pendente" e o botão *Verificar na Sefin / reenviar* consulta `GET /dps/{id}`: se a nota já tiver sido gerada, ele baixa; se não, reenvia a mesma DPS. Assim não há risco de nota em duplicidade.

## Instalação

```bash
pnpm install
cp .env.example .env              # ajuste caminho/senha do certificado
mkdir certs && cp ~/caminho/seu-certificado.pfx certs/certificado.pfx
pnpm db:up                        # Postgres no Docker (porta 5433)
pnpm db:migrate
pnpm dev                          # http://localhost:3000
```

## Primeiro uso

1. **Configuração → Importar notas do Emissor Nacional**: no portal, baixe o XML de uma ou mais notas que você já emitiu e importe-as aqui. A nota mais recente preenche a configuração fiscal (códigos que o portal já aceitou) e os tomadores viram clientes.
2. Revise a configuração, principalmente:
   - **Descrição padrão**: aceita `{competencia}` (ex.: "novembro/2026"), `{mes}` e `{ano}`.
   - **IBS/CBS (cIndOp e cClassTrib)**: a tela sugere valores com base no Anexo VIII oficial, a partir do seu código de serviço. **Confirme com seu contador.**
   - **Série**: use uma série exclusiva deste sistema (ex.: `1`) para não colidir com a numeração do portal.
3. Mantenha `NFSE_AMBIENTE=2` (Produção Restrita) e emita algumas notas de teste. Elas não têm valor fiscal e o PDF sai com a marca "SEM VALOR FISCAL".
4. Quando estiver tudo certo, troque para `NFSE_AMBIENTE=1` e reinicie.

## Perfis de serviço e exportação

Os dados fiscais (código do serviço, local da prestação, ISS, PIS/COFINS, IBS/CBS) ficam em **perfis de serviço**, e cada cliente aponta para um perfil. A importação cria um perfil para cada tipo de nota encontrado.

Perfil marcado como **exportação**: o cliente é estrangeiro (país + NIF) e o valor da emissão é digitado na moeda estrangeira. O sistema busca a PTAX de fechamento do Banco Central na data de competência (ou no último dia útil anterior), trunca nas casas configuradas e converte para reais. A cotação pode ser informada manualmente em "Opções".

Variáveis da descrição: `{competencia}`, `{mes}`, `{ano}`, `{mesAno}`, `{mesAnoAnterior}`, `{valor}`, `{valorMoeda}`, `{moeda}`, `{cotacao}`, `{dataCotacao}`.

## Variáveis de ambiente

| Variável | Descrição |
|---|---|
| `DATABASE_URL` | Conexão Postgres |
| `CERT_PFX_PATH` / `CERT_PFX_SENHA` | Certificado A1 (.pfx) e senha |
| `NFSE_AMBIENTE` | `2` = Produção Restrita, `1` = Produção |
| `NFSE_LEIAUTE` | (opcional) `atual` ou `nt009`. Por padrão, produção usa `atual` e Produção Restrita usa `nt009`; defina `nt009` quando a produção migrar |
| `NFSE_CA_PATH` | (opcional) CA extra para validar o servidor da Sefin, se o Node não confiar na cadeia |
| `NFSE_ASSINATURA` | (opcional) `sha256` para assinar com RSA-SHA256 em vez de RSA-SHA1 |
| `NFSE_URL_SEFIN` | (opcional) URL alternativa da API, para testes |

## Testes

```bash
pnpm test
```

Os testes validam a DPS e o pedido de cancelamento contra os **XSD oficiais** (em `docs/oficial/xsd-producao` e `docs/oficial/xsd-restrita`, precisa do `xmllint`), conferem a assinatura e testam o cliente HTTP contra um servidor falso que exige certificado de cliente (mTLS).

## Estrutura

```
src/lib/nfse/       núcleo independente do Next
  dps.ts            monta DPS e pedido de cancelamento
  assinatura.ts     XMLDSig
  certificado.ts    leitura do .pfx
  sefin.ts          cliente HTTP (mTLS) da Sefin Nacional
  leitura.ts        lê XML de NFS-e (API ou portal)
  danfse.ts         PDF
  correlacao.ts     sugestões do Anexo VIII (item LC 116 → NBS, cIndOp, cClassTrib)
src/lib/notas.ts    fluxo de emissão / reprocessamento / cancelamento
src/app/            telas e server actions
docs/oficial/       XSDs, notas técnicas e anexos baixados de gov.br/nfse
```

Para atualizar a tabela de correlação quando sair um novo Anexo VIII:
`python3 scripts/gerar-correlacao.py <anexo.xlsx> src/data/correlacao.json` (requer `openpyxl`).

## Atenção: leiaute em mudança

O leiaute da NFS-e está mudando por causa da reforma tributária (NT 004 a NT 009). Os XSDs em `docs/oficial/xsd-producao` e `docs/oficial/xsd-restrita` são os da Produção Restrita de 20/10/2026. A NT 009 já anuncia mudanças que ainda não estão nesses XSDs, como `indDest` mudando de lugar e os novos `regApIBSCBSSN` e `cAtvSN`. Se a Sefin começar a rejeitar com erro de schema, compare com a documentação mais recente em https://www.gov.br/nfse/pt-br/biblioteca/documentacao-tecnica e ajuste `src/lib/nfse/dps.ts`.
