"""
Procesador de PDFs de cotizaciones usando Claude Vision API.
Extrae items/unitarios de cotizaciones en formato estructurado.
"""
import anthropic
import base64
import json
import io
import os
from pathlib import Path
import sys

# Intentar importar pdf2image (requiere poppler instalado)
try:
    from pdf2image import convert_from_path, convert_from_bytes
    PDF2IMAGE_AVAILABLE = True
except ImportError:
    PDF2IMAGE_AVAILABLE = False

# Intentar importar PyMuPDF como alternativa
try:
    import fitz  # PyMuPDF
    PYMUPDF_AVAILABLE = True
except ImportError:
    PYMUPDF_AVAILABLE = False

from PIL import Image


def imagen_a_base64(imagen):
    """Convertir imagen PIL a base64"""
    buffer = io.BytesIO()
    imagen.save(buffer, format='PNG')
    buffer.seek(0)
    return base64.standard_b64encode(buffer.read()).decode('utf-8')


def pdf_a_imagenes_pymupdf(pdf_path, dpi=150):
    """Convertir PDF a imágenes usando PyMuPDF"""
    doc = fitz.open(pdf_path)
    imagenes = []

    for page_num in range(len(doc)):
        page = doc.load_page(page_num)
        # Calcular zoom basado en DPI (72 es el DPI base de PDF)
        zoom = dpi / 72
        mat = fitz.Matrix(zoom, zoom)
        pix = page.get_pixmap(matrix=mat)

        # Convertir a PIL Image
        img = Image.frombytes("RGB", [pix.width, pix.height], pix.samples)
        imagenes.append(img)

    doc.close()
    return imagenes


def pdf_a_imagenes(pdf_path, dpi=150):
    """
    Convertir PDF a lista de imágenes PIL.
    Intenta usar pdf2image primero, luego PyMuPDF como alternativa.
    """
    if PDF2IMAGE_AVAILABLE:
        try:
            return convert_from_path(pdf_path, dpi=dpi)
        except Exception as e:
            print(f"Error con pdf2image: {e}")
            if PYMUPDF_AVAILABLE:
                return pdf_a_imagenes_pymupdf(pdf_path, dpi)
            raise

    elif PYMUPDF_AVAILABLE:
        return pdf_a_imagenes_pymupdf(pdf_path, dpi)

    else:
        raise ImportError(
            "Se requiere pdf2image (con poppler) o PyMuPDF para procesar PDFs. "
            "Instala con: pip install pdf2image pymupdf"
        )


