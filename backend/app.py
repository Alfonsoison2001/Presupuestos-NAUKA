"""
Servidor Flask para la aplicación de Presupuestos NAUKA
"""
from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS
from pathlib import Path
import sys

# Agregar el directorio actual al path
sys.path.insert(0, str(Path(__file__).parent))

from models import (
    init_database,
    obtener_proyectos, obtener_proyecto, crear_proyecto, eliminar_proyecto,
    obtener_partidas, obtener_partida, crear_partida, actualizar_partida, eliminar_partida,
    obtener_categorias_proyecto, obtener_conceptos_proyecto,
    obtener_resumen_proyecto, obtener_tipos_cambio, actualizar_tipo_cambio,
    obtener_resumen_agrupado, obtener_torres_proyecto, obtener_pisos_proyecto,
    obtener_proveedores_proyecto, obtener_deptos_proyecto,
    obtener_resumen_jerarquico_nivel1, obtener_resumen_jerarquico_nivel2,
    obtener_resumen_jerarquico_nivel3,
    obtener_glosario_proyecto, agregar_categoria_glosario, eliminar_categoria_glosario,
    agregar_concepto_glosario, eliminar_concepto_glosario, importar_glosario_desde_partidas,
    importar_glosario_desde_excel,
    obtener_proveedores_por_categoria_global, obtener_estadisticas_proveedor,
    # Cotizaciones
    crear_cotizacion, obtener_cotizaciones, obtener_cotizacion, actualizar_cotizacion,
    eliminar_cotizacion, crear_items_cotizacion, obtener_items_cotizacion,
    actualizar_item_cotizacion, eliminar_item_cotizacion,
    obtener_proveedores_cotizaciones, comparar_unitarios
)
from pdf_processor import extraer_items_pdf_bytes, extraer_items_excel_bytes

# Ruta de los archivos Excel
EXCEL_PATH = Path("C:/Users/Alfonso Ison/iCloudDrive/Desktop/PPTO NAUKA CLAUDE")

app = Flask(__name__, static_folder='../frontend', static_url_path='')
CORS(app)

# Inicializar base de datos al arrancar
init_database()

# ============== RUTAS FRONTEND ==============

@app.route('/')
def index():
    """Servir página principal"""
    return send_from_directory(app.static_folder, 'index.html')

@app.route('/<path:path>')
def serve_static(path):
    """Servir archivos estáticos"""
    return send_from_directory(app.static_folder, path)

# ============== API: PROYECTOS ==============

@app.route('/api/proyectos', methods=['GET'])
def api_obtener_proyectos():
    """Obtener lista de proyectos"""
    proyectos = obtener_proyectos()
    return jsonify(proyectos)

@app.route('/api/proyectos/<int:proyecto_id>', methods=['GET'])
def api_obtener_proyecto(proyecto_id):
    """Obtener un proyecto específico"""
    proyecto = obtener_proyecto(proyecto_id)
    if proyecto:
        return jsonify(proyecto)
    return jsonify({'error': 'Proyecto no encontrado'}), 404

@app.route('/api/proyectos', methods=['POST'])
def api_crear_proyecto():
    """Crear un nuevo proyecto"""
    datos = request.json
    nombre = datos.get('nombre')
    descripcion = datos.get('descripcion', '')

    if not nombre:
        return jsonify({'error': 'El nombre es requerido'}), 400

    proyecto_id = crear_proyecto(nombre, descripcion)
    return jsonify({'id': proyecto_id, 'nombre': nombre, 'descripcion': descripcion})

@app.route('/api/proyectos/<int:proyecto_id>', methods=['DELETE'])
def api_eliminar_proyecto(proyecto_id):
    """Eliminar un proyecto"""
    eliminar_proyecto(proyecto_id)
    return jsonify({'success': True})

# ============== API: PARTIDAS ==============

