"use client";

export function Campo(props: { nome: string; rotulo: string; ajuda?: React.ReactNode; padrao?: string | null } & React.InputHTMLAttributes<HTMLInputElement>) {
  const { nome, rotulo, ajuda, padrao, ...resto } = props;
  return (
    <div>
      <label className="rotulo" htmlFor={nome}>
        {rotulo}
      </label>
      <input id={nome} name={nome} className="campo" defaultValue={padrao ?? ""} {...resto} />
      {ajuda && <p className="ajuda">{ajuda}</p>}
    </div>
  );
}

export function Selecao(props: {
  nome: string;
  rotulo: string;
  padrao: string;
  opcoes: [string, string][];
  ajuda?: string;
  mostrarCodigo?: boolean;
  onChange?: (v: string) => void;
}) {
  return (
    <div>
      <label className="rotulo" htmlFor={props.nome}>
        {props.rotulo}
      </label>
      <select id={props.nome} name={props.nome} className="campo" defaultValue={props.padrao} onChange={(e) => props.onChange?.(e.target.value)}>
        {props.opcoes.map(([v, r]) => (
          <option key={v} value={v}>
            {props.mostrarCodigo === false ? r : `${v} - ${r}`}
          </option>
        ))}
      </select>
      {props.ajuda && <p className="ajuda">{props.ajuda}</p>}
    </div>
  );
}
