# Cálculos y referencias de GymTrack

Versión inicial. Referencias consultadas el 19 de octubre de 2026.

## Energía y macronutrientes

La aplicación estima el gasto en reposo con la ecuación simplificada de Mifflin–St Jeor: `10 × peso (kg) + 6.25 × estatura (cm) − 5 × edad + constante`, donde la constante es `5` para hombres y `−161` para mujeres. El artículo original estudió adultos sanos de 19 a 78 años; la aplicación acepta 18–79 como rango operativo y no constituye validación de la fórmula en toda esa población. [Publicación original](https://pubmed.ncbi.nlm.nih.gov/2305711/).

El mantenimiento se estima multiplicando el resultado por el factor de actividad elegido, entre 1.2 y 1.9; se redondea a kcal enteras. Es una estimación inicial, sujeta a diferencias individuales y errores al elegir actividad. Los pasos registrados no se suman como calorías disponibles, para evitar contar dos veces la actividad.

Los ajustes son decisiones conservadoras de producto, no una prescripción: déficit del 10% con máximo de 300 kcal/día; superávit del 5% con máximo de 200 kcal/día. Se redondea primero el ajuste y luego se suma al mantenimiento. La distribución inicial de energía es 50% de carbohidratos, 20% de proteína y 30% de grasas, dentro de los rangos AMDR para adultos. Se calculan gramos con factores de 4, 4 y 9 kcal/g, conservando precisión hasta la presentación. [Rangos de referencia de National Academies](https://www.ncbi.nlm.nih.gov/books/NBK208874/).

No hay meta automática si se declara embarazo, lactancia o una condición médica. No se propone déficit con IMC menor de 18.5, ni metas calculadas inferiores a 1,200 kcal para mujeres o 1,500 para hombres. Estos umbrales son barreras de la aplicación; superar un umbral no certifica una dieta como adecuada. La meta se devuelve como `null`, sin sustituirla por una meta mínima. El registro de alimentos puede continuar. La restricción de planificación automatizada en embarazo, lactancia y menores coincide con el alcance publicado por [NIDDK Body Weight Planner](https://www.niddk.nih.gov/health-information/weight-management/body-weight-planner).

Se validan edad entera 18–79, estatura 120–230 cm, peso 30–350 kg, actividad 1.2–1.9 y pasos habituales enteros 0–20,000. Son límites operativos de esta primera versión.

## Referencias nutricionales

Son referencias diarias generales para personas sanas, no pruebas de deficiencia ni instrucciones para tomar suplementos. No cambian entre déficit, mantenimiento o superávit. El sexo se usa como variable de la tabla, tal como se publica. Las necesidades individuales, tabaquismo, enfermedades, medicamentos, embarazo y lactancia pueden cambiar las referencias. En particular, vitamina C no incluye el incremento por tabaquismo porque esta versión no recoge ese dato.

| Nutriente | Referencia usada | Fuente |
| --- | --- | --- |
| Fibra | Hombres 18–50: 38 g; ≥51: 30 g. Mujeres 18: 26 g; 19–50: 25 g; ≥51: 21 g (AI). | [National Academies, tabla C-4](https://www.ncbi.nlm.nih.gov/books/NBK208874/) |
| Calcio | 18 años: 1,300 mg; 19–50: 1,000 mg; mujeres ≥51 y todos ≥71: 1,200 mg; hombres 51–70: 1,000 mg (RDA). | [NIH ODS](https://ods.od.nih.gov/factsheets/Calcium-HealthProfessional/) |
| Hierro | 18 años: hombres 11 mg, mujeres 15 mg. 19–50: hombres 8 mg, mujeres 18 mg; ≥51: 8 mg (RDA). | [NIH ODS](https://ods.od.nih.gov/factsheets/Iron-HealthProfessional/) |
| Magnesio | 18 años: hombres 410 mg, mujeres 360 mg; 19–30: 400/310 mg; ≥31: 420/320 mg (RDA). | [NIH ODS](https://ods.od.nih.gov/factsheets/Magnesium-HealthProfessional/) |
| Potasio | 18 años: hombres 3,000 mg, mujeres 2,300 mg; ≥19: 3,400/2,600 mg (AI). | [NIH ODS](https://ods.od.nih.gov/factsheets/potassium-healthprofessional/) |
| Sodio | Menos de 2,000 mg. Es un límite recomendado, nunca una cantidad faltante por consumir; no se presenta como UL toxicológico. | [OMS](https://www.who.int/news-room/fact-sheets/detail/sodium-reduction) |
| Zinc | Hombres: 11 mg; mujeres 18: 9 mg, ≥19: 8 mg (RDA). | [NIH ODS](https://ods.od.nih.gov/factsheets/Zinc-HealthProfessional/) |
| Vitamina A | Hombres 900 µg RAE; mujeres 700 µg RAE (RDA). | [NIH ODS](https://ods.od.nih.gov/factsheets/VitaminA-HealthProfessional/) |
| Vitamina C | 18 años: hombres 75 mg, mujeres 65 mg; ≥19: 90/75 mg (RDA). | [NIH ODS](https://ods.od.nih.gov/factsheets/VitaminC-HealthProfessional/) |
| Vitamina D | 18–70: 15 µg; ≥71: 20 µg (RDA). | [NIH ODS](https://ods.od.nih.gov/factsheets/VitaminD-HealthProfessional/) |
| Vitamina B12 | 2.4 µg (RDA). | [NIH ODS](https://ods.od.nih.gov/factsheets/VitaminB12-HealthProfessional/) |
| Folato | 400 µg DFE (RDA). | [NIH ODS](https://ods.od.nih.gov/factsheets/Folate-HealthProfessional/) |

RAE: equivalentes de actividad de retinol. DFE: equivalentes dietéticos de folato. No mezclar vitamina A en IU con RAE, ni folato total/ácido fólico con DFE sin conversión verificada. Los datos de alimentos deben usar las unidades del módulo.

## Pasos

La sugerencia es un primer incremento ajustable de 500 pasos respecto a los habituales, hasta 7,000; si la persona ya camina 7,000 o más se conserva su base, hasta 20,000. Se usa la misma regla en los tres objetivos. Es una decisión de progresión gradual de la aplicación, no un cálculo de pasos obligatorios para lograr un peso ni una estimación de gasto.

## Cantidades y datos incompletos

Cada nutriente conocido se multiplica por `gramos / 100`. Se aceptan cantidades entre 0.1 y 5,000 g, usando la preparación del alimento elegido. Los valores `null` o ausentes representan falta de dato; cero significa cero reportado. El resumen suma cantidades conocidas y publica una cobertura por nutriente: proporción de registros con dato, no proporción de masa ni de energía. Si ningún alimento de un día con registros tiene dato, el total es `null`. Un día vacío muestra cero consumido y cobertura cero. No se imputa el nutriente faltante ni se infiere de un grupo SMAE.

Las claves de fecha se calculan con el calendario local del dispositivo para no mover una comida al día siguiente al convertir a UTC.