@app.route('/api/proyectos/<int:proyecto_id>/partidas', methods=['GET'])
def api_obtener_partidas(proyecto_id):
    """Obtener partidas de un proyecto"""
    categoria = request.args.get('categoria')
    concepto = request.args.get('concepto')
    partidas = obtener_partidas(proyecto_id, categoria, concepto)
    return jsonify(partidas)

@app.route('/api/partidas/<int:partida_id>', methods=['GET'])
def api_obtener_partida(partida_id):
    """Obtener una partida específica"""
    partida = obtener_partida(partida_id)
    if partida:
        return jsonify(partida)
    return jsonify({'error': 'Partida no encontrada'}), 404

@app.route('/api/proyectos/<int:proyecto_id>/partidas', methods=['POST'])
def api_crear_partida(proyecto_id):
    """Crear una nueva partida"""
    datos = request.json
    partida_id = crear_partida(proyecto_id, datos)
    partida = obtener_partida(partida_id)
    return jsonify(partida)

@app.route('/api/partidas/<int:partida_id>', methods=['PUT'])
def api_actualizar_partida(partida_id):
    """Actualizar una partida"""
    datos = request.json
    actualizar_partida(partida_id, datos)
    partida = obtener_partida(partida_id)
    return jsonify(partida)

@app.route('/api/partidas/<int:partida_id>', methods=['DELETE'])
def api_eliminar_partida(partida_id):
    """Eliminar una partida"""
    eliminar_partida(partida_id)
    return jsonify({'success': True})

# ============== API: FILTROS Y GLOSARIO ==============

@app.route('/api/proyectos/<int:proyecto_id>/categorias', methods=['GET'])
def api_obtener_categorias(proyecto_id):
    """Obtener categorías únicas de un proyecto"""
    categorias = obtener_categorias_proyecto(proyecto_id)
    return jsonify(categorias)

@app.route('/api/proyectos/<int:proyecto_id>/conceptos', methods=['GET'])
def api_obtener_conceptos(proyecto_id):
    """Obtener conceptos únicos de un proyecto"""
    categoria = request.args.get('categoria')
    conceptos = obtener_conceptos_proyecto(proyecto_id, categoria)
    return jsonify(conceptos)

# ============== API: RESUMEN ==============

@app.route('/api/proyectos/<int:proyecto_id>/resumen', methods=['GET'])
def api_obtener_resumen(proyecto_id):
    """Obtener resumen del proyecto"""
    resumen = obtener_resumen_proyecto(proyecto_id)
    return jsonify(resumen)

@app.route('/api/proyectos/<int:proyecto_id>/resumen-agrupado', methods=['GET'])
def api_obtener_resumen_agrupado(proyecto_id):
    """Obtener resumen agrupado por campos especificados"""
    agrupar_por_str = request.args.get('agrupar_por', 'categoria')
    agrupar_por = [c.strip() for c in agrupar_por_str.split(',') if c.strip()]
    resumen = obtener_resumen_agrupado(proyecto_id, agrupar_por)
    return jsonify(resumen)

@app.route('/api/proyectos/<int:proyecto_id>/torres', methods=['GET'])
def api_obtener_torres(proyecto_id):
    """Obtener torres unicas de un proyecto"""
    torres = obtener_torres_proyecto(proyecto_id)
    return jsonify(torres)

@app.route('/api/proyectos/<int:proyecto_id>/pisos', methods=['GET'])
def api_obtener_pisos(proyecto_id):
    """Obtener pisos unicos de un proyecto"""
    pisos = obtener_pisos_proyecto(proyecto_id)
    return jsonify(pisos)

@app.route('/api/proyectos/<int:proyecto_id>/proveedores', methods=['GET'])
def api_obtener_proveedores(proyecto_id):
    """Obtener proveedores unicos de un proyecto"""
    proveedores = obtener_proveedores_proyecto(proyecto_id)
    return jsonify(proveedores)

