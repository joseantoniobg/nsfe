import { Voltar } from "@/components/voltar";
import { listarItensServico } from "@/lib/nfse/correlacao";
import { FormServico } from "../form-servico";

export default function Page() {
  return (
    <>
      <Voltar href="/configuracao" rotulo="Configuração" />
      <div className="cartao">
        <h1 className="mb-5 text-lg font-semibold">Novo perfil de serviço</h1>
        <FormServico correlacao={listarItensServico()} />
      </div>
    </>
  );
}
