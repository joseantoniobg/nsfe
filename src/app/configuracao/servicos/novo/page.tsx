import { listarItensServico } from "@/lib/nfse/correlacao";
import { FormServico } from "../form-servico";

export default function Page() {
  return (
    <div className="cartao">
      <h1 className="mb-5 text-lg font-semibold">Novo perfil de serviço</h1>
      <FormServico correlacao={listarItensServico()} />
    </div>
  );
}