@app.route('/api/proyectos/<int:proyecto_id>/deptos', methods=['GET'])
def api_obtener_deptos(proyecto_id):
    """Obtener departamentos unicos de un proyecto"""
    deptos = obtener_deptos_proyecto(proyecto_id)
    return jsonify(deptos)

# ============== API: RESUMEN JERARQUICO ==============

@app.route('/api/proyectos/<int:proyecto_id>/resumen-jerarquico', methods=['GET'])
def api_resumen_jerarquico_nivel1(proyecto_id):
    """Obtener nivel 1 del resumen jerárquico: Categorías"""
    filtros = {}
    if request.args.get('torre'):
        filtros['torre'] = request.args.get('torre')
    if request.args.get('piso'):
        filtros['piso'] = request.args.get('piso')
    if request.args.get('depto'):
        filtros['depto'] = request.args.get('depto')

    resumen = obtener_resumen_jerarquico_nivel1(proyecto_id, filtros if filtros else None)
    return jsonify(resumen)

@app.route('/api/proyectos/<int:proyecto_id>/resumen-jerarquico/categoria/<path:categoria>', methods=['GET'])
def api_resumen_jerarquico_nivel2(proyecto_id, categoria):
    """Obtener nivel 2 del resumen jerárquico: Conceptos de una categoría"""
    filtros = {}
    if request.args.get('torre'):
        filtros['torre'] = request.args.get('torre')
    if request.args.get('piso'):
        filtros['piso'] = request.args.get('piso')
    if request.args.get('depto'):
        filtros['depto'] = request.args.get('depto')

    resumen = obtener_resumen_jerarquico_nivel2(proyecto_id, categoria, filtros if filtros else None)
    return jsonify(resumen)

@app.route('/api/proyectos/<int:proyecto_id>/resumen-jerarquico/categoria/<path:categoria>/concepto/<path:concepto>', methods=['GET'])
def api_resumen_jerarquico_nivel3(proyecto_id, categoria, concepto):
    """Obtener nivel 3 del resumen jerárquico: Detalles de un concepto"""
    filtros = {}
    if request.args.get('torre'):
        filtros['torre'] = request.args.get('torre')
    if request.args.get('piso'):
        filtros['piso'] = request.args.get('piso')
    if request.args.get('depto'):
        filtros['depto'] = request.args.get('depto')

    resumen = obtener_resumen_jerarquico_nivel3(proyecto_id, categoria, concepto, filtros if filtros else None)
    return jsonify(resumen)

# ============== API: TIPOS DE CAMBIO ==============

@app.route('/api/tipos-cambio', methods=['GET'])
def api_obtener_tipos_cambio():
    """Obtener tipos de cambio"""
    tipos = obtener_tipos_cambio()
    return jsonify(tipos)

@app.route('/api/tipos-cambio', methods=['POST'])
def api_actualizar_tipo_cambio():
    """Actualizar un tipo de cambio"""
    datos = request.json
    moneda = datos.get('moneda')
    valor = datos.get('valor')

    if not moneda or valor is None:
        return jsonify({'error': 'Moneda y valor son requeridos'}), 400

    actualizar_tipo_cambio(moneda, float(valor))
    return jsonify({'success': True})

# ============== API: GLOSARIO ==============

@app.route('/api/proyectos/<int:proyecto_id>/glosario', methods=['GET'])
def api_obtener_glosario(proyecto_id):
    """Obtener glosario completo del proyecto"""
    glosario = obtener_glosario_proyecto(proyecto_id)
    return jsonify(glosario)

@app.route('/api/proyectos/<int:proyecto_id>/glosario/categorias', methods=['POST'])
def api_agregar_categoria_glosario(proyecto_id):
    """Agregar una categoría al glosario"""
    datos = request.json
    nombre = datos.get('nombre')

    if not nombre or not nombre.strip():
        return jsonify({'error': 'El nombre es requerido'}), 400

    resultado = agregar_categoria_glosario(proyecto_id, nombre)
    if resultado:
        return jsonify(resultado)
    return jsonify({'error': 'La categoría ya existe'}), 409

