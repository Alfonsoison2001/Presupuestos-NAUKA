/**
 * Aplicacion de Presupuestos NAUKA
 * Frontend JavaScript
 */

// Estado de la aplicacion
let estado = {
    proyectoActual: null,
    partidas: [],
    categorias: [],
    conceptos: [],
    filtroCategoria: '',
    filtroConcepto: ''
};

// API Base URL
const API_URL = '/api';

// ============== UTILIDADES ==============

function formatearMoneda(valor, moneda = 'MXN') {
    if (valor === null || valor === undefined || isNaN(valor)) return '$0.00';
    return new Intl.NumberFormat('es-MX', {
        style: 'currency',
        currency: moneda === 'MXN' ? 'MXN' : 'USD',
        minimumFractionDigits: 2
    }).format(valor);
}

function formatearNumero(valor) {
    if (valor === null || valor === undefined || isNaN(valor)) return '0';
    return new Intl.NumberFormat('es-MX', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    }).format(valor);
}

function formatearPorcentaje(valor) {
    if (valor === null || valor === undefined || isNaN(valor)) return '0%';
    return (valor * 100).toFixed(0) + '%';
}

async function fetchAPI(endpoint, options = {}) {
    try {
        const response = await fetch(`${API_URL}${endpoint}`, {
            ...options,
            headers: {
                'Content-Type': 'application/json',
                ...options.headers
            }
        });
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        return await response.json();
    } catch (error) {
        console.error('Error en API:', error);
        throw error;
    }
}

// ============== CARGA INICIAL ==============

document.addEventListener('DOMContentLoaded', async () => {
    await cargarProyectos();
    configurarEventos();
});

async function cargarProyectos() {
    try {
        const proyectos = await fetchAPI('/proyectos');
        const select = document.getElementById('proyecto-select');

        select.innerHTML = '<option value="">Seleccionar proyecto...</option>';
        proyectos.forEach(p => {
            const option = document.createElement('option');
            option.value = p.id;
            option.textContent = p.nombre;
            select.appendChild(option);
        });
    } catch (error) {
        console.error('Error cargando proyectos:', error);
    }
}

function configurarEventos() {
    // Cambio de proyecto
    document.getElementById('proyecto-select').addEventListener('change', async (e) => {
        const proyectoId = e.target.value;
        if (proyectoId) {
            estado.proyectoActual = parseInt(proyectoId);
            await cargarProyecto(proyectoId);
            document.getElementById('btn-nueva-partida').disabled = false;
        } else {
            estado.proyectoActual = null;
            limpiarVista();
            document.getElementById('btn-nueva-partida').disabled = true;
        }
    });

    // Filtros
    document.getElementById('filtro-categoria').addEventListener('change', async (e) => {
        estado.filtroCategoria = e.target.value;
        await cargarConceptos();
        await cargarPartidas();
    });

    document.getElementById('filtro-concepto').addEventListener('change', async () => {
        estado.filtroConcepto = document.getElementById('filtro-concepto').value;
        await cargarPartidas();
    });

    document.getElementById('btn-limpiar-filtros').addEventListener('click', async () => {
        estado.filtroCategoria = '';
        estado.filtroConcepto = '';
        document.getElementById('filtro-categoria').value = '';
        document.getElementById('filtro-concepto').value = '';
        await cargarPartidas();
    });

    // Nueva partida
    document.getElementById('btn-nueva-partida').addEventListener('click', () => {
        abrirModalNuevaPartida();
    });

    // Formulario de partida
    document.getElementById('form-partida').addEventListener('submit', async (e) => {
        e.preventDefault();
        await guardarPartida();
    });

    // Calculos automaticos en el formulario
    const camposCalculo = ['partida-cantidad', 'partida-unitario', 'partida-sobrecosto', 'partida-iva', 'partida-tc'];
    camposCalculo.forEach(id => {
        document.getElementById(id).addEventListener('input', calcularTotales);
    });

    // Cerrar modal con Escape
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            cerrarModal();
        }
    });
}

// ============== CARGA DE DATOS ==============