def procesar_pagina_con_claude(img_base64, num_pagina, client):
    """
    Procesa una página de cotización con Claude Vision.
    Retorna lista de items extraídos.
    """
    prompt = """Analiza esta imagen de una cotización/presupuesto y extrae TODOS los items o renglones de productos/servicios.

Para cada item/renglón extrae:
- codigo: código o clave del producto (si existe, puede ser alfanumérico)
- descripcion: nombre o descripción del producto/servicio
- unidad: unidad de medida (PZA, ML, M2, M3, KG, LT, JGO, LOTE, etc.)
- cantidad: cantidad cotizada (número)
- precio_unitario: precio por unidad (número sin símbolos de moneda)
- importe: total del renglón = cantidad × precio_unitario (número sin símbolos)

INSTRUCCIONES IMPORTANTES:
1. Extrae ABSOLUTAMENTE TODOS los renglones de productos, no omitas ninguno
2. Los precios deben ser números decimales sin símbolos ($, MXN, etc.)
3. Si un campo no existe o no es legible, usa null
4. Ignora encabezados, subtotales, IVA, totales generales - solo items de productos
5. Si la imagen no contiene items de cotización, retorna una lista vacía

Responde ÚNICAMENTE con JSON válido en este formato exacto:
{"items": [
  {"codigo": "ABC123", "descripcion": "Tubo PVC 4 pulgadas", "unidad": "ML", "cantidad": 100, "precio_unitario": 150.50, "importe": 15050.00},
  {"codigo": null, "descripcion": "Codo 90 grados 4 pulg", "unidad": "PZA", "cantidad": 20, "precio_unitario": 45.00, "importe": 900.00}
]}

NO incluyas explicaciones, solo el JSON."""

    try:
        response = client.messages.create(
            model="claude-sonnet-4-20250514",
            max_tokens=4096,
            messages=[{
                "role": "user",
                "content": [
                    {
                        "type": "image",
                        "source": {
                            "type": "base64",
                            "media_type": "image/png",
                            "data": img_base64
                        }
                    },
                    {
                        "type": "text",
                        "text": prompt
                    }
                ]
            }]
        )

        # Extraer texto de la respuesta
        response_text = response.content[0].text.strip()

        # Limpiar posibles marcadores de código markdown
        if response_text.startswith('```'):
            lines = response_text.split('\n')
            # Remover primera y última línea si son marcadores
            if lines[0].startswith('```'):
                lines = lines[1:]
            if lines and lines[-1].strip() == '```':
                lines = lines[:-1]
            response_text = '\n'.join(lines)

        # Parsear JSON
        data = json.loads(response_text)
        items = data.get('items', [])

        # Validar y limpiar items
        items_validos = []
        for item in items:
            if item.get('descripcion'):
                # Asegurar tipos correctos
                item_limpio = {
                    'codigo': item.get('codigo'),
                    'descripcion': str(item.get('descripcion', '')).strip(),
                    'unidad': item.get('unidad'),
                    'cantidad': _convertir_numero(item.get('cantidad')),
                    'precio_unitario': _convertir_numero(item.get('precio_unitario')),
                    'importe': _convertir_numero(item.get('importe'))
                }
                items_validos.append(item_limpio)

        return items_validos

    except json.JSONDecodeError as e:
        print(f"Error parseando JSON de página {num_pagina}: {e}")
        print(f"Respuesta recibida: {response_text[:500]}")
        return []
    except Exception as e:
        print(f"Error procesando página {num_pagina}: {e}")
        return []


def _convertir_numero(valor):
    """Convertir valor a número, manejando strings con formato"""
    if valor is None:
        return None
    if isinstance(valor, (int, float)):
        return float(valor)
    if isinstance(valor, str):
        # Remover caracteres no numéricos excepto punto y coma
        limpio = valor.replace('$', '').replace(',', '').replace(' ', '').strip()
        try:
            return float(limpio)
        except ValueError:
            return None
    return None


def extraer_items_pdf(archivo_path, api_key=None):
    """
    Extrae todos los items de un PDF de cotización usando Claude Vision.

    Args:
        archivo_path: Ruta al archivo PDF
        api_key: API key de Anthropic (opcional, usa variable de entorno si no se proporciona)

    Returns:
        dict con:
            - items: lista de items extraídos
            - num_paginas: número de páginas procesadas
            - errores: lista de errores encontrados
    """
    # Verificar que el archivo existe
    if not os.path.exists(archivo_path):
        return {
            'items': [],
            'num_paginas': 0,
            'errores': [f'Archivo no encontrado: {archivo_path}']
        }

    # Crear cliente de Anthropic
    # Buscar API key en orden: parámetro, variable de entorno, archivo de config
    if not api_key:
        api_key = os.environ.get('ANTHROPIC_API_KEY')
        if api_key:
            print("API key encontrada en variable de entorno")

    if not api_key:
        # Intentar leer de archivo de configuración local
        config_path = Path(__file__).parent / '.anthropic_key'
        print(f"Buscando API key en: {config_path}")
        if config_path.exists():
            api_key = config_path.read_text().strip()
            print(f"API key encontrada en archivo ({len(api_key)} caracteres)")
        else:
            print("Archivo de API key no encontrado")

    if not api_key:
        return {
            'items': [],
            'num_paginas': 0,
            'errores': ['API key de Anthropic no configurada. Crea el archivo backend/.anthropic_key con tu API key.']
        }

    print(f"Creando cliente Anthropic con API key: {api_key[:20]}...")
    client = anthropic.Anthropic(api_key=api_key)

    errores = []
    todos_items = []

    try:
        # Convertir PDF a imagenes
        print(f"Convirtiendo PDF a imagenes: {archivo_path}")
        paginas = pdf_a_imagenes(archivo_path, dpi=150)
        print(f"PDF tiene {len(paginas)} paginas")

        # Procesar cada página
        for i, pagina in enumerate(paginas):
            num_pagina = i + 1
            print(f"Procesando pagina {num_pagina}/{len(paginas)}...")

            try:
                # Convertir imagen a base64
                img_base64 = imagen_a_base64(pagina)

                # Procesar con Claude
                items = procesar_pagina_con_claude(img_base64, num_pagina, client)

                print(f"  - {len(items)} items encontrados")
                todos_items.extend(items)

            except Exception as e:
                error_msg = f"Error en pagina {num_pagina}: {str(e)}"
                try:
                    print(error_msg)
                except:
                    print(f"Error en pagina {num_pagina}: (error no imprimible)")
                errores.append(error_msg)

        return {
            'items': todos_items,
            'num_paginas': len(paginas),
            'errores': errores
        }

    except Exception as e:
        return {
            'items': [],
            'num_paginas': 0,
            'errores': [str(e)]
        }