@app.route('/api/glosario/categorias/<int:categoria_id>', methods=['DELETE'])
def api_eliminar_categoria_glosario(categoria_id):
    """Eliminar una categoría del glosario"""
    eliminar_categoria_glosario(categoria_id)
    return jsonify({'success': True})

@app.route('/api/glosario/categorias/<int:categoria_id>/conceptos', methods=['POST'])
def api_agregar_concepto_glosario(categoria_id):
    """Agregar un concepto a una categoría"""
    datos = request.json
    nombre = datos.get('nombre')

    if not nombre or not nombre.strip():
        return jsonify({'error': 'El nombre es requerido'}), 400

    resultado = agregar_concepto_glosario(categoria_id, nombre)
    if resultado:
        return jsonify(resultado)
    return jsonify({'error': 'El concepto ya existe en esta categoría'}), 409

@app.route('/api/glosario/conceptos/<int:concepto_id>', methods=['DELETE'])
def api_eliminar_concepto_glosario(concepto_id):
    """Eliminar un concepto del glosario"""
    eliminar_concepto_glosario(concepto_id)
    return jsonify({'success': True})

@app.route('/api/proyectos/<int:proyecto_id>/glosario/importar', methods=['POST'])
def api_importar_glosario(proyecto_id):
    """Importar categorías y conceptos desde las partidas existentes"""
    resultado = importar_glosario_desde_partidas(proyecto_id)
    return jsonify(resultado)

@app.route('/api/proyectos/<int:proyecto_id>/glosario/importar-excel', methods=['POST'])
def api_importar_glosario_excel(proyecto_id):
    """Importar glosario desde el archivo Excel del proyecto"""
    # Obtener el proyecto para saber qué archivo usar
    proyecto = obtener_proyecto(proyecto_id)
    if not proyecto:
        return jsonify({'error': 'Proyecto no encontrado'}), 404

    # Mapear proyecto a archivo Excel
    nombre_proyecto = proyecto['nombre'].lower()
    archivo_excel = None

    if 'beachfront' in nombre_proyecto:
        archivo_excel = EXCEL_PATH / "IZ - NAUKA PPTO Beachfront 170125.xlsx"
    elif 'lote 3' in nombre_proyecto or 'lote3' in nombre_proyecto:
        archivo_excel = EXCEL_PATH / "IZ - NAUKA PPTO Lote 3 170126.xlsx"
    elif 'lote 44' in nombre_proyecto or 'lote44' in nombre_proyecto:
        archivo_excel = EXCEL_PATH / "IZ - NAUKA PPTO Lote 44 170126.xlsx"
    elif 'golf' in nombre_proyecto:
        archivo_excel = EXCEL_PATH / "NAUKA - PPTO Casas Golf 281025.xlsx"

    if not archivo_excel or not archivo_excel.exists():
        return jsonify({'error': f'No se encontró archivo Excel para el proyecto: {proyecto["nombre"]}'}), 404

    resultado = importar_glosario_desde_excel(proyecto_id, str(archivo_excel))

    if 'error' in resultado:
        return jsonify(resultado), 400

    return jsonify(resultado)

# ============== API: GLOSARIO GLOBAL DE PROVEEDORES ==============

@app.route('/api/proveedores-global', methods=['GET'])
def api_proveedores_global():
    """Obtener glosario global de proveedores por categoría (todos los proyectos)"""
    proveedores = obtener_proveedores_por_categoria_global()
    return jsonify(proveedores)

@app.route('/api/proveedores-global/<path:proveedor>/estadisticas', methods=['GET'])
def api_estadisticas_proveedor(proveedor):
    """Obtener estadísticas de un proveedor específico"""
    stats = obtener_estadisticas_proveedor(proveedor)
    return jsonify(stats)

# ============== API: COTIZACIONES ==============