async function cargarProyecto(proyectoId) {
    try {
        // Cargar resumen, categorias y partidas en paralelo
        const [resumen, categorias] = await Promise.all([
            fetchAPI(`/proyectos/${proyectoId}/resumen`),
            fetchAPI(`/proyectos/${proyectoId}/categorias`)
        ]);

        estado.categorias = categorias;
        mostrarResumen(resumen);
        actualizarFiltroCategorias(categorias);
        await cargarPartidas();
    } catch (error) {
        console.error('Error cargando proyecto:', error);
    }
}

async function cargarPartidas() {
    if (!estado.proyectoActual) return;

    try {
        let url = `/proyectos/${estado.proyectoActual}/partidas`;
        const params = new URLSearchParams();

        if (estado.filtroCategoria) {
            params.append('categoria', estado.filtroCategoria);
        }
        if (estado.filtroConcepto) {
            params.append('concepto', estado.filtroConcepto);
        }

        if (params.toString()) {
            url += '?' + params.toString();
        }

        estado.partidas = await fetchAPI(url);
        mostrarPartidas(estado.partidas);
    } catch (error) {
        console.error('Error cargando partidas:', error);
    }
}

async function cargarConceptos() {
    if (!estado.proyectoActual) return;

    try {
        let url = `/proyectos/${estado.proyectoActual}/conceptos`;
        if (estado.filtroCategoria) {
            url += `?categoria=${encodeURIComponent(estado.filtroCategoria)}`;
        }

        estado.conceptos = await fetchAPI(url);
        actualizarFiltroConceptos(estado.conceptos);
    } catch (error) {
        console.error('Error cargando conceptos:', error);
    }
}

// ============== MOSTRAR DATOS ==============

function mostrarResumen(resumen) {
    const container = document.getElementById('resumen-proyecto');

    let html = `
        <div class="resumen-total">${formatearMoneda(resumen.total_proyecto)}</div>
        <p style="margin-bottom: 16px; color: var(--text-muted);">${resumen.total_partidas} partidas</p>
    `;

    if (resumen.categorias && resumen.categorias.length > 0) {
        resumen.categorias.slice(0, 10).forEach(cat => {
            html += `
                <div class="resumen-categoria">
                    <span class="resumen-categoria-nombre" title="${cat.categoria}">${cat.categoria}</span>
                    <span class="resumen-categoria-total">${formatearMoneda(cat.total_categoria)}</span>
                </div>
            `;
        });

        if (resumen.categorias.length > 10) {
            html += `<p style="color: var(--text-muted); font-size: 12px; margin-top: 8px;">+ ${resumen.categorias.length - 10} categorias mas...</p>`;
        }
    }

    container.innerHTML = html;
}