def extraer_items_pdf_bytes(pdf_bytes, nombre_archivo="cotizacion.pdf", api_key=None):
    """
    Extrae items de un PDF desde bytes (para upload directo).

    Args:
        pdf_bytes: Bytes del archivo PDF
        nombre_archivo: Nombre para referencia
        api_key: API key de Anthropic

    Returns:
        dict con items, num_paginas, errores
    """
    # Guardar temporalmente
    import tempfile

    with tempfile.NamedTemporaryFile(suffix='.pdf', delete=False) as tmp:
        tmp.write(pdf_bytes)
        tmp_path = tmp.name

    try:
        resultado = extraer_items_pdf(tmp_path, api_key)
        return resultado
    finally:
        # Limpiar archivo temporal
        try:
            os.unlink(tmp_path)
        except:
            pass


# ============== PROCESADOR DE EXCEL ==============

def extraer_items_excel(archivo_path):
    """
    Extrae items de un archivo Excel de cotizacion.
    Detecta automaticamente la fila de encabezados y las columnas.
    """
    import pandas as pd

    try:
        engine = 'openpyxl' if str(archivo_path).lower().endswith('.xlsx') else 'xlrd'

        # Primero leer sin encabezados para detectar estructura
        df_raw = pd.read_excel(archivo_path, sheet_name=0, engine=engine, header=None)
        print(f"Excel cargado: {len(df_raw)} filas, {len(df_raw.columns)} columnas")

        # Buscar fila de encabezados (buscar palabras clave)
        header_row = None
        palabras_clave = ['descripcion', 'descripción', 'clave', 'codigo', 'código', 'cantidad', 'precio', 'total', 'unidad', 'importe']

        for idx in range(min(30, len(df_raw))):
            row_values = [str(v).lower().strip() for v in df_raw.iloc[idx].values if pd.notna(v)]
            matches = sum(1 for palabra in palabras_clave if any(palabra in val for val in row_values))
            if matches >= 2:
                header_row = idx
                print(f"Encabezados encontrados en fila {idx}")
                break

        if header_row is None:
            header_row = 0
            print("No se encontraron encabezados, usando fila 0")

        # Crear mapeo de columnas por indice basado en la fila de encabezados
        header_values = df_raw.iloc[header_row].values
        col_indices = {
            'codigo': None,
            'descripcion': None,
            'unidad': None,
            'cantidad': None,
            'precio_unitario': None,
            'importe': None
        }

        mapeo = {
            'codigo': ['clave', 'codigo', 'código', 'cve', 'partida', 'no.'],
            'descripcion': ['descripcion', 'descripción', 'concepto'],
            'unidad': ['u', 'unidad', 'um', 'unid'],
            'cantidad': ['cantidad', 'cant', 'vol'],
            'precio_unitario': ['precio unitario', 'precio', 'unitario', 'p.u.', 'pu', 'costo'],
            'importe': ['total', 'importe', 'total neto', 'monto', 'subtotal']
        }

        for i, val in enumerate(header_values):
            if pd.isna(val):
                continue
            val_lower = str(val).lower().strip()
            for campo, palabras in mapeo.items():
                for palabra in palabras:
                    if palabra in val_lower:
                        if col_indices[campo] is None:
                            col_indices[campo] = i
                            print(f"  {campo} -> columna {i} ({val})")
                        break

        print(f"Indices de columnas: {col_indices}")

        # Extraer items desde la fila siguiente a los encabezados
        items = []
        palabras_ignorar = ['descripcion', 'descripción', 'concepto', 'total', 'subtotal', 'iva', 'suma', 'gran total']

        for idx in range(header_row + 1, len(df_raw)):
            row = df_raw.iloc[idx]

            # Obtener descripcion
            desc_idx = col_indices.get('descripcion')
            if desc_idx is None:
                continue

            desc = row.iloc[desc_idx] if desc_idx < len(row) else None

            if pd.isna(desc):
                continue
            desc_str = str(desc).strip()
            if desc_str == '' or len(desc_str) < 5:
                continue
            if desc_str.lower() in palabras_ignorar:
                continue

            # Obtener otros valores
            def get_val(campo):
                idx = col_indices.get(campo)
                if idx is None or idx >= len(row):
                    return None
                val = row.iloc[idx]
                return None if pd.isna(val) else val

            def get_num(campo):
                val = get_val(campo)
                if val is None:
                    return None
                try:
                    return float(val)
                except:
                    return None

            codigo = get_val('codigo')
            unidad = get_val('unidad')
            cantidad = get_num('cantidad')
            precio_unitario = get_num('precio_unitario')
            importe = get_num('importe')

            # Validar que tenga codigo (ignorar subtotales y totales que no tienen codigo)
            codigo_str = str(codigo).strip() if codigo else ''
            if not codigo_str or codigo_str.lower() in ['nan', 'none', '']:
                continue

            # Solo agregar si tiene descripcion, codigo y al menos un numero
            if desc_str and codigo_str and (cantidad or precio_unitario or importe):
                items.append({
                    'codigo': codigo_str,
                    'descripcion': desc_str,
                    'unidad': str(unidad).strip() if unidad else None,
                    'cantidad': cantidad,
                    'precio_unitario': precio_unitario,
                    'importe': importe
                })

        print(f"Items extraidos: {len(items)}")

        return {
            'items': items,
            'num_paginas': 1,
            'errores': []
        }

    except Exception as e:
        import traceback
        traceback.print_exc()
        return {
            'items': [],
            'num_paginas': 0,
            'errores': [str(e)]
        }


