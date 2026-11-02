"""Converte o Anexo A (municípios IBGE e países ISO2) em JSON para o DANFSe.

Uso: python3 scripts/gerar-localidades.py docs/oficial/anexo_a-municipios-paises.xlsx src/data/localidades.json
Requer openpyxl.
"""
import json
import sys

import openpyxl


# Os 2 primeiros dígitos do código IBGE do município identificam a UF.
UF_POR_CODIGO = {
    "11": "RO", "12": "AC", "13": "AM", "14": "RR", "15": "PA", "16": "AP", "17": "TO",
    "21": "MA", "22": "PI", "23": "CE", "24": "RN", "25": "PB", "26": "PE", "27": "AL", "28": "SE", "29": "BA",
    "31": "MG", "32": "ES", "33": "RJ", "35": "SP", "41": "PR", "42": "SC", "43": "RS",
    "50": "MS", "51": "MT", "52": "GO", "53": "DF",
}


def main(origem, destino):
    wb = openpyxl.load_workbook(origem, read_only=True, data_only=True)
    municipios = {}
    for i, (_, _, nome, codigo) in enumerate(wb["TAB.MUN_IBGE"].iter_rows(values_only=True, max_col=4)):
        if i and codigo:
            codigo = str(codigo).zfill(7)
            municipios[codigo] = [nome, UF_POR_CODIGO[codigo[:2]]]
    paises = {r[0]: r[1] for i, r in enumerate(wb["TAB.PAÍS_ISO2"].iter_rows(values_only=True, max_col=2)) if i and r[0]}
    with open(destino, "w", encoding="utf-8") as f:
        json.dump({"municipios": municipios, "paises": paises}, f, ensure_ascii=False, separators=(",", ":"))
    print(f"{len(municipios)} municípios e {len(paises)} países gravados em {destino}")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
