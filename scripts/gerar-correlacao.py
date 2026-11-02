"""Converte o Anexo VIII (correlação item LC116 x NBS x cIndOp x cClassTrib) em JSON.

Uso: python3 scripts/gerar-correlacao.py docs/oficial/anexo_viii-correlacao-20261026.xlsx src/data/correlacao.json
Requer openpyxl.
"""
import json
import sys

import openpyxl


def texto(v):
    return str(v).strip() if v is not None else ""


def main(origem, destino):
    ws = openpyxl.load_workbook(origem, read_only=True, data_only=True)["tabela geral"]
    itens = {}
    atual = None
    for i, row in enumerate(ws.iter_rows(values_only=True)):
        if i == 0:
            continue
        item, desc, nbs, desc_nbs, atv_sn, _, indop, local, cclass, nome_cclass = (list(row) + [None] * 10)[:10]
        if item:
            atual = itens.setdefault(texto(item), {
                "item": texto(item),
                "descricao": texto(desc),
                "nbs": [],
                "cAtvSN": None,
                "cIndOp": None,
                "localIncidencia": None,
                "cClassTrib": [],
            })
        if atual is None:
            continue
        if nbs:
            codigo = texto(nbs).replace(".", "")
            if codigo not in [n["codigo"] for n in atual["nbs"]]:
                atual["nbs"].append({"codigo": codigo, "descricao": texto(desc_nbs)})
        if atv_sn and not atual["cAtvSN"] and texto(atv_sn).isdigit():
            atual["cAtvSN"] = texto(atv_sn) if texto(atv_sn).isdigit() else None
        if indop and not atual["cIndOp"] and texto(indop).isdigit():
            atual["cIndOp"] = texto(indop).zfill(6) if texto(indop).isdigit() else None
            atual["localIncidencia"] = texto(local)
        if cclass:
            codigo = texto(cclass).zfill(6)
            if codigo not in [c["codigo"] for c in atual["cClassTrib"]]:
                atual["cClassTrib"].append({"codigo": codigo, "nome": texto(nome_cclass)})
    with open(destino, "w", encoding="utf-8") as f:
        json.dump(list(itens.values()), f, ensure_ascii=False, indent=1)
    print(f"{len(itens)} itens gravados em {destino}")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