# Directorio para guardar PDFs subidos
UPLOAD_FOLDER = Path(__file__).parent / "uploads"
UPLOAD_FOLDER.mkdir(exist_ok=True)

@app.route('/api/cotizaciones', methods=['GET'])
def api_obtener_cotizaciones():
    """Obtener lista de cotizaciones con filtros opcionales"""
    proyecto_id = request.args.get('proyecto_id', type=int)
    proveedor = request.args.get('proveedor')
    categoria = request.args.get('categoria')

    cotizaciones = obtener_cotizaciones(proyecto_id, proveedor, categoria)
    return jsonify(cotizaciones)

@app.route('/api/cotizaciones/<int:cotizacion_id>', methods=['GET'])
def api_obtener_cotizacion(cotizacion_id):
    """Obtener una cotización específica"""
    cotizacion = obtener_cotizacion(cotizacion_id)
    if cotizacion:
        return jsonify(cotizacion)
    return jsonify({'error': 'Cotización no encontrada'}), 404

@app.route('/api/cotizaciones/upload', methods=['POST'])
def api_subir_cotizacion():
    """
    Subir y procesar un PDF de cotización.
    Extrae items usando Claude Vision.
    """
    import traceback
    print("=== INICIO UPLOAD COTIZACION ===")

    # Verificar que hay archivo
    if 'archivo' not in request.files:
        return jsonify({'error': 'No se envió archivo'}), 400

    archivo = request.files['archivo']
    if archivo.filename == '':
        return jsonify({'error': 'Nombre de archivo vacío'}), 400

    # Verificar extension permitida
    nombre_lower = archivo.filename.lower()
    es_pdf = nombre_lower.endswith('.pdf')
    es_excel = nombre_lower.endswith('.xlsx') or nombre_lower.endswith('.xls')

    if not es_pdf and not es_excel:
        return jsonify({'error': 'Solo se permiten archivos PDF o Excel (.xlsx, .xls)'}), 400

    # Obtener datos del formulario
    proyecto_id = request.form.get('proyecto_id', type=int)
    proveedor = request.form.get('proveedor', '').strip()
    categorias = request.form.getlist('categorias[]')  # Lista de categorías
    if not categorias:
        # Intentar obtener como JSON string
        categorias_str = request.form.get('categorias', '')
        if categorias_str:
            import json
            try:
                categorias = json.loads(categorias_str)
            except:
                categorias = [categorias_str] if categorias_str else []

    fecha_cotizacion = request.form.get('fecha_cotizacion')
    moneda = request.form.get('moneda', 'MXN')
    notas = request.form.get('notas', '')

    if not proyecto_id:
        return jsonify({'error': 'proyecto_id es requerido'}), 400
    if not proveedor:
        return jsonify({'error': 'proveedor es requerido'}), 400

    try:
        # Leer bytes del archivo
        print(f"Leyendo archivo: {archivo.filename}")
        file_bytes = archivo.read()
        print(f"Bytes leidos: {len(file_bytes)}")

        # Procesar segun tipo de archivo
        if es_pdf:
            print("Procesando como PDF con Claude Vision...")
            resultado = extraer_items_pdf_bytes(file_bytes, archivo.filename)
        else:
            print("Procesando como Excel...")
            resultado = extraer_items_excel_bytes(file_bytes, archivo.filename)

        print(f"Resultado: {len(resultado.get('items', []))} items, {len(resultado.get('errores', []))} errores")

        if resultado['errores'] and not resultado['items']:
            print(f"Errores encontrados: {resultado['errores'][:3]}")
            return jsonify({
                'error': 'Error procesando PDF',
                'detalles': resultado['errores']
            }), 500

        # Crear la cotización en la base de datos
        cotizacion_id = crear_cotizacion(
            proyecto_id=proyecto_id,
            proveedor=proveedor,
            categorias=categorias,
            archivo_nombre=archivo.filename,
            fecha_cotizacion=fecha_cotizacion,
            moneda=moneda,
            notas=notas
        )

        # Guardar los items extraídos
        if resultado['items']:
            # Agregar moneda a cada item
            for item in resultado['items']:
                item['moneda'] = moneda
            crear_items_cotizacion(cotizacion_id, resultado['items'])

        # Guardar copia del archivo
        ext = '.pdf' if es_pdf else ('.xlsx' if archivo.filename.lower().endswith('.xlsx') else '.xls')
        archivo_path = UPLOAD_FOLDER / f"cotizacion_{cotizacion_id}{ext}"
        with open(archivo_path, 'wb') as f:
            f.write(file_bytes)

        # Obtener la cotización creada
        cotizacion = obtener_cotizacion(cotizacion_id)

        return jsonify({
            'cotizacion': cotizacion,
            'items': resultado['items'],
            'num_paginas': resultado['num_paginas'],
            'errores': resultado['errores']
        })

    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500

