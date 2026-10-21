# GymTrack: datos y métodos nutricionales

## Composición del catálogo

El catálogo tiene 65 alimentos comunes en México. Los valores por 100 g
proceden de **USDA National Nutrient Database for Standard Reference, Legacy
(2018)**, no de cálculos aproximados escritos a mano ni de una reproducción
comercial del SMAE.

- [Archivo oficial SR-Leg_ASC.zip](https://www.ars.usda.gov/ARSUserFiles/80400525/Data/SR-Legacy/SR-Leg_ASC.zip).
- [Documentación oficial de SR Legacy](https://www.ars.usda.gov/arsuserfiles/80400525/data/sr-legacy/sr-legacy_doc.pdf).
- [USDA FoodData Central: uso de datos de dominio público](https://fdc.nal.usda.gov/api-guide/).

Cada alimento conserva `source.code` (identificador NDB), descripción original en
inglés y URL del archivo fuente. `scripts/import-usda.py` selecciona `FOOD_DES.txt`
y extrae los nutrientes de `NUT_DATA.txt`. La selección y las traducciones son
editoriales; los números se importan sin modificarlos. El SHA-256 del archivo
oficial utilizado es:

```text
79705f75a7306d0910ad16dd4d66a5caf602dad528b99b77c7a510bfaf3d6e14
```

Regenerar desde la carpeta `gymtrack` con Python 3.9 o posterior, sin dependencias:

```powershell
python scripts/import-usda.py
python scripts/import-usda.py --check
python scripts/import-usda.py --archive C:\ruta\SR-Leg_ASC.zip --check
```

El archivo ZIP se guarda en la carpeta temporal del sistema. La aplicación
funciona con el catálogo generado localmente y no necesita una clave de API.
El importador rechaza un archivo cuyo hash difiere; una nueva versión requiere
revisar explícitamente la selección y las pruebas antes de actualizar el hash.

Los valores son para **peso neto comestible**. Hay entradas separadas para salmón
crudo y cocido, avena seca y cocida y nopal crudo y cocido. No se transforma peso
crudo a cocido automáticamente. Aceite, sal, salsas y otros ingredientes adicionales
se registran aparte cuando no están incluidos en la preparación de la ficha.

### Palomitas de maíz y piernas de pollo

| Alimento en la app | NDB | Descripción original USDA |
| --- | --- | --- |
| Palomitas de maíz sin aceite | 19806 | Snacks, popcorn, air-popped (Unsalted) |
| Palomitas de maíz con aceite | 42259 | Snacks, popcorn, home-prepared, oil-popped, unsalted |
| Pierna de pollo cruda sin piel | 05071 | Chicken, broilers or fryers, dark meat, drumstick, meat only, raw |
| Pierna de pollo asada sin piel | 05073 | Chicken, broilers or fryers, dark meat, drumstick, meat only, cooked, roasted |
| Pierna de pollo asada con piel | 05069 | Chicken, broilers or fryers, drumstick, meat and skin, cooked, roasted |

Las palomitas se pesan **ya reventadas**, no como granos secos. Ambas referencias
son sin sal añadida. La preparación con aceite ya incluye su aporte: no debe
duplicarse registrándolo otra vez. Una receta casera, palomitas de cine, de
microondas, con mantequilla o caramelizadas pueden tener otra composición.
El registro 19806 no informa vitamina D; se conserva como `null`.

La **pierna** corresponde a `drumstick`, la parte inferior, no al conjunto
pierna y muslo. Se pesa sólo la parte comestible, **sin hueso**, y la piel sólo
cuando se selecciona la variante con piel. La preparación cruda se usa para
peso antes de cocinar; las asadas, para peso después de cocinar. No se incluyen
empanizado, salsa ni otros ingredientes adicionales.

Las referencias estadounidenses no describen necesariamente una marca o receta
mexicana. Tortillas, panes y quesos pueden variar en agua, grasa, sodio, calcio
y fortificación. Las leches seleccionadas son sin vitaminas A/D añadidas. Debe
usarse la etiqueta de la marca cuando exista una coincidencia mejor. El catálogo
inicial no pretende cubrir todos los alimentos mexicanos.

## Unidades y datos faltantes

| Campo | Código USDA SR | Unidad por 100 g |
| --- | --- | --- |
| kcal | 208 | kcal |
| protein | 203 | g |
| carbs | 205 | g, carbohidratos por diferencia |
| fat | 204 | g |
| fiber | 291 | g |
| calcium | 301 | mg |
| iron | 303 | mg |
| magnesium | 304 | mg |
| potassium | 306 | mg |
| sodium | 307 | mg |
| zinc | 309 | mg |
| vitaminA | 320 | µg RAE |
| vitaminC | 401 | mg |
| vitaminD | 328 | µg, D2 + D3 |
| vitaminB12 | 418 | µg |
| folate | 435 | µg DFE |

La energía se toma del valor publicado por USDA; no se fuerza a coincidir con
`4 × proteína + 4 × carbohidratos + 9 × grasa`. La fuente utiliza factores de
conversión que pueden ser específicos para cada alimento.

Una ausencia en `NUT_DATA.txt` se conserva como `null`, no como cero. Un cero
publicado se conserva como `0`. El total conocido de un micronutriente puede ser
parcial y no debe presentarse como completo cuando hay registros sin datos.
Las unidades de vitamina A RAE y folato DFE no se intercambian con UI, ácido
fólico o folato total. La fibra se muestra junto con otros nutrientes, pero no
es un micronutriente.

## Relación con el SMAE

La [Facultad de Medicina de la UNAM publica un resumen del Sistema Mexicano
de Alimentos Equivalentes](https://fisiologia.facmed.unam.mx/wp-content/uploads/2019/02/2-Valoraci%C3%B3n-nutricional-Anexos.pdf)
con grupos y aportes promedio por equivalente. Su página 2 cita la cuarta edición
del SMAE; sus páginas 3–4 incluyen algunas porciones resumidas.
También existe un [resumen público en el Diario Oficial de la Federación,
apéndice F.3](https://dof.gob.mx/nota_detalle_popup.php?codigo=5259329).

`smaeGroup` es una **clasificación orientativa** para contextualizar el catálogo.
No constituye certificación ni correspondencia validada de cada entrada USDA
con una edición comercial del SMAE. `SMAE_GROUPS` reproduce los promedios
numéricos de energía y macronutrientes del resumen UNAM, por equivalente.
Esos promedios no se usan para inventar vitaminas o minerales de un alimento
concreto.

El registro por gramos usa composición USDA. Por ello, su resultado no tiene
que coincidir con el promedio redondeado de un equivalente SMAE. Son dos métodos
con propósitos distintos; no se suman sus cifras.

`equivalentGrams` sólo está disponible para pechuga de pollo cocida y atún
escurrido (30 g, resumen UNAM, página 4). Las porciones expresadas en taza,
pieza o cucharada no se convierten arbitrariamente a gramos. En los demás
alimentos el campo es `null`. Una integración completa del SMAE requiere
obtener una fuente autorizada de la edición elegida y validar la correspondencia
por alimento, preparación y tamaño de porción.

## Estimación de mantenimiento

La ecuación original de [Mifflin y St Jeor,
American Journal of Clinical Nutrition, 1990](https://pubmed.ncbi.nlm.nih.gov/2305711/)
estima gasto energético **en reposo**, no mantenimiento directamente:

```text
Hombres: 10 × peso_kg + 6.25 × altura_cm − 5 × edad_años + 5
Mujeres: 10 × peso_kg + 6.25 × altura_cm − 5 × edad_años − 161
```

Los multiplicadores de actividad y ajustes de déficit o superávit son
aproximaciones de la aplicación, no una parte de esa ecuación ni una predicción
garantizada del peso. Los pasos no deben acreditarse nuevamente como calorías
para comer cuando la actividad ya está incluida en el mantenimiento estimado.

El [NIDDK limita su planificador de peso a adultos y excluye embarazo y
lactancia](https://www.niddk.nih.gov/health-information/weight-management/body-weight-planner).
La app debe permitir registrar alimentos sin convertir un perfil fuera del
alcance del estimador en una prescripción energética automática.

## Referencias para nutrientes diarios

Las referencias DRI son valores de orientación para población sana; dependen
de edad, sexo y etapa de vida. Una ingesta registrada por debajo de una referencia
en un día **no diagnostica una deficiencia**. No se recomiendan suplementos a
partir del diario. Las referencias estadounidenses se identifican como tales;
no son valores específicos del SMAE ni una prescripción individual mexicana.

| Nutriente | Referencias habituales para adultos no embarazados ni lactantes | Fuente |
| --- | --- | --- |
| Calcio | 19–50: 1,000 mg; hombres 51–70: 1,000 mg; mujeres 51–70 y mayores de 70: 1,200 mg | [NIH ODS](https://ods.od.nih.gov/factsheets/Calcium-HealthProfessional/) |
| Hierro | Hombres 19+: 8 mg; mujeres 19–50: 18 mg; mujeres 51+: 8 mg | [NIH ODS](https://ods.od.nih.gov/factsheets/Iron-HealthProfessional/) |
| Magnesio | Hombres 19–30: 400 mg, 31+: 420 mg; mujeres 19–30: 310 mg, 31+: 320 mg | [NIH ODS](https://ods.od.nih.gov/factsheets/Magnesium-HealthProfessional/) |
| Potasio | Hombres 19+: 3,400 mg; mujeres 19+: 2,600 mg; ingesta adecuada (AI) | [NIH ODS](https://ods.od.nih.gov/factsheets/potassium-healthprofessional/) |
| Vitamina C | Hombres 19+: 90 mg; mujeres 19+: 75 mg; personas fumadoras: 35 mg adicionales | [NIH ODS](https://ods.od.nih.gov/factsheets/vitaminc-HealthProfessional/) |
| Vitamina D | 19–70: 15 µg; mayores de 70: 20 µg | [NIH ODS](https://ods.od.nih.gov/factsheets/VITAMIND-HealthProfessional/) |

A los 18 años aún corresponden valores de las tablas de 14–18: calcio
1,300 mg; hierro 11 mg (hombre)/15 mg (mujer); magnesio 410/360 mg;
potasio 3,000/2,300 mg; vitamina C 75/65 mg. La edad legal adulta no elimina
esa distinción nutricional.

La distribución de macronutrientes es orientativa. Los rangos AMDR para adultos
incluyen carbohidratos 45–65% de energía, grasa 20–35% y proteína 10–35%;
véase [National Academies, fundamentos de los valores de referencia](https://www.nationalacademies.org/read/10872/chapter/7)
y [tablas AMDR](https://nap.nationalacademies.org/skim.php?chap=936-967&record_id=10490).
La selección concreta de porcentajes de la app es una decisión de producto.

## Meta de pasos

No existe una fórmula validada que indique un número exacto de pasos para cada
objetivo de déficit, mantenimiento o superávit. La meta de pasos es un hábito
editable y progresivo; no garantiza gasto calórico ni cambio de peso.

El [estudio prospectivo CARDIA](https://pubmed.ncbi.nlm.nih.gov/34477847/)
encontró una asociación entre aproximadamente 7,000 pasos diarios o más y menor
mortalidad en adultos de mediana edad; es evidencia observacional, no una
prescripción individual. Las [guías de actividad física de la OMS](https://www.ncbi.nlm.nih.gov/books/NBK566046/)
recomiendan progresar desde cantidades pequeñas y, para adultos, 150–300 minutos
semanales de actividad aeróbica moderada y fortalecimiento al menos dos días.
El objetivo de pasos no reemplaza estas recomendaciones ni demuestra que se
haya alcanzado su intensidad.
