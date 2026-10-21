#!/usr/bin/env python3
"""Rebuild the offline catalog from the official USDA SR Legacy ASCII release.

Python 3.9+, standard library only. Run from any directory:
    python scripts/import-usda.py
    python scripts/import-usda.py --archive /path/to/SR-Leg_ASC.zip

The archive is cached in the operating system temporary directory. The SHA-256
pin prevents an unnoticed upstream change from silently changing diary values.
"""

import argparse
import csv
import hashlib
import io
import json
import math
from pathlib import Path
import tempfile
import urllib.request
import zipfile

ARCHIVE_URL = "https://www.ars.usda.gov/ARSUserFiles/80400525/Data/SR-Legacy/SR-Leg_ASC.zip"
ARCHIVE_SHA256 = "79705f75a7306d0910ad16dd4d66a5caf602dad528b99b77c7a510bfaf3d6e14"
SMAE_URL = "https://fisiologia.facmed.unam.mx/wp-content/uploads/2019/02/2-Valoraci%C3%B3n-nutricional-Anexos.pdf"
PROJECT = Path(__file__).resolve().parents[1]

# Public-domain USDA nutrient codes. Vitamin A uses RAE, folate uses DFE.
# These are not IU, folic acid, or total folate: their units are not interchangeable.
NUTRIENTS = {
    "kcal": "208",
    "protein": "203",
    "carbs": "205",
    "fat": "204",
    "fiber": "291",
    "calcium": "301",
    "iron": "303",
    "magnesium": "304",
    "potassium": "306",
    "sodium": "307",
    "zinc": "309",
    "vitaminA": "320",
    "vitaminC": "401",
    "vitaminD": "328",
    "vitaminB12": "418",
    "folate": "435",
}

UNITS = {
    "kcal": "kcal",
    **{key: "g" for key in ("protein", "carbs", "fat", "fiber")},
    **{key: "mg" for key in ("calcium", "iron", "magnesium", "potassium", "sodium", "zinc", "vitaminC")},
    "vitaminA": "µg RAE",
    "vitaminD": "µg",
    "vitaminB12": "µg",
    "folate": "µg DFE",
}

CEREAL = "Cereales y tubérculos sin grasa"
CEREAL_FAT = "Cereales y tubérculos con grasa"
LEGUME = "Leguminosas"
ANIMAL_VERY_LOW = "Alimentos de origen animal: muy bajo aporte de grasa"
ANIMAL_LOW = "Alimentos de origen animal: bajo aporte de grasa"
ANIMAL_MODERATE = "Alimentos de origen animal: moderado aporte de grasa"
ANIMAL_HIGH = "Alimentos de origen animal: alto aporte de grasa"
MILK_SKIM = "Leche descremada"
MILK_WHOLE = "Leche entera"
FAT = "Aceites y grasas sin proteína"
FAT_PROTEIN = "Aceites y grasas con proteína"
FRUIT = "Frutas"
VEGETABLE = "Verduras"

