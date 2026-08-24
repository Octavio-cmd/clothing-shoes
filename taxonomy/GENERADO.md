# Taxonomía oficial de eBay — procedencia y regeneración

## Qué es este archivo

`ebay-us-v134.json` es un **derivado** de la Taxonomy API de eBay. No se edita a
mano. Contiene únicamente las categorías que esta aplicación puede ofrecer y
únicamente los aspectos que esta aplicación captura o exporta.

| | |
|---|---|
| Marketplace | `EBAY_US` |
| `categoryTreeId` | `0` |
| `categoryTreeVersion` | **`134`** |
| Esquema del derivado | `1` |
| Categorías | 88, todas *leaf* |
| Combinaciones seleccionables | 109 |
| Aspectos | 765 |
| Nombres de aspecto obligatorios | **13** — todos presentes |
| Valores incrustados | 18.807 |
| Tamaño | 139,7 KB (15,2 KB comprimido) |

## De dónde salen los datos

De una consulta de **solo lectura** a la Taxonomy API de eBay, hecha con el
flujo OAuth `client_credentials`, mediante el script local
`ebay-taxonomy-consulta.ps1`. Ese script **no vive en este repositorio** y no
debe vivir aquí: pide las credenciales por terminal (el Cert ID oculto), las
mantiene solo en memoria y no las escribe en disco.

Los JSON originales pesan **~49 MB** y **no se versionan**. Se pasan por ruta al
generador.

Archivos de origen que consume el generador:

| Archivo | Uso |
|---|---|
| `02-category-tree-completo.json` | Árbol completo: existencia, ruta y condición de hoja de cada ID |
| `04-aspectos-<id>.json` | Aspectos y valores permitidos de cada categoría |

## Cómo regenerarlo

```sh
# 1. Obtener los JSON oficiales con el script local y descomprimirlos
#    en un directorio, por ejemplo ./_taxo-oficial/
# 2. Generar el derivado
node tools/build-taxonomy.mjs  --src ./_taxo-oficial
# 3. Revalidarlo contra la fuente
node tools/verify-taxonomy.mjs --src ./_taxo-oficial
```

El generador **aborta sin escribir nada** si algún ID no existe en el árbol, no
es hoja, o no tiene archivo de aspectos.

`_taxo-oficial/` no debe commitearse. No pongas credenciales, tokens ni el
`access_token` en ningún archivo de este directorio.

## Qué contiene el derivado

```
esquema                versión del formato (para migrar sesiones guardadas)
marketplace            EBAY_US
categoryTreeId         0
categoryTreeVersion    134
aspectosConservados    todos los obligatorios + los opcionales que la app usa
aspectosObligatorios   los 13 nombres con aspectRequired=true
aspectosAbiertos       los guardados sin lista (hoy: Brand)
listas                 tablas de valores compartidas (L0, L1, ...) — deduplicación
categorias             { "<leafId>": { n, ruta, a: { <aspecto>: {r,m,v|ref} }, unisexAdultos? } }
seleccion              rama → tipo → prenda → leafId
```

- `r`: `1` si el aspecto es obligatorio para eBay.
- `m`: `sel` = lista cerrada (`SELECTION_ONLY`); `txt` = admite texto libre.
- `nv`: número **exacto** de valores que tiene el JSON oficial. Siempre presente.
- `v`: valores propios. `ref`: apunta a una lista compartida en `listas`.
- `abierto`: `1` si la lista no se incrusta (ver más abajo).
- `unisexAdultos`: la categoría admite `Department = Unisex Adults`.

## Qué aspectos se conservan

Dos reglas, y la primera **no se escribe a mano**:

1. **Todo aspecto con `aspectConstraint.aspectRequired = true`** en alguna de las
   88 categorías. El generador lo descubre leyendo los JSON oficiales en una
   primera pasada, de modo que es imposible omitir un obligatorio — y aborta si
   alguna categoría se quedara sin uno suyo.
2. Los opcionales que la aplicación usa: `Material`, `Sleeve Length`,
   `Performance/Activity`, `Shoe Width`, `Heel Style`, `Heel Height`.

Los 13 obligatorios, con en cuántas de las 88 categorías lo son:

| Aspecto | Obligatorio en | Nota |
|---|---:|---|
| `Brand` | 88 | entrada libre; lista **abierta** |
| `Color` | 85 | |
| `Department` | 72 | |
| `Size` | 68 | nunca en calzado |
| `Style` | 64 | |
| `Type` | 41 | |
| `Size Type` | 25 | nunca en Baby, calzado ni Scrubs |
| `US Shoe Size` | 17 | solo calzado |
| `Upper Material` | 12 | solo calzado |
| `Outer Shell Material` | 6 | solo abrigos |
| `Dress Length` | 3 | solo vestidos |
| `Inseam` | 2 | Men's Pants y Men's Jeans |
| `Skirt Length` | 1 | Women's Skirts `63864` |

### Aspectos abiertos

Un aspecto **`FREE_TEXT`** cuya lista oficial supere 400 valores se guarda
**abierto**: se conservan su obligatoriedad (`r`) y el número exacto de valores
oficiales (`nv`), pero la lista no se incrusta.

