"use client";

import { useActionState, useState } from "react";
import { Campo, Selecao } from "@/components/campos";
import type { Emitente } from "@/db/schema";
import { salvarEmitenteAction } from "../actions";

export function FormEmitente({ emitente: e }: { emitente?: Emitente }) {
  const [estado, acao, salvando] = useActionState(salvarEmitenteAction, {});
  const [opSimpNac, setOpSimpNac] = useState(e?.opSimpNac ?? "3");

  return (
    <form action={acao} className="space-y-8">
      <section className="space-y-4">
        <h2 className="font-semibold">Empresa</h2>
        <div className="grid gap-4 sm:grid-cols-[220px_1fr]">
          <Campo nome="cnpj" rotulo="CNPJ" padrao={e?.cnpj} required />
          <Campo nome="razaoSocial" rotulo="Razão social" padrao={e?.razaoSocial} required />
        </div>
        <div className="grid gap-4 sm:grid-cols-4">
          <Campo nome="codMunicipio" rotulo="Município (IBGE)" padrao={e?.codMunicipio} required pattern="\d{7}" ajuda="7 dígitos, ex.: 3550308" />
          <Campo nome="inscricaoMunicipal" rotulo="Inscrição municipal" padrao={e?.inscricaoMunicipal} ajuda="Deixe vazio se o portal não usa" />
          <Campo nome="fone" rotulo="Telefone" padrao={e?.fone} />
          <Campo nome="email" rotulo="E-mail" padrao={e?.email} type="email" />
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="font-semibold">Regime tributário</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <Selecao
            nome="opSimpNac"
            rotulo="Situação no Simples Nacional"
            padrao={opSimpNac}
            onChange={setOpSimpNac}
            opcoes={[
              ["1", "Não optante"],
              ["2", "MEI"],
              ["3", "ME/EPP"],
            ]}
          />
          {opSimpNac === "3" && (
            <Selecao
              nome="regApTribSN"
              rotulo="Regime de apuração"
              padrao={e?.regApTribSN ?? "1"}
              opcoes={[
                ["1", "Federais e ISS pelo SN"],
                ["2", "Federais pelo SN, ISS por fora"],
                ["3", "Federais e ISS por fora do SN"],
              ]}
            />
          )}
          <Selecao
            nome="regEspTrib"
            rotulo="Regime especial"
            padrao={e?.regEspTrib ?? "0"}
            opcoes={[
              ["0", "Nenhum"],
              ["1", "Ato cooperado"],
              ["2", "Estimativa"],
              ["3", "Microempresa municipal"],
              ["4", "Notário ou registrador"],
              ["5", "Profissional autônomo"],
              ["6", "Sociedade de profissionais"],
            ]}
          />
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="font-semibold">Numeração da DPS</h2>
        <div className="grid gap-4 sm:grid-cols-4">
          <Campo nome="serie" rotulo="Série" padrao={e?.serie ?? "1"} required pattern="\d{1,5}" ajuda="Diferente da série do portal (70000)" />
          <Campo nome="proximoNumero" rotulo="Próximo número" padrao={String(e?.proximoNumero ?? 1)} required type="number" min={1} />
        </div>
      </section>

      {estado.erro && <p role="alert" className="alerta-erro">{estado.erro}</p>}
      {estado.ok && <p role="status" className="alerta-sucesso">{estado.ok}</p>}
      <button className="botao" disabled={salvando}>
        {salvando ? "Salvando…" : "Salvar dados da empresa"}
      </button>
    </form>
  );
}