# Editorial classification for browsing, not a certified SMAE database.
# Tuple: NDB, stable ID, Spanish name, category, preparation, emoji, SMAE group.
# Names preserve the important preparation/fortification distinctions in USDA.
SELECTION = [
    ("18363", "tortilla-maiz", "Tortilla de maíz", "Cereales", "Lista para calentar, sin freír; referencia genérica USDA", "🌮", CEREAL),
    ("18364", "tortilla-harina", "Tortilla de harina", "Cereales", "Refrigerada, lista para calentar; referencia genérica USDA", "🫓", CEREAL_FAT),
    ("20445", "arroz-blanco", "Arroz blanco cocido", "Cereales", "Grano largo, sin enriquecer, cocido sin sal ni aceite", "🍚", CEREAL),
    ("20037", "arroz-integral", "Arroz integral cocido", "Cereales", "Grano largo, cocido", "🍚", CEREAL),
    ("08120", "avena-seca", "Avena en hojuelas seca", "Cereales", "Sin fortificar; pesar antes de cocinar", "🥣", CEREAL),
    ("08121", "avena-cocida", "Avena cocida en agua", "Cereales", "Sin enriquecer, sin sal; pesar ya cocida", "🥣", CEREAL),
    ("18075", "pan-integral", "Pan integral de caja", "Cereales", "Preparación comercial genérica", "🍞", CEREAL),
    ("18029", "pan-frances", "Pan blanco tipo francés", "Cereales", "Referencia genérica; no equivale a todas las recetas de bolillo", "🥖", CEREAL),
    # Regional bread proxy: keep the complete bread, including crumb, with no filling.
    # This is not a measured composition for Puebla's torta de agua recipe.
    ("18029", "torta-agua", "Torta de agua sin relleno (con migajón)", "Cereales", "Pan de agua: sólo pan horneado, corteza y todo el migajón, sin relleno. Estimación con pan blanco tipo francés USDA; la receta y la fortificación pueden variar", "🥖", CEREAL),
    ("20421", "pasta-cocida", "Pasta cocida", "Cereales", "Sin enriquecer, sin sal ni salsa", "🍝", CEREAL),
    ("11367", "papa-cocida", "Papa cocida sin cáscara", "Cereales", "Hervida, sin sal ni aceite", "🥔", CEREAL),
    ("11510", "camote-cocido", "Camote cocido", "Cereales", "Hervido, sin cáscara", "🍠", CEREAL),
    ("11168", "elote-cocido", "Elote amarillo desgranado", "Cereales", "Hervido, escurrido, sin sal", "🌽", CEREAL),
    ("19806", "palomitas-sin-aceite", "Palomitas de maíz sin aceite", "Cereales", "Hechas con aire caliente, sin sal ni aceite; pesar ya reventadas", "🍿", CEREAL),
    ("42259", "palomitas-con-aceite", "Palomitas de maíz con aceite", "Cereales", "Caseras, sin sal; pesar ya reventadas. El aceite de preparación ya está incluido", "🍿", CEREAL_FAT),
    ("16015", "frijol-negro", "Frijol negro cocido", "Leguminosas", "Hervido, sin sal ni manteca", "🫘", LEGUME),
    ("16043", "frijol-pinto", "Frijol pinto cocido", "Leguminosas", "Hervido, sin sal ni manteca", "🫘", LEGUME),
    ("16070", "lentejas", "Lentejas cocidas", "Leguminosas", "Hervidas, sin sal", "🫘", LEGUME),
    ("16057", "garbanzos", "Garbanzos cocidos", "Leguminosas", "Hervidos, sin sal", "🫘", LEGUME),
    ("15236", "salmon-crudo", "Salmón crudo", "Proteínas", "Atlántico de cultivo; pesar antes de cocinar", "🐟", ANIMAL_MODERATE),
    ("15237", "salmon-cocido", "Salmón cocido", "Proteínas", "Atlántico de cultivo, calor seco; sin aceite añadido", "🐟", ANIMAL_MODERATE),
    ("05064", "pechuga-pollo", "Pechuga de pollo cocida", "Proteínas", "Asada, sólo carne, sin piel", "🍗", ANIMAL_VERY_LOW),
    ("05071", "pierna-pollo-cruda-sin-piel", "Pierna de pollo cruda sin piel", "Proteínas", "Pesar sólo carne, sin hueso ni piel, antes de cocinar; no incluye el muslo", "🍗", ANIMAL_LOW),
    ("05073", "pierna-pollo-asada-sin-piel", "Pierna de pollo asada sin piel", "Proteínas", "Pesar sólo carne ya cocida, sin hueso ni piel; no incluye el muslo", "🍗", ANIMAL_LOW),
    ("05069", "pierna-pollo-asada-con-piel", "Pierna de pollo asada con piel", "Proteínas", "Pesar carne y piel ya cocidas, sin hueso; no incluye el muslo", "🍗", ANIMAL_MODERATE),
    ("01129", "huevo-cocido", "Huevo cocido", "Proteínas", "Hervido, pesar sin cáscara", "🥚", ANIMAL_MODERATE),
    ("01124", "clara-huevo", "Clara de huevo", "Proteínas", "Fresca, peso en crudo antes de cocinar", "🥚", ANIMAL_VERY_LOW),
    ("15121", "atun-agua", "Atún en agua", "Proteínas", "Enlatado, sólidos escurridos", "🐟", ANIMAL_VERY_LOW),
    ("15262", "tilapia-cocida", "Tilapia cocida", "Proteínas", "Calor seco, sin aceite añadido", "🐟", ANIMAL_VERY_LOW),
    ("23565", "res-molida", "Carne molida de res 90/10", "Proteínas", "Desmenuzada y cocida en sartén; referencia 90% magra", "🥩", ANIMAL_LOW),
    ("15271", "camaron-cocido", "Camarón cocido", "Proteínas", "Pesar la parte comestible, sin cáscara", "🦐", ANIMAL_VERY_LOW),
    ("01211", "leche-entera", "Leche entera sin fortificar", "Lácteos", "3.25% grasa, sin vitaminas A/D añadidas; pesar en gramos", "🥛", MILK_WHOLE),
    ("01151", "leche-descremada", "Leche descremada sin fortificar", "Lácteos", "Sin vitaminas A/D añadidas; pesar en gramos", "🥛", MILK_SKIM),
    ("01256", "yogur-griego", "Yogur griego natural sin grasa", "Lácteos", "Natural, referencia genérica; revisar etiqueta de la marca", "🥛", MILK_SKIM),
    ("01228", "queso-fresco", "Queso fresco", "Lácteos", "Referencia genérica USDA; contenido de grasa y sal variable", "🧀", ANIMAL_HIGH),
    ("01166", "queso-asadero", "Queso asadero", "Lácteos", "Referencia genérica USDA", "🧀", ANIMAL_HIGH),
    ("09037", "aguacate", "Aguacate", "Grasas", "Crudo, sólo pulpa; sin hueso ni cáscara", "🥑", FAT),
    ("12061", "almendras", "Almendras", "Grasas", "Sin preparación añadida", "🌰", FAT_PROTEIN),
    ("16390", "cacahuates", "Cacahuates tostados", "Grasas", "Tostado seco, sin sal", "🥜", FAT_PROTEIN),
    ("12006", "chia", "Semillas de chía", "Grasas", "Secas", "🌱", FAT_PROTEIN),
    ("12014", "pepitas", "Pepitas de calabaza", "Grasas", "Semilla seca, sin cáscara", "🌱", FAT_PROTEIN),
    ("04053", "aceite-oliva", "Aceite de oliva", "Grasas", "Para cocinar o ensalada; pesar en gramos", "🫒", FAT),
    ("09003", "manzana", "Manzana con cáscara", "Frutas", "Cruda, sin corazón ni semillas", "🍎", FRUIT),
    ("09040", "platano", "Plátano", "Frutas", "Crudo, sin cáscara", "🍌", FRUIT),
    ("09200", "naranja", "Naranja", "Frutas", "Cruda, parte comestible sin cáscara", "🍊", FRUIT),
    ("09226", "papaya", "Papaya", "Frutas", "Cruda, sin cáscara ni semillas", "🍈", FRUIT),
    ("09176", "mango", "Mango", "Frutas", "Crudo, sin cáscara ni hueso", "🥭", FRUIT),
    ("09139", "guayaba", "Guayaba", "Frutas", "Cruda, variedad común", "🍈", FRUIT),
    ("09266", "pina", "Piña", "Frutas", "Cruda, parte comestible", "🍍", FRUIT),
    ("09316", "fresas", "Fresas", "Frutas", "Crudas, sin hojas", "🍓", FRUIT),
    ("09326", "sandia", "Sandía", "Frutas", "Cruda, sólo pulpa", "🍉", FRUIT),
    ("09181", "melon", "Melón cantalupo", "Frutas", "Crudo, sin cáscara ni semillas", "🍈", FRUIT),
    ("09159", "limon", "Limón verde", "Frutas", "Crudo, pulpa; no es jugo concentrado", "🍋", FRUIT),
    ("11963", "nopal-crudo", "Nopal crudo", "Verduras", "Limpio, sin espinas", "🌵", VEGETABLE),
    ("11964", "nopal-cocido", "Nopal cocido", "Verduras", "Cocido sin sal", "🌵", VEGETABLE),
    ("11529", "jitomate", "Jitomate", "Verduras", "Rojo, maduro, crudo", "🍅", VEGETABLE),
    ("11954", "tomate-verde", "Tomate verde", "Verduras", "Tomatillo crudo", "🟢", VEGETABLE),
    ("11282", "cebolla", "Cebolla", "Verduras", "Cruda", "🧅", VEGETABLE),
    ("11603", "jicama", "Jícama", "Verduras", "Cruda, parte comestible sin cáscara", "🥔", VEGETABLE),
    ("11150", "chayote", "Chayote cocido", "Verduras", "Hervido, escurrido, sin sal", "🥒", VEGETABLE),
    ("11478", "calabacita", "Calabacita cocida", "Verduras", "Tipo zucchini, con piel, hervida y escurrida sin sal", "🥒", VEGETABLE),
    ("11124", "zanahoria", "Zanahoria", "Verduras", "Cruda", "🥕", VEGETABLE),
    ("11090", "brocoli", "Brócoli", "Verduras", "Crudo", "🥦", VEGETABLE),
    ("11457", "espinaca", "Espinaca", "Verduras", "Cruda", "🥬", VEGETABLE),
    ("11205", "pepino", "Pepino con cáscara", "Verduras", "Crudo", "🥒", VEGETABLE),
    ("11979", "jalapeno", "Chile jalapeño", "Verduras", "Crudo", "🌶️", VEGETABLE),
]

