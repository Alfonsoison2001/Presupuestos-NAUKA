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
    obtener_resumen_proyecto, obtener_tipos_cambio, actualizar_tipo_cambio
)

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

# ============== MAIN ==============

if __name__ == '__main__':
    print("\n" + "="*60)
    print("SERVIDOR PRESUPUESTOS NAUKA")
    print("="*60)
    print("Iniciando servidor en http://localhost:5000")
    print("Presiona Ctrl+C para detener")
    print("="*60 + "\n")

    app.run(debug=True, host='0.0.0.0', port=5000)