function mostrarPartidas(partidas) {
    const tbody = document.getElementById('tbody-partidas');

    if (!partidas || partidas.length === 0) {
        tbody.innerHTML = `
            <tr class="empty-row">
                <td colspan="16">No hay partidas${estado.filtroCategoria || estado.filtroConcepto ? ' con los filtros seleccionados' : ''}</td>
            </tr>
        `;
        actualizarContadores(0, 0);
        return;
    }

    let totalFiltrado = 0;

    tbody.innerHTML = partidas.map(p => {
        totalFiltrado += p.total_mxn || 0;
        const tipoClase = p.es_parametro === 'PARAMETRICO' ? 'tipo-parametrico' : 'tipo-presupuesto';

        return `
            <tr data-id="${p.id}">
                <td title="${p.categoria || ''}">${truncar(p.categoria, 20)}</td>
                <td title="${p.concepto || ''}">${truncar(p.concepto, 20)}</td>
                <td title="${p.detalle || ''}">${truncar(p.detalle, 25)}</td>
                <td>${p.proveedor || '-'}</td>
                <td>${p.unidad || '-'}</td>
                <td class="num">${formatearNumero(p.cantidad)}</td>
                <td>${p.moneda || 'MXN'}</td>
                <td class="num">${formatearMoneda(p.unitario, p.moneda)}</td>
                <td class="num">${formatearMoneda(p.importe_sin_iva, p.moneda)}</td>
                <td class="num">${formatearPorcentaje(p.sobrecosto_pct)}</td>
                <td class="num">${formatearPorcentaje(p.iva_pct)}</td>
                <td class="num">${formatearMoneda(p.importe_total, p.moneda)}</td>
                <td class="num">${formatearNumero(p.tipo_cambio)}</td>
                <td class="num currency">${formatearMoneda(p.total_mxn)}</td>
                <td class="${tipoClase}">${p.es_parametro === 'PARAMETRICO' ? 'Param' : 'Ppto'}</td>
                <td>
                    <div class="row-actions">
                        <button class="btn-edit" onclick="editarPartida(${p.id})">Editar</button>
                        <button class="btn-delete" onclick="eliminarPartida(${p.id})">X</button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');

    actualizarContadores(partidas.length, totalFiltrado);
}

function truncar(texto, max) {
    if (!texto) return '-';
    return texto.length > max ? texto.substring(0, max) + '...' : texto;
}

function actualizarContadores(cantidad, total) {
    document.getElementById('contador-partidas').textContent = `${cantidad} partida${cantidad !== 1 ? 's' : ''}`;
    document.getElementById('total-filtrado').textContent = `Total: ${formatearMoneda(total)}`;
}

function actualizarFiltroCategorias(categorias) {
    const select = document.getElementById('filtro-categoria');
    select.innerHTML = '<option value="">Todas</option>';
    categorias.forEach(cat => {
        const option = document.createElement('option');
        option.value = cat;
        option.textContent = cat;
        select.appendChild(option);
    });

    // Actualizar datalist del modal
    const datalist = document.getElementById('lista-categorias');
    datalist.innerHTML = categorias.map(cat => `<option value="${cat}">`).join('');
}

function actualizarFiltroConceptos(conceptos) {
    const select = document.getElementById('filtro-concepto');
    select.innerHTML = '<option value="">Todos</option>';
    conceptos.forEach(con => {
        const option = document.createElement('option');
        option.value = con;
        option.textContent = con;
        select.appendChild(option);
    });

    // Actualizar datalist del modal
    const datalist = document.getElementById('lista-conceptos');
    datalist.innerHTML = conceptos.map(con => `<option value="${con}">`).join('');
}

function limpiarVista() {
    document.getElementById('resumen-proyecto').innerHTML = '<p class="empty-state">Selecciona un proyecto</p>';
    document.getElementById('filtro-categoria').innerHTML = '<option value="">Todas</option>';
    document.getElementById('filtro-concepto').innerHTML = '<option value="">Todos</option>';
    document.getElementById('tbody-partidas').innerHTML = `
        <tr class="empty-row">
            <td colspan="16">Selecciona un proyecto para ver sus partidas</td>
        </tr>
    `;
    actualizarContadores(0, 0);
}

// ============== MODAL Y FORMULARIO ==============

function abrirModalNuevaPartida() {
    document.getElementById('modal-titulo').textContent = 'Nueva Partida';
    document.getElementById('partida-id').value = '';

    // Limpiar formulario
    document.getElementById('partida-categoria').value = '';
    document.getElementById('partida-concepto').value = '';
    document.getElementById('partida-detalle').value = '';
    document.getElementById('partida-proveedor').value = '';
    document.getElementById('partida-unidad').value = '';
    document.getElementById('partida-cantidad').value = '1';
    document.getElementById('partida-moneda').value = 'MXN';
    document.getElementById('partida-unitario').value = '0';
    document.getElementById('partida-sobrecosto').value = '0';
    document.getElementById('partida-iva').value = '16';
    document.getElementById('partida-tc').value = '1';
    document.getElementById('partida-tipo').value = 'PRESUPUESTO';
    document.getElementById('partida-notas').value = '';

    calcularTotales();
    document.getElementById('modal-partida').classList.add('active');
}

async function editarPartida(id) {
    try {
        const partida = await fetchAPI(`/partidas/${id}`);

        document.getElementById('modal-titulo').textContent = 'Editar Partida';
        document.getElementById('partida-id').value = partida.id;
        document.getElementById('partida-categoria').value = partida.categoria || '';
        document.getElementById('partida-concepto').value = partida.concepto || '';
        document.getElementById('partida-detalle').value = partida.detalle || '';
        document.getElementById('partida-proveedor').value = partida.proveedor || '';
        document.getElementById('partida-unidad').value = partida.unidad || '';
        document.getElementById('partida-cantidad').value = partida.cantidad || 0;
        document.getElementById('partida-moneda').value = partida.moneda || 'MXN';
        document.getElementById('partida-unitario').value = partida.unitario || 0;
        document.getElementById('partida-sobrecosto').value = (partida.sobrecosto_pct || 0) * 100;
        document.getElementById('partida-iva').value = (partida.iva_pct || 0) * 100;
        document.getElementById('partida-tc').value = partida.tipo_cambio || 1;
        document.getElementById('partida-tipo').value = partida.es_parametro || 'PRESUPUESTO';
        document.getElementById('partida-notas').value = partida.notas || '';

        calcularTotales();
        document.getElementById('modal-partida').classList.add('active');
    } catch (error) {
        console.error('Error cargando partida:', error);
        alert('Error al cargar la partida');
    }
}

function cerrarModal() {
    document.getElementById('modal-partida').classList.remove('active');
}

function calcularTotales() {
    const cantidad = parseFloat(document.getElementById('partida-cantidad').value) || 0;
    const unitario = parseFloat(document.getElementById('partida-unitario').value) || 0;
    const sobrecostoPct = parseFloat(document.getElementById('partida-sobrecosto').value) / 100 || 0;
    const ivaPct = parseFloat(document.getElementById('partida-iva').value) / 100 || 0;
    const tc = parseFloat(document.getElementById('partida-tc').value) || 1;

    const importeSinIva = cantidad * unitario;
    const sobrecosto = importeSinIva * sobrecostoPct;
    const baseConSobrecosto = importeSinIva + sobrecosto;
    const iva = baseConSobrecosto * ivaPct;
    const total = baseConSobrecosto + iva;
    const totalMxn = total * tc;

    document.getElementById('partida-importe').value = formatearMoneda(importeSinIva);
    document.getElementById('partida-total-mxn').value = formatearMoneda(totalMxn);
}

async function guardarPartida() {
    const partidaId = document.getElementById('partida-id').value;

    const datos = {
        categoria: document.getElementById('partida-categoria').value,
        concepto: document.getElementById('partida-concepto').value,
        detalle: document.getElementById('partida-detalle').value,
        proveedor: document.getElementById('partida-proveedor').value,
        unidad: document.getElementById('partida-unidad').value,
        cantidad: parseFloat(document.getElementById('partida-cantidad').value) || 0,
        moneda: document.getElementById('partida-moneda').value,
        unitario: parseFloat(document.getElementById('partida-unitario').value) || 0,
        sobrecosto_pct: parseFloat(document.getElementById('partida-sobrecosto').value) / 100 || 0,
        iva_pct: parseFloat(document.getElementById('partida-iva').value) / 100 || 0,
        tipo_cambio: parseFloat(document.getElementById('partida-tc').value) || 1,
        es_parametro: document.getElementById('partida-tipo').value,
        notas: document.getElementById('partida-notas').value
    };

    try {
        if (partidaId) {
            // Actualizar
            await fetchAPI(`/partidas/${partidaId}`, {
                method: 'PUT',
                body: JSON.stringify(datos)
            });
        } else {
            // Crear
            await fetchAPI(`/proyectos/${estado.proyectoActual}/partidas`, {
                method: 'POST',
                body: JSON.stringify(datos)
            });
        }

        cerrarModal();
        await cargarProyecto(estado.proyectoActual);
    } catch (error) {
        console.error('Error guardando partida:', error);
        alert('Error al guardar la partida');
    }
}

async function eliminarPartida(id) {
    if (!confirm('¿Estas seguro de eliminar esta partida?')) {
        return;
    }

    try {
        await fetchAPI(`/partidas/${id}`, { method: 'DELETE' });
        await cargarProyecto(estado.proyectoActual);
    } catch (error) {
        console.error('Error eliminando partida:', error);
        alert('Error al eliminar la partida');
    }
}