# Only explicit gram portions from the cited UNAM document, PDF page 4.
# Household portions in the same source are deliberately NOT converted to grams.
EQUIVALENTS = {"pechuga-pollo": 30, "atun-agua": 30}

# UNAM PDF page 2: average per equivalent, never used for per-food micronutrients.
SMAE_AVERAGES = {
    VEGETABLE: (25, 2, 4, 0),
    FRUIT: (60, 0, 15, 0),
    CEREAL: (70, 2, 15, 0),
    CEREAL_FAT: (115, 2, 15, 5),
    LEGUME: (120, 8, 20, 1),
    ANIMAL_VERY_LOW: (40, 7, 0, 1),
    ANIMAL_LOW: (55, 7, 0, 3),
    ANIMAL_MODERATE: (75, 7, 0, 5),
    ANIMAL_HIGH: (100, 7, 0, 8),
    MILK_SKIM: (95, 9, 12, 2),
    "Leche semidescremada": (110, 9, 12, 4),
    MILK_WHOLE: (150, 9, 12, 8),
    "Leche con azúcar": (200, 8, 30, 5),
    FAT: (45, 0, 0, 5),
    FAT_PROTEIN: (70, 3, 3, 5),
    "Azúcares sin grasa": (40, 0, 10, 0),
    "Azúcares con grasa": (85, 0, 10, 5),
}


