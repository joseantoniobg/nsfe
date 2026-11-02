"use client";

import { useActionState, useState } from "react";
import { Campo, Selecao } from "@/components/campos";
import type { Servico } from "@/db/schema";
import type { ItemCorrelacao } from "@/lib/nfse/correlacao";
import { VARIAVEIS_DESCRICAO } from "@/lib/nfse/formatos";
import { salvarServicoAction } from "../../actions";

export function FormServico({ servico: s, correlacao }: { servico?: Servico; correlacao: ItemCorrelacao[] }) {
  const [estado, acao, salvando] = useActionState(salvarServicoAction, {});
  const [cTribNac, setCTribNac] = useState(s?.cTribNac ?? "");
  const [exportacao, setExportacao] = useState(!!s?.comExt);
  const item = cTribNac.length >= 4 ? correlacao.find((i) => i.item === `${cTribNac.slice(0, 2)}.${cTribNac.slice(2, 4)}`) : undefined;
  const c = s?.comExt;

  return (
    <form action={acao} className="space-y-8">
      {s && <input type="hidden" name="id" value={s.id} />}
      <section className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end">
          <Campo nome="nome" rotulo="Nome do perfil" padrao={s?.nome} required placeholder="Ex.: Suporte (Brasil)" />
          <label className="flex items-center gap-2 pb-2 text-sm">
            <input
              type="checkbox"
              className="size-4 accent-primaria"
              name="exportacao"
              checked={exportacao}
              onChange={(ev) => setExportacao(ev.target.checked)}
            />{" "}
            Exportação de serviço
          </label>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="font-semibold">Serviço</h2>
        <div className="grid gap-4 sm:grid-cols-4">
          <div>
            <label className="rotulo" htmlFor="cTribNac">
              Código de tributação nacional
            </label>
            <input
              id="cTribNac"
              name="cTribNac"
              className="campo"
              required
              pattern="\d{6}"
              value={cTribNac}
              onChange={(ev) => setCTribNac(ev.target.value.replace(/\D/g, "").slice(0, 6))}
            />
            <p className="ajuda">{item ? `${item.item} - ${item.descricao}` : "6 dígitos, ex.: 010101"}</p>
          </div>
          <Campo nome="cTribMun" rotulo="Código municipal" padrao={s?.cTribMun} ajuda="Opcional" />
          <div>
            <label className="rotulo" htmlFor="cNBS">
              Código NBS
            </label>
            <input id="cNBS" name="cNBS" className="campo" list="lista-nbs" defaultValue={s?.cNBS ?? ""} />
            <datalist id="lista-nbs">
              {item?.nbs.map((n) => (
                <option key={n.codigo} value={n.codigo}>
                  {n.descricao}
                </option>
              ))}
            </datalist>
            <p className="ajuda">{item ? `${item.nbs.length} sugestão(ões); ` : ""}obrigatório com IBS/CBS</p>
          </div>
          <Campo
            nome="cLocPrestacao"
            rotulo="Município da prestação"
            padrao={s?.cLocPrestacao}
            pattern="\d{7}"
            ajuda="IBGE. Vazio = município da empresa"
          />
        </div>
        <div>
          <label className="rotulo" htmlFor="descricaoPadrao">
            Descrição padrão
          </label>
          <textarea id="descricaoPadrao" name="descricaoPadrao" required rows={3} className="campo" defaultValue={s?.descricaoPadrao ?? ""} />
          <p className="ajuda">Variáveis: {VARIAVEIS_DESCRICAO}</p>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="font-semibold">Tributos</h2>
        <div className="grid gap-4 sm:grid-cols-4">
          {exportacao ? (
            <div>
              <span className="rotulo">Tributação do ISSQN</span>
              <p className="campo bg-sutil">3 - Exportação</p>
            </div>
          ) : (
            <Selecao
              nome="tribISSQN"
              rotulo="Tributação do ISSQN"
              padrao={s?.tribISSQN === "3" ? "1" : (s?.tribISSQN ?? "1")}
              opcoes={[
                ["1", "Tributável"],
                ["2", "Imunidade"],
                ["4", "Não incidência"],
              ]}
            />
          )}
          <Selecao
            nome="tpRetISSQN"
            rotulo="Retenção do ISSQN"
            padrao={s?.tpRetISSQN ?? "1"}
            opcoes={[
              ["1", "Não retido"],
              ["2", "Retido pelo tomador"],
              ["3", "Retido pelo intermediário"],
            ]}
          />
          <Campo nome="pAliq" rotulo="Alíquota ISSQN (%)" padrao={s?.pAliq} inputMode="decimal" ajuda="Vazio se o portal não pede" />
          <Campo nome="pTotTribSN" rotulo="Tributos aprox. do SN (%)" padrao={s?.pTotTribSN} inputMode="decimal" ajuda="Vazio = não informar" />
        </div>
        <div className="grid gap-4 sm:grid-cols-4">
          <Selecao
            nome="cstPisCofins"
            rotulo="PIS/COFINS (CST)"
            padrao={s?.cstPisCofins ?? ""}
            mostrarCodigo={false}
            opcoes={[
              ["", "Não informar"],
              ["00", "00 - Nenhum (Simples)"],
            ]}
          />
          <Selecao
            nome="tpRetPisCofins"
            rotulo="Retenção PIS/COFINS"
            padrao={s?.tpRetPisCofins ?? "0"}
            opcoes={[
              ["0", "Sem retenção"],
              ["1", "Retido"],
            ]}
          />
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="font-semibold">Reforma tributária (IBS/CBS)</h2>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" className="size-4 accent-primaria" name="ibscbsAtivo" defaultChecked={s?.ibscbsAtivo ?? true} /> Enviar grupo IBSCBS na DPS
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Campo
              nome="cIndOp"
              rotulo="Indicador da operação (cIndOp)"
              padrao={s ? s.cIndOp : exportacao ? "100302" : item?.cIndOp}
              pattern="\d{6}"
              key={`indop-${exportacao}`}
            />
            <p className="ajuda">
              {exportacao
                ? "Exportação: 100302 (adquirente no exterior). Obrigatório em produção; na NT 009 é omitido para CST 410."
                : item?.cIndOp && `Sugestão do Anexo VIII: ${item.cIndOp} (${item.localIncidencia})`}
            </p>
          </div>
          <div>
            <label className="rotulo" htmlFor="cClassTrib">
              Classificação tributária (cClassTrib)
            </label>
            <input
              key={`cclass-${exportacao}`}
              id="cClassTrib"
              name="cClassTrib"
              className="campo"
              list="lista-cclass"
              pattern="\d{6}"
              defaultValue={s?.cClassTrib ?? (exportacao ? "410004" : (item?.cClassTrib[0]?.codigo ?? ""))}
            />
            <datalist id="lista-cclass">
              {exportacao && <option value="410004">Exportação de serviços (CST 410 - imunidade)</option>}
              {item?.cClassTrib.map((cc) => (
                <option key={cc.codigo} value={cc.codigo}>
                  {cc.nome}
                </option>
              ))}
            </datalist>
            <p className="ajuda">CST = 3 primeiros dígitos. Confirme com seu contador.</p>
          </div>
        </div>
      </section>

      {exportacao && (
        <section className="space-y-4">
          <h2 className="font-semibold">Comércio exterior</h2>
          <div className="grid gap-4 sm:grid-cols-4">
            <Campo nome="moeda" rotulo="Moeda (sigla)" padrao={c?.moeda ?? "USD"} required ajuda="Usada para buscar a PTAX" />
            <Campo nome="tpMoeda" rotulo="Código da moeda" padrao={c?.tpMoeda ?? "840"} required ajuda="O portal usa 840 para USD" />
            <Selecao
              nome="tipoCotacao"
              rotulo="PTAX"
              padrao={c?.cotacao ?? "compra"}
              mostrarCodigo={false}
              opcoes={[
                ["compra", "Compra"],
                ["venda", "Venda"],
              ]}
              ajuda="Da data de competência"
            />
            <Campo nome="casasCotacao" rotulo="Casas decimais da cotação" padrao={String(c?.casasCotacao ?? 2)} type="number" min={2} max={6} ajuda="Truncada (4,9853 → 4,98)" />
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <Selecao
              nome="mdPrestacao"
              rotulo="Modo de prestação"
              padrao={c?.mdPrestacao ?? "1"}
              opcoes={[
                ["1", "Transfronteiriço"],
                ["2", "Consumo no Brasil"],
                ["3", "Presença comercial no exterior"],
                ["4", "Movimento temporário de PF"],
              ]}
            />
            <Selecao
              nome="vincPrest"
              rotulo="Vínculo com o tomador"
              padrao={c?.vincPrest ?? "0"}
              opcoes={[
                ["0", "Sem vínculo"],
                ["1", "Controlada"],
                ["2", "Controladora"],
                ["3", "Coligada"],
                ["4", "Matriz"],
                ["5", "Filial ou sucursal"],
                ["6", "Outro vínculo"],
              ]}
            />
            <Selecao
              nome="movTempBens"
              rotulo="Movimentação temporária de bens"
              padrao={c?.movTempBens ?? "1"}
              opcoes={[
                ["1", "Não"],
                ["2", "Vinculada a DI"],
                ["3", "Vinculada a DE"],
              ]}
            />
            <Campo nome="mecAFComexP" rotulo="Mecanismo de apoio (prestador)" padrao={c?.mecAFComexP ?? "01"} ajuda="01 = Nenhum" />
            <Campo nome="mecAFComexT" rotulo="Mecanismo de apoio (tomador)" padrao={c?.mecAFComexT ?? "01"} ajuda="01 = Nenhum" />
            <Selecao
              nome="mdic"
              rotulo="Compartilhar com MDIC"
              padrao={c?.mdic ?? "0"}
              opcoes={[
                ["0", "Não enviar"],
                ["1", "Enviar"],
              ]}
            />
          </div>
        </section>
      )}

      {estado.erro && <p role="alert" className="alerta-erro">{estado.erro}</p>}
      <button className="botao" disabled={salvando}>
        {salvando ? "Salvando…" : "Salvar perfil"}
      </button>
    </form>
  );
}
