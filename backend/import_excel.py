"""
Script para importar archivos Excel de presupuestos NAUKA a la base de datos
"""
import pandas as pd
from pathlib import Path
import sys
import re

# Agregar el directorio actual al path para importar models
sys.path.insert(0, str(Path(__file__).parent))

from models import (
    init_database, get_connection, crear_proyecto,
    obtener_proyectos
)

# Ruta a los archivos Excel
EXCEL_FOLDER = Path(r"C:\Users\Alfonso Ison\iCloudDrive\Desktop\PPTO NAUKA CLAUDE")

# Mapeo de archivos a nombres de proyecto
ARCHIVOS_PROYECTOS = {
    "IZ - NAUKA PPTO Lote 3 170126.xlsx": "Lote 3",
    "IZ - NAUKA PPTO Lote 44 170126.xlsx": "Lote 44",
    "NAUKA - PPTO Casas Golf 281025.xlsx": "Casas Golf",
    "IZ - NAUKA PPTO Beachfront 170125.xlsx": "Beachfront"
}

def limpiar_valor(valor):
    """Limpiar y convertir valores del Excel"""
    if pd.isna(valor) or valor is None:
        return None
    if isinstance(valor, str):
        valor = valor.strip()
        if valor in ['', 'S/D', 's/d', 'N/A', 'n/a', '-']:
            return None
    return valor

def limpiar_numero(valor):
    """Convertir valor a número, manejando errores"""
    if pd.isna(valor) or valor is None:
        return 0
    try:
        return float(valor)
    except (ValueError, TypeError):
        return 0