@app.route('/api/cotizaciones/<int:cotizacion_id>', methods=['PUT'])
def api_actualizar_cotizacion(cotizacion_id):
    """Actualizar datos de una cotización"""
    datos = request.json
    actualizar_cotizacion(cotizacion_id, datos)
    cotizacion = obtener_cotizacion(cotizacion_id)
    return jsonify(cotizacion)

@app.route('/api/cotizaciones/<int:cotizacion_id>', methods=['DELETE'])
def api_eliminar_cotizacion(cotizacion_id):
    """Eliminar una cotización y sus items"""
    # Eliminar archivo PDF si existe
    pdf_path = UPLOAD_FOLDER / f"cotizacion_{cotizacion_id}.pdf"
    if pdf_path.exists():
        pdf_path.unlink()

    eliminar_cotizacion(cotizacion_id)
    return jsonify({'success': True})

@app.route('/api/cotizaciones/<int:cotizacion_id>/items', methods=['GET'])
def api_obtener_items_cotizacion(cotizacion_id):
    """Obtener items de una cotización"""
    items = obtener_items_cotizacion(cotizacion_id)
    return jsonify(items)

@app.route('/api/cotizaciones/items/<int:item_id>', methods=['PUT'])
def api_actualizar_item_cotizacion(item_id):
    """Actualizar un item de cotización"""
    datos = request.json
    actualizar_item_cotizacion(item_id, datos)
    return jsonify({'success': True})

@app.route('/api/cotizaciones/items/<int:item_id>', methods=['DELETE'])
def api_eliminar_item_cotizacion(item_id):
    """Eliminar un item de cotización"""
    eliminar_item_cotizacion(item_id)
    return jsonify({'success': True})

# ============== API: COMPARACION DE UNITARIOS ==============

@app.route('/api/cotizaciones/proveedores', methods=['GET'])
def api_proveedores_cotizaciones():
    """Obtener lista de proveedores que tienen cotizaciones"""
    proveedores = obtener_proveedores_cotizaciones()
    return jsonify(proveedores)

@app.route('/api/comparar-unitarios', methods=['GET'])
def api_comparar_unitarios():
    """
    Comparar precios unitarios de un proveedor entre proyectos.
    Params: proveedor (requerido), categoria (opcional)
    """
    proveedor = request.args.get('proveedor')
    categoria = request.args.get('categoria')

    if not proveedor:
        return jsonify({'error': 'proveedor es requerido'}), 400

    resultado = comparar_unitarios(proveedor, categoria)
    return jsonify(resultado)

# ============== MAIN ==============

if __name__ == '__main__':
    print("\n" + "="*60)
    print("SERVIDOR PRESUPUESTOS NAUKA")
    print("="*60)
    print("Iniciando servidor en http://localhost:5000")
    print("Presiona Ctrl+C para detener")
    print("="*60 + "\n")

    app.run(debug=True, host='0.0.0.0', port=5000)
