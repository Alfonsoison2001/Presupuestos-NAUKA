"""
Procesador de archivos Excel de cotizaciones.
Extrae items/unitarios de cotizaciones en formato estructurado.

Nota: La funcionalidad de PDF con Claude Vision fue eliminada.
El usuario debe convertir los PDFs a Excel antes de subirlos.
"""
import os
from pathlib import Path
import pandas as pd


def extraer_items_excel(archivo_path):
    """
    Extrae items de un archivo Excel de cotizacion.
    Detecta automaticamente la fila de encabezados y las columnas.
    """
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
        print("Uso: python pdf_processor.py <ruta_excel>")
        print("Solo se aceptan archivos Excel (.xlsx, .xls)")
        sys.exit(1)

    archivo_path = sys.argv[1]

    if not archivo_path.lower().endswith(('.xlsx', '.xls')):
        print("Error: Solo se aceptan archivos Excel (.xlsx, .xls)")
        print("Convierte tu PDF a Excel antes de procesarlo.")
        sys.exit(1)

    print(f"\nProcesando: {archivo_path}\n")

    resultado = extraer_items_excel(archivo_path)

    print(f"\n{'='*60}")
    print(f"RESULTADOS")
    print(f"{'='*60}")
    print(f"Items extraidos: {len(resultado['items'])}")

    if resultado['errores']:
        print(f"\nErrores: {resultado['errores']}")

    print(f"\n{'='*60}")
    print("ITEMS EXTRAIDOS:")
    print(f"{'='*60}")

    for i, item in enumerate(resultado['items'], 1):
        print(f"\n{i}. {item['descripcion']}")
        print(f"   Codigo: {item['codigo']} | Unidad: {item['unidad']}")
        print(f"   Cantidad: {item['cantidad']} | P.U.: ${item['precio_unitario']} | Importe: ${item['importe']}")