def _get_valor(row, col):
    """Obtener valor de una columna como string"""
    if col is None:
        return None
    val = row.get(col)
    if pd.isna(val):
        return None
    return str(val).strip()


def _get_numero(row, col):
    """Obtener valor numerico de una columna"""
    if col is None:
        return None
    val = row.get(col)
    if pd.isna(val):
        return None
    try:
        return float(val)
    except:
        return None


def extraer_items_excel_bytes(excel_bytes, nombre_archivo="cotizacion.xlsx"):
    """
    Extrae items de un Excel desde bytes (para upload directo).
    """
    import tempfile

    # Determinar extension
    ext = '.xlsx' if nombre_archivo.lower().endswith('.xlsx') else '.xls'

    with tempfile.NamedTemporaryFile(suffix=ext, delete=False) as tmp:
        tmp.write(excel_bytes)
        tmp_path = tmp.name

    try:
        resultado = extraer_items_excel(tmp_path)
        return resultado
    finally:
        try:
            os.unlink(tmp_path)
        except:
            pass


# Para testing
if __name__ == "__main__":
    import sys

    if len(sys.argv) < 2:
        print("Uso: python pdf_processor.py <ruta_pdf>")
        sys.exit(1)

    pdf_path = sys.argv[1]
    print(f"\nProcesando: {pdf_path}\n")

    resultado = extraer_items_pdf(pdf_path)

    print(f"\n{'='*60}")
    print(f"RESULTADOS")
    print(f"{'='*60}")
    print(f"Páginas procesadas: {resultado['num_paginas']}")
    print(f"Items extraídos: {len(resultado['items'])}")

    if resultado['errores']:
        print(f"\nErrores: {resultado['errores']}")

    print(f"\n{'='*60}")
    print("ITEMS EXTRAÍDOS:")
    print(f"{'='*60}")

    for i, item in enumerate(resultado['items'], 1):
        print(f"\n{i}. {item['descripcion']}")
        print(f"   Código: {item['codigo']} | Unidad: {item['unidad']}")
        print(f"   Cantidad: {item['cantidad']} | P.U.: ${item['precio_unitario']} | Importe: ${item['importe']}")