Hoy solo `Brand` cruza el umbral. Está en las 88 categorías con entre 66 y
**19.161** valores; incrustarlo, incluso deduplicado, pesa **10.555 KB** — más de
cincuenta veces el presupuesto entero del archivo. Como `Brand` es `FREE_TEXT`,
esa lista es un conjunto de sugerencias, no un conjunto cerrado: eBay acepta
cualquier marca, así que la lista no valida nada.

Esto **no es una omisión silenciosa**: `aspectosAbiertos` lo declara, cada
entrada guarda su `nv`, y el validador comprueba que ese `nv` coincida con el
recuento oficial categoría por categoría. La aplicación debe seguir exigiendo
`Brand` — simplemente lo pide como texto con su propia lista corta de marcas.

### Deduplicación

`Material`, `Color` y `Performance/Activity` son listas idénticas repetidas en
decenas de categorías. Se extraen a `listas` y se referencian con `ref`. Sin
esto el archivo pesaría 175 KB en vez de 117 KB. **No se pierde ningún valor.**

### Qué se excluye a propósito

- Los aspectos **opcionales** que la aplicación no usa.
- Las **listas de sugerencias** de los aspectos abiertos (hoy solo `Brand`) —
  el aspecto sí se conserva, con su obligatoriedad y su `nv`.
- Categorías fuera de `seleccion`.

**Ningún aspecto obligatorio se excluye jamás.** El generador aborta si ocurre y
el validador lo comprueba con dos pruebas independientes.

## Reglas de diseño

1. **No hay fallback.** Cada combinación de `seleccion` apunta a un *leaf ID*
   oficial. Lo que no esté en el mapa no es seleccionable. El validador falla si
   alguna combinación apunta fuera de `categorias`.
2. **No se inventan valores.** El validador comprueba los 18.807 valores
   incrustados contra los JSON oficiales.
4. **Ningún obligatorio se pierde.** El conjunto de obligatorios del derivado
   debe coincidir *exactamente* con el de los JSON oficiales, en ambos sentidos.
3. **Un aspecto solo se envía si la categoría lo admite.** `Size Type`,
   `Department`, `Type`, `Style`, `Dress Length` y `Shoe Width` no existen en
   todas las categorías.

## Decisiones de mapeo que conviene recordar

| Decisión | Motivo |
|---|---|
| Hombre no ofrece `Dress`, `Skirt` ni `Blouse` | No existe ruta oficial |
| `Unisex` adulto no es una rama | eBay no tiene categorías unisex de adulto: es el valor `Unisex Adults` del aspecto `Department` sobre una rama Men o Women elegida explícitamente |
| Baby & Toddler es rama propia | Cuelga de `Baby`, **no** de `Kids` |
| Baby `Hoodie`/`Sweatshirt` → `260029` (Sweaters) | Baby & Toddler no tiene hoja de sudaderas |
| Scrubs sin género | Cuelga de `Specialty > Uniforms & Work Clothing`; no admite `Department`, `Size Type`, `Type` ni `Style` |
| `Activewear Bottom` se divide | Oficialmente son dos hojas: *Activewear Pants* y *Activewear Shorts* |
| `Heel Style` ≠ `Style` | `Wedge` es un valor de **`Heel Style`**; el `Style` de *Women's Heels* `55793` no lo contiene |
| `Skirt Length` ≠ `Dress Length` | Las faldas usan `Skirt Length` (obligatorio en *Women's Skirts* `63864`). `Dress Length` **no existe** en ninguna categoría de falda |
| `Upper Material` ≠ `Material` | El calzado usa `Upper Material`, obligatorio en 12 categorías. `Material` no aplica al calzado |
| `Heel Height` | Opcional en 8 categorías de calzado, con rangos en pulgadas |
| Calzado usa `US Shoe Size` | El aspecto `Size` **no existe** en ninguna categoría de calzado |
| `Shoe Width` usa códigos de letra | `Standard`, `A`, `B`, `D`, `M`, `W`… — no etiquetas descriptivas |

## Notas sobre tallas

- **`2T` es válido en los cuatro grupos infantiles** (Baby & Toddler, Boys 4&Up,
  Girls 4&Up, Unisex Kids 4&Up). La talla **no** permite deducir el grupo de
  edad: lo elige la persona que captura.
- **`Size Type` no existe** en Baby & Toddler, en calzado ni en Scrubs. Dentro de
  Kids solo aparece en *Swimwear*, y con valores propios (`Slim`, `Husky`), nunca
  los de adulto.
- Las tallas *Big & Tall* de hombre son `Big 1X`…`Big 6X` y `XLT`…`6XLT`.
- Las tallas de calzado infantil son numéricas (`1`–`13.5`), no `1C` ni `7Y`.

## Cuándo hay que regenerar

Cuando eBay publique una versión de árbol distinta de la 134. Comprobarlo con
`GET /commerce/taxonomy/v1/get_default_category_tree_id?marketplace_id=EBAY_US`.
Al regenerar, sube el número de `esquema` solo si cambia la *forma* del archivo,
porque la aplicación lo usa para migrar sesiones guardadas.
