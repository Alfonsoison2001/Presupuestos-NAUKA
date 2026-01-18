"""
Modelos de base de datos SQLite para Presupuestos NAUKA
"""
import sqlite3
from pathlib import Path

DATABASE_PATH = Path(__file__).parent / "database.db"

def get_connection():
    """Obtener conexión a la base de datos"""
    conn = sqlite3.connect(DATABASE_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_database():
    """Inicializar la base de datos con las tablas necesarias"""
    conn = get_connection()
    cursor = conn.cursor()

    # Tabla de Proyectos
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS proyectos (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nombre TEXT NOT NULL UNIQUE,
            descripcion TEXT,
            fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            fecha_modificacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)

    # Tabla de Partidas (datos principales del presupuesto)
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS partidas (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            proyecto_id INTEGER NOT NULL,
            categoria TEXT,
            concepto TEXT,
            detalle TEXT,
            proveedor TEXT,
            unidad TEXT,
            cantidad REAL DEFAULT 0,
            moneda TEXT DEFAULT 'MXN',
            unitario REAL DEFAULT 0,
            importe_sin_iva REAL DEFAULT 0,
            sobrecosto_pct REAL DEFAULT 0,
            sobrecosto_monto REAL DEFAULT 0,
            iva_pct REAL DEFAULT 0,
            iva_monto REAL DEFAULT 0,
            importe_total REAL DEFAULT 0,
            tipo_cambio REAL DEFAULT 1,
            total_mxn REAL DEFAULT 0,
            notas TEXT,
            es_parametro TEXT DEFAULT 'PRESUPUESTO',
            fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            fecha_modificacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (proyecto_id) REFERENCES proyectos(id) ON DELETE CASCADE
        )
    """)

    # Tabla de Glosario - Categorías
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS categorias (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nombre TEXT NOT NULL UNIQUE
        )
    """)

    # Tabla de Glosario - Conceptos
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS conceptos (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            categoria_id INTEGER,
            nombre TEXT NOT NULL,
            FOREIGN KEY (categoria_id) REFERENCES categorias(id) ON DELETE CASCADE
        )
    """)

    # Tabla de Tipos de Cambio
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS tipos_cambio (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            moneda TEXT NOT NULL UNIQUE,
            valor REAL NOT NULL DEFAULT 1
        )
    """)

    # Insertar tipos de cambio por defecto
    cursor.execute("""
        INSERT OR IGNORE INTO tipos_cambio (moneda, valor) VALUES
        ('MXN', 1),
        ('USD', 20.5),
        ('EUR', 22)
    """)

    # Crear índices para mejorar rendimiento
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_partidas_proyecto ON partidas(proyecto_id)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_partidas_categoria ON partidas(categoria)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_partidas_concepto ON partidas(concepto)")

    conn.commit()
    conn.close()
    print("Base de datos inicializada correctamente")

# Funciones CRUD para Proyectos
def crear_proyecto(nombre, descripcion=""):
    conn = get_connection()
    cursor = conn.cursor()
    try:
        cursor.execute(
            "INSERT INTO proyectos (nombre, descripcion) VALUES (?, ?)",
            (nombre, descripcion)
        )
        conn.commit()
        return cursor.lastrowid
    except sqlite3.IntegrityError:
        # Si ya existe, obtener su ID
        cursor.execute("SELECT id FROM proyectos WHERE nombre = ?", (nombre,))
        row = cursor.fetchone()
        return row['id'] if row else None
    finally:
        conn.close()

def obtener_proyectos():
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM proyectos ORDER BY nombre")
    proyectos = [dict(row) for row in cursor.fetchall()]
    conn.close()
    return proyectos

def obtener_proyecto(proyecto_id):
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM proyectos WHERE id = ?", (proyecto_id,))
    row = cursor.fetchone()
    conn.close()
    return dict(row) if row else None

def eliminar_proyecto(proyecto_id):
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM proyectos WHERE id = ?", (proyecto_id,))
    conn.commit()
    conn.close()