def archive_rows(archive, name):
    return csv.reader(
        io.StringIO(archive.read(name).decode("cp1252")),
        delimiter="^",
        quotechar="~",
    )


def build_catalog(archive_path):
    digest = hashlib.sha256(archive_path.read_bytes()).hexdigest()
    if digest != ARCHIVE_SHA256:
        raise ValueError(f"Unexpected USDA archive SHA-256: {digest}")
    with zipfile.ZipFile(archive_path) as archive:
        descriptions = {row[0]: row[2] for row in archive_rows(archive, "FOOD_DES.txt")}
        selected_codes = {item[0] for item in SELECTION}
        nutrient_values = {code: {} for code in selected_codes}
        for row in archive_rows(archive, "NUT_DATA.txt"):
            if row[0] in selected_codes and row[1] in NUTRIENTS.values():
                value = float(row[2])
                if not math.isfinite(value) or value < 0:
                    raise ValueError(f"Invalid nutrient for NDB {row[0]}, nutrient {row[1]}")
                nutrient_values[row[0]][row[1]] = value

    foods = []
    for code, food_id, name, category, preparation, emoji, group in SELECTION:
        if code not in descriptions:
            raise ValueError(f"Missing USDA food {code}")
        per100 = {key: nutrient_values[code].get(nutrient_code) for key, nutrient_code in NUTRIENTS.items()}
        if any(per100[key] is None for key in ("kcal", "protein", "carbs", "fat")):
            raise ValueError(f"Missing essential macro field for USDA food {code}")
        foods.append({
            "id": food_id,
            "name": name,
            "category": category,
            "preparation": preparation,
            "emoji": emoji,
            "source": {
                "name": "USDA SR Legacy (2018)",
                "url": ARCHIVE_URL,
                "code": code,
                "description": descriptions[code],
            },
            "smaeGroup": group,
            "equivalentGrams": EQUIVALENTS.get(food_id),
            "equivalentSource": SMAE_URL if food_id in EQUIVALENTS else None,
            "per100": per100,
        })
    if len({food["id"] for food in foods}) != len(foods):
        raise ValueError("Duplicate catalog ID")
    return foods


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--archive", type=Path, help="Use an existing official SR-Leg_ASC.zip")
    parser.add_argument("--check", action="store_true", help="Verify generated file is up to date without writing")
    args = parser.parse_args()
    archive_path = args.archive or Path(tempfile.gettempdir()) / "gymtrack-sr-legacy.zip"
    if not archive_path.exists():
        if args.archive:
            raise FileNotFoundError(archive_path)
        print("Downloading official public-domain USDA SR Legacy archive...")
        with urllib.request.urlopen(ARCHIVE_URL, timeout=60) as response:
            archive_path.write_bytes(response.read())
    foods = build_catalog(archive_path)
    groups = {
        name: dict(zip(("kcal", "protein", "carbs", "fat"), values), sourceUrl=SMAE_URL)
        for name, values in SMAE_AVERAGES.items()
    }
    metadata = {
        "source": "USDA National Nutrient Database for Standard Reference, Legacy (2018)",
        "sourceUrl": ARCHIVE_URL,
        "sha256": ARCHIVE_SHA256,
        "smaeSourceUrl": SMAE_URL,
        "note": "Composición USDA por 100 g comestibles. Clasificación SMAE orientativa; no es la base oficial completa del SMAE.",
    }
    def encoded(value):
        return json.dumps(value, ensure_ascii=False, indent=2, allow_nan=False)
    output = (
        "// Generated by scripts/import-usda.py from official USDA SR Legacy (2018).\n"
        "// Public-domain composition data. Do not edit nutrient numbers by hand.\n"
        "// null = unreported; 0 = an explicit source value. See docs/NUTRITION-SOURCES.md.\n"
        f"export const CATALOG_METADATA = {encoded(metadata)};\n\n"
        f"export const NUTRIENT_UNITS = {encoded(UNITS)};\n\n"
        f"export const SMAE_GROUPS = {encoded(groups)};\n\n"
        f"export const FOODS = {encoded(foods)};\n"
    )
    output_path = PROJECT / "dist" / "foods.js"
    if args.check:
        if not output_path.exists() or output_path.read_text(encoding="utf-8") != output:
            raise SystemExit("foods.js differs from official source extraction; regenerate it.")
        print(f"Verified {len(foods)} foods against pinned official USDA archive.")
    else:
        output_path.parent.mkdir(parents=True, exist_ok=True)
        with output_path.open("w", encoding="utf-8", newline="\n") as handle:
            handle.write(output)
        print(f"Generated {output_path}: {len(foods)} foods.")
    missing = sum(value is None for food in foods for value in food["per100"].values())
    print(f"Unreported nutrient values preserved as null: {missing}")


if __name__ == "__main__":
    main()