def importar_excel(archivo_path, nombre_proyecto):
    """Importar un archivo Excel a la base de datos"""
    print(f"\n{'='*60}")
    print(f"Importando: {nombre_proyecto}")
    print(f"Archivo: {archivo_path.name}")
    print('='*60)

    # Leer el archivo Excel, hoja BD
    try:
        df = pd.read_excel(archivo_path, sheet_name="BD", header=None)
    except Exception as e:
        print(f"Error al leer el archivo: {e}")
        return False

    # Encontrar la fila de encabezados (buscar "CATEGORÍA" o "CATEGORIA")
    header_row = None
    for idx, row in df.iterrows():
        row_values = [str(v).upper() if pd.notna(v) else '' for v in row.values]
        if 'CATEGORIA' in row_values or 'CATEGORÍA' in row_values:
            header_row = idx
            break

    if header_row is None:
        print("No se encontró la fila de encabezados")
        return False

    print(f"Fila de encabezados encontrada: {header_row + 1}")

    # Obtener los encabezados
    headers = df.iloc[header_row].tolist()

    # Mapear columnas por nombre (buscar índices)
    col_map = {}
    for idx, h in enumerate(headers):
        if pd.notna(h):
            h_upper = str(h).upper().strip()
            if 'CATEGORIA' in h_upper or 'CATEGORÍA' in h_upper:
                col_map['categoria'] = idx
            elif h_upper == 'CONCEPTO':
                col_map['concepto'] = idx
            elif h_upper == 'DETALLE':
                col_map['detalle'] = idx
            elif h_upper == 'PROVEEDOR':
                col_map['proveedor'] = idx
            elif h_upper == 'UNIDAD':
                col_map['unidad'] = idx
            elif h_upper == 'CANTIDAD':
                col_map['cantidad'] = idx
            elif h_upper == 'MONEDA':
                col_map['moneda'] = idx
            elif 'UNITARIO' in h_upper:
                col_map['unitario'] = idx
            elif 'IMPORTE SIN IVA' in h_upper:
                col_map['importe_sin_iva'] = idx
            elif h_upper == 'SOBRECOSTO' or h_upper == '% SOBRECOSTO':
                col_map['sobrecosto_pct'] = idx
            elif 'TOTAL SOBRECOSTO' in h_upper:
                col_map['sobrecosto_monto'] = idx
            elif h_upper == '% IVA':
                col_map['iva_pct'] = idx
            elif h_upper == '$ IVA':
                col_map['iva_monto'] = idx
            elif 'IMPORTE TOTAL' in h_upper:
                col_map['importe_total'] = idx
            elif h_upper in ['T.C', 'T.C.', 'TC', 'TIPO CAMBIO']:
                col_map['tipo_cambio'] = idx
            elif 'TOTAL MXN' in h_upper:
                col_map['total_mxn'] = idx
            elif h_upper == 'NOTAS':
                col_map['notas'] = idx
            elif 'PARAMETR' in h_upper or 'PPTO' in h_upper:
                col_map['es_parametro'] = idx
            elif h_upper == 'TORRE':
                col_map['torre'] = idx
            elif h_upper == 'PISO':
                col_map['piso'] = idx
            elif h_upper == 'DEPTO' or h_upper == 'DEPARTAMENTO':
                col_map['depto'] = idx

    print(f"Columnas mapeadas: {list(col_map.keys())}")

    # Crear o obtener el proyecto
    proyecto_id = crear_proyecto(nombre_proyecto, f"Importado desde {archivo_path.name}")
    print(f"Proyecto ID: {proyecto_id}")

    # Limpiar partidas existentes del proyecto
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM partidas WHERE proyecto_id = ?", (proyecto_id,))
    conn.commit()

    # Importar datos (desde la fila después de los encabezados)
    partidas_importadas = 0
    partidas_error = 0

    for idx in range(header_row + 1, len(df)):
        row = df.iloc[idx]

        # Saltar filas vacías o sin categoría
        categoria = limpiar_valor(row.iloc[col_map.get('categoria', 1)] if 'categoria' in col_map else None)
        if not categoria:
            continue

        try:
            # Extraer datos de la fila
            datos = {
                'categoria': categoria,
                'concepto': limpiar_valor(row.iloc[col_map['concepto']]) if 'concepto' in col_map else '',
                'detalle': limpiar_valor(row.iloc[col_map['detalle']]) if 'detalle' in col_map else '',
                'proveedor': limpiar_valor(row.iloc[col_map['proveedor']]) if 'proveedor' in col_map else '',
                'unidad': limpiar_valor(row.iloc[col_map['unidad']]) if 'unidad' in col_map else '',
                'cantidad': limpiar_numero(row.iloc[col_map['cantidad']]) if 'cantidad' in col_map else 0,
                'moneda': limpiar_valor(row.iloc[col_map['moneda']]) if 'moneda' in col_map else 'MXN',
                'unitario': limpiar_numero(row.iloc[col_map['unitario']]) if 'unitario' in col_map else 0,
                'importe_sin_iva': limpiar_numero(row.iloc[col_map['importe_sin_iva']]) if 'importe_sin_iva' in col_map else 0,
                'sobrecosto_pct': limpiar_numero(row.iloc[col_map['sobrecosto_pct']]) if 'sobrecosto_pct' in col_map else 0,
                'sobrecosto_monto': limpiar_numero(row.iloc[col_map['sobrecosto_monto']]) if 'sobrecosto_monto' in col_map else 0,
                'iva_pct': limpiar_numero(row.iloc[col_map['iva_pct']]) if 'iva_pct' in col_map else 0,
                'iva_monto': limpiar_numero(row.iloc[col_map['iva_monto']]) if 'iva_monto' in col_map else 0,
                'importe_total': limpiar_numero(row.iloc[col_map['importe_total']]) if 'importe_total' in col_map else 0,
                'tipo_cambio': limpiar_numero(row.iloc[col_map['tipo_cambio']]) if 'tipo_cambio' in col_map else 1,
                'total_mxn': limpiar_numero(row.iloc[col_map['total_mxn']]) if 'total_mxn' in col_map else 0,
                'notas': limpiar_valor(row.iloc[col_map['notas']]) if 'notas' in col_map else '',
                'es_parametro': limpiar_valor(row.iloc[col_map['es_parametro']]) if 'es_parametro' in col_map else 'PRESUPUESTO',
                'torre': limpiar_valor(row.iloc[col_map['torre']]) if 'torre' in col_map else '',
                'piso': limpiar_valor(row.iloc[col_map['piso']]) if 'piso' in col_map else '',
                'depto': limpiar_valor(row.iloc[col_map['depto']]) if 'depto' in col_map else ''
            }

            # Asegurar moneda válida
            if not datos['moneda']:
                datos['moneda'] = 'MXN'

            # Asegurar tipo de cambio válido
            if datos['tipo_cambio'] == 0:
                datos['tipo_cambio'] = 1

            # Insertar partida
            cursor.execute("""
                INSERT INTO partidas (
                    proyecto_id, categoria, concepto, detalle, proveedor, unidad,
                    cantidad, moneda, unitario, importe_sin_iva, sobrecosto_pct,
                    sobrecosto_monto, iva_pct, iva_monto, importe_total, tipo_cambio,
                    total_mxn, notas, es_parametro, torre, piso, depto
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                proyecto_id,
                datos['categoria'],
                datos['concepto'] or '',
                datos['detalle'] or '',
                datos['proveedor'] or '',
                datos['unidad'] or '',
                datos['cantidad'],
                datos['moneda'],
                datos['unitario'],
                datos['importe_sin_iva'],
                datos['sobrecosto_pct'],
                datos['sobrecosto_monto'],
                datos['iva_pct'],
                datos['iva_monto'],
                datos['importe_total'],
                datos['tipo_cambio'],
                datos['total_mxn'],
                datos['notas'] or '',
                datos['es_parametro'] or 'PRESUPUESTO',
                datos['torre'] or '',
                datos['piso'] or '',
                datos['depto'] or ''
            ))

            partidas_importadas += 1

        except Exception as e:
            partidas_error += 1
            if partidas_error <= 5:  # Solo mostrar primeros 5 errores
                print(f"  Error en fila {idx + 1}: {e}")

    conn.commit()
    conn.close()

    print(f"\nResultado:")
    print(f"  - Partidas importadas: {partidas_importadas}")
    print(f"  - Errores: {partidas_error}")

    return True

def importar_todos():
    """Importar todos los archivos Excel"""
    print("\n" + "="*60)
    print("IMPORTACIÓN DE PRESUPUESTOS NAUKA")
    print("="*60)

    # Inicializar base de datos
    init_database()

    # Verificar que existe la carpeta
    if not EXCEL_FOLDER.exists():
        print(f"ERROR: No se encuentra la carpeta {EXCEL_FOLDER}")
        return

    # Importar cada archivo
    archivos_procesados = 0
    for archivo, nombre_proyecto in ARCHIVOS_PROYECTOS.items():
        archivo_path = EXCEL_FOLDER / archivo
        if archivo_path.exists():
            if importar_excel(archivo_path, nombre_proyecto):
                archivos_procesados += 1
        else:
            print(f"\nAdvertencia: No se encontró {archivo}")

    # Resumen final
    print("\n" + "="*60)
    print("RESUMEN DE IMPORTACIÓN")
    print("="*60)
    print(f"Archivos procesados: {archivos_procesados}/{len(ARCHIVOS_PROYECTOS)}")

    # Mostrar proyectos importados
    proyectos = obtener_proyectos()
    print(f"\nProyectos en la base de datos:")
    for p in proyectos:
        print(f"  - {p['nombre']} (ID: {p['id']})")

    # Mostrar totales por proyecto
    conn = get_connection()
    cursor = conn.cursor()
    print(f"\nTotales por proyecto:")
    for p in proyectos:
        cursor.execute("""
            SELECT COUNT(*) as partidas, SUM(total_mxn) as total
            FROM partidas WHERE proyecto_id = ?
        """, (p['id'],))
        row = cursor.fetchone()
        total = row['total'] or 0
        print(f"  - {p['nombre']}: {row['partidas']} partidas, ${total:,.2f} MXN")
    conn.close()

if __name__ == "__main__":
    importar_todos()