# Funciones CRUD para Partidas
def crear_partida(proyecto_id, datos):
    conn = get_connection()
    cursor = conn.cursor()

    # Calcular campos automáticos
    cantidad = float(datos.get('cantidad', 0) or 0)
    unitario = float(datos.get('unitario', 0) or 0)
    importe_sin_iva = cantidad * unitario

    sobrecosto_pct = float(datos.get('sobrecosto_pct', 0) or 0)
    sobrecosto_monto = importe_sin_iva * sobrecosto_pct

    iva_pct = float(datos.get('iva_pct', 0) or 0)
    base_con_sobrecosto = importe_sin_iva + sobrecosto_monto
    iva_monto = base_con_sobrecosto * iva_pct

    importe_total = base_con_sobrecosto + iva_monto

    tipo_cambio = float(datos.get('tipo_cambio', 1) or 1)
    total_mxn = importe_total * tipo_cambio

    cursor.execute("""
        INSERT INTO partidas (
            proyecto_id, categoria, concepto, detalle, proveedor, unidad,
            cantidad, moneda, unitario, importe_sin_iva, sobrecosto_pct,
            sobrecosto_monto, iva_pct, iva_monto, importe_total, tipo_cambio,
            total_mxn, notas, es_parametro
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        proyecto_id,
        datos.get('categoria', ''),
        datos.get('concepto', ''),
        datos.get('detalle', ''),
        datos.get('proveedor', ''),
        datos.get('unidad', ''),
        cantidad,
        datos.get('moneda', 'MXN'),
        unitario,
        importe_sin_iva,
        sobrecosto_pct,
        sobrecosto_monto,
        iva_pct,
        iva_monto,
        importe_total,
        tipo_cambio,
        total_mxn,
        datos.get('notas', ''),
        datos.get('es_parametro', 'PRESUPUESTO')
    ))

    conn.commit()
    partida_id = cursor.lastrowid
    conn.close()
    return partida_id

def obtener_partidas(proyecto_id, categoria=None, concepto=None):
    conn = get_connection()
    cursor = conn.cursor()

    query = "SELECT * FROM partidas WHERE proyecto_id = ?"
    params = [proyecto_id]

    if categoria:
        query += " AND categoria = ?"
        params.append(categoria)

    if concepto:
        query += " AND concepto = ?"
        params.append(concepto)

    query += " ORDER BY categoria, concepto, detalle"

    cursor.execute(query, params)
    partidas = [dict(row) for row in cursor.fetchall()]
    conn.close()
    return partidas

def obtener_partida(partida_id):
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM partidas WHERE id = ?", (partida_id,))
    row = cursor.fetchone()
    conn.close()
    return dict(row) if row else None

def actualizar_partida(partida_id, datos):
    conn = get_connection()
    cursor = conn.cursor()

    # Calcular campos automáticos
    cantidad = float(datos.get('cantidad', 0) or 0)
    unitario = float(datos.get('unitario', 0) or 0)
    importe_sin_iva = cantidad * unitario

    sobrecosto_pct = float(datos.get('sobrecosto_pct', 0) or 0)
    sobrecosto_monto = importe_sin_iva * sobrecosto_pct

    iva_pct = float(datos.get('iva_pct', 0) or 0)
    base_con_sobrecosto = importe_sin_iva + sobrecosto_monto
    iva_monto = base_con_sobrecosto * iva_pct

    importe_total = base_con_sobrecosto + iva_monto

    tipo_cambio = float(datos.get('tipo_cambio', 1) or 1)
    total_mxn = importe_total * tipo_cambio

    cursor.execute("""
        UPDATE partidas SET
            categoria = ?, concepto = ?, detalle = ?, proveedor = ?, unidad = ?,
            cantidad = ?, moneda = ?, unitario = ?, importe_sin_iva = ?,
            sobrecosto_pct = ?, sobrecosto_monto = ?, iva_pct = ?, iva_monto = ?,
            importe_total = ?, tipo_cambio = ?, total_mxn = ?, notas = ?,
            es_parametro = ?, fecha_modificacion = CURRENT_TIMESTAMP
        WHERE id = ?
    """, (
        datos.get('categoria', ''),
        datos.get('concepto', ''),
        datos.get('detalle', ''),
        datos.get('proveedor', ''),
        datos.get('unidad', ''),
        cantidad,
        datos.get('moneda', 'MXN'),
        unitario,
        importe_sin_iva,
        sobrecosto_pct,
        sobrecosto_monto,
        iva_pct,
        iva_monto,
        importe_total,
        tipo_cambio,
        total_mxn,
        datos.get('notas', ''),
        datos.get('es_parametro', 'PRESUPUESTO'),
        partida_id
    ))

    conn.commit()
    conn.close()

def eliminar_partida(partida_id):
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM partidas WHERE id = ?", (partida_id,))
    conn.commit()
    conn.close()

# Funciones para obtener categorías y conceptos únicos
def obtener_categorias_proyecto(proyecto_id):
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT DISTINCT categoria FROM partidas
        WHERE proyecto_id = ? AND categoria IS NOT NULL AND categoria != ''
        ORDER BY categoria
    """, (proyecto_id,))
    categorias = [row['categoria'] for row in cursor.fetchall()]
    conn.close()
    return categorias

def obtener_conceptos_proyecto(proyecto_id, categoria=None):
    conn = get_connection()
    cursor = conn.cursor()

    if categoria:
        cursor.execute("""
            SELECT DISTINCT concepto FROM partidas
            WHERE proyecto_id = ? AND categoria = ? AND concepto IS NOT NULL AND concepto != ''
            ORDER BY concepto
        """, (proyecto_id, categoria))
    else:
        cursor.execute("""
            SELECT DISTINCT concepto FROM partidas
            WHERE proyecto_id = ? AND concepto IS NOT NULL AND concepto != ''
            ORDER BY concepto
        """, (proyecto_id,))

    conceptos = [row['concepto'] for row in cursor.fetchall()]
    conn.close()
    return conceptos

# Funciones para resumen/totales
def obtener_resumen_proyecto(proyecto_id):
    conn = get_connection()
    cursor = conn.cursor()

    cursor.execute("""
        SELECT
            categoria,
            COUNT(*) as num_partidas,
            SUM(total_mxn) as total_categoria
        FROM partidas
        WHERE proyecto_id = ?
        GROUP BY categoria
        ORDER BY total_categoria DESC
    """, (proyecto_id,))

    resumen_categorias = [dict(row) for row in cursor.fetchall()]

    cursor.execute("""
        SELECT
            SUM(total_mxn) as total_proyecto,
            COUNT(*) as total_partidas
        FROM partidas
        WHERE proyecto_id = ?
    """, (proyecto_id,))

    totales = dict(cursor.fetchone())

    conn.close()

    return {
        'categorias': resumen_categorias,
        'total_proyecto': totales['total_proyecto'] or 0,
        'total_partidas': totales['total_partidas'] or 0
    }

# Tipos de cambio
def obtener_tipos_cambio():
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM tipos_cambio ORDER BY moneda")
    tipos = [dict(row) for row in cursor.fetchall()]
    conn.close()
    return tipos

def actualizar_tipo_cambio(moneda, valor):
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        "INSERT OR REPLACE INTO tipos_cambio (moneda, valor) VALUES (?, ?)",
        (moneda, valor)
    )
    conn.commit()
    conn.close()

if __name__ == "__main__":
    init_database()
