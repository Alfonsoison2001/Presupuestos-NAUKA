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

// Glosario del proyecto actual
let glosario = []; // [{ id, categoria, conceptos: [{id, nombre}] }]

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
        // Resetear filtros del resumen al cambiar de proyecto
        filtrosResumen = { torre: '', piso: '', depto: '' };
        estadoExpansion = { categorias: {}, conceptos: {} };

        // Cargar resumen, categorias, glosario y partidas en paralelo
        const [resumen, categorias, glosarioData] = await Promise.all([
            fetchAPI(`/proyectos/${proyectoId}/resumen`),
            fetchAPI(`/proyectos/${proyectoId}/categorias`),
            fetchAPI(`/proyectos/${proyectoId}/glosario`)
        ]);

        estado.categorias = categorias;
        glosario = glosarioData;
        mostrarResumen(resumen);
        actualizarFiltroCategorias(categorias);
        await cargarPartidas();

        // Si el tab Resumen está activo, cargar el resumen jerárquico
        const tabResumenActivo = document.querySelector('.tab-btn[data-tab="resumen"]').classList.contains('active');
        if (tabResumenActivo) {
            await cargarResumenJerarquico();
        }

        // Si el tab Glosario está activo, renderizar el glosario
        const tabGlosarioActivo = document.querySelector('.tab-btn[data-tab="glosario"]').classList.contains('active');
        if (tabGlosarioActivo) {
            renderizarGlosario();
        }
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
                <td colspan="19">No hay partidas${estado.filtroCategoria || estado.filtroConcepto ? ' con los filtros seleccionados' : ''}</td>
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
                <td>${p.torre || '-'}</td>
                <td>${p.piso || '-'}</td>
                <td>${p.depto || '-'}</td>
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
}

function limpiarVista() {
    document.getElementById('resumen-proyecto').innerHTML = '<p class="empty-state">Selecciona un proyecto</p>';
    document.getElementById('filtro-categoria').innerHTML = '<option value="">Todas</option>';
    document.getElementById('filtro-concepto').innerHTML = '<option value="">Todos</option>';
    document.getElementById('tbody-partidas').innerHTML = `
        <tr class="empty-row">
            <td colspan="19">Selecciona un proyecto para ver sus partidas</td>
        </tr>
    `;
    actualizarContadores(0, 0);
    limpiarResumen();
    limpiarGlosario();
}

function limpiarGlosario() {
    glosario = [];
    document.getElementById('glosario-container').innerHTML = `
        <div class="empty-state">
            <p>Selecciona un proyecto para ver su glosario</p>
        </div>
    `;
}

function limpiarResumen() {
    limpiarResumenJerarquico();
}

// ============== MODAL Y FORMULARIO ==============

function abrirModalNuevaPartida() {
    document.getElementById('modal-titulo').textContent = 'Nueva Partida';
    document.getElementById('partida-id').value = '';

    // Actualizar selects con el glosario
    actualizarSelectCategorias();
    actualizarConceptosModal();

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

        // Actualizar selects con el glosario
        actualizarSelectCategorias();

        document.getElementById('modal-titulo').textContent = 'Editar Partida';
        document.getElementById('partida-id').value = partida.id;
        document.getElementById('partida-categoria').value = partida.categoria || '';

        // Actualizar conceptos basado en la categoria seleccionada
        actualizarConceptosModal();
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

// ============== TABS ==============

function configurarTabs() {
    const tabBtns = document.querySelectorAll('.tab-btn');

    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const tabId = btn.dataset.tab;

            // Desactivar todos los tabs
            tabBtns.forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));

            // Activar el tab seleccionado
            btn.classList.add('active');
            document.getElementById(`tab-${tabId}`).classList.add('active');

            // Cargar resumen jerarquico cuando se selecciona el tab Resumen
            if (tabId === 'resumen' && estado.proyectoActual) {
                cargarResumenJerarquico();
            }

            // Renderizar glosario cuando se selecciona el tab Glosario
            if (tabId === 'glosario' && estado.proyectoActual) {
                renderizarGlosario();
            }
        });
    });
}

// ============== RESUMEN JERARQUICO ==============

// Estado para controlar expansion del arbol
let estadoExpansion = {
    categorias: {},  // { 'Carpinterias': true, ... }
    conceptos: {}    // { 'Carpinterias:Closets': true, ... }
};

// Filtros actuales del resumen
let filtrosResumen = {
    torre: '',
    piso: '',
    depto: ''
};

// Total del proyecto para calcular porcentajes
let totalProyectoGlobal = 0;

function configurarResumen() {
    // Configurar boton de aplicar filtros
    const btnAplicar = document.getElementById('btn-aplicar-filtros-resumen');
    if (btnAplicar) {
        btnAplicar.addEventListener('click', () => {
            filtrosResumen.torre = document.getElementById('filtro-resumen-torre').value;
            filtrosResumen.piso = document.getElementById('filtro-resumen-piso').value;
            filtrosResumen.depto = document.getElementById('filtro-resumen-depto').value;
            // Resetear expansion al cambiar filtros
            estadoExpansion = { categorias: {}, conceptos: {} };
            cargarResumenJerarquico();
        });
    }
}

// Cargar resumen jerarquico inicial (solo categorias)
async function cargarResumenJerarquico() {
    if (!estado.proyectoActual) {
        limpiarResumenJerarquico();
        return;
    }

    try {
        // Construir URL con filtros
        let url = `/proyectos/${estado.proyectoActual}/resumen-jerarquico`;
        const params = new URLSearchParams();
        if (filtrosResumen.torre) params.append('torre', filtrosResumen.torre);
        if (filtrosResumen.piso) params.append('piso', filtrosResumen.piso);
        if (filtrosResumen.depto) params.append('depto', filtrosResumen.depto);
        if (params.toString()) url += '?' + params.toString();

        const data = await fetchAPI(url);
        totalProyectoGlobal = data.total_proyecto || 0;
        renderizarCategorias(data);
        mostrarFiltrosBeachfront();
    } catch (error) {
        console.error('Error cargando resumen jerarquico:', error);
    }
}

// Renderizar categorias (nivel 1)
function renderizarCategorias(data) {
    // Actualizar cards de totales
    document.getElementById('resumen-total-proyecto').textContent = formatearMoneda(data.total_proyecto);
    document.getElementById('resumen-num-categorias').textContent = data.num_categorias || 0;
    document.getElementById('resumen-total-partidas').textContent = data.total_partidas || 0;

    const container = document.getElementById('arbol-resumen');

    if (!data.categorias || data.categorias.length === 0) {
        container.innerHTML = `
            <div class="arbol-empty">
                <p>No hay datos para mostrar</p>
            </div>
        `;
        return;
    }

    container.innerHTML = data.categorias.map(cat => {
        const isExpanded = estadoExpansion.categorias[cat.categoria];
        const porcentaje = totalProyectoGlobal > 0 ? (cat.total_mxn / totalProyectoGlobal * 100) : 0;

        return `
            <div class="arbol-item" data-categoria="${escapeHtml(cat.categoria)}">
                <div class="arbol-nivel-1 ${isExpanded ? 'expanded' : ''}" onclick="toggleCategoria('${escapeJs(cat.categoria)}')">
                    <div class="item-info">
                        <span class="expand-icon ${isExpanded ? 'expanded' : ''}">▶</span>
                        <span class="item-nombre" title="${escapeHtml(cat.categoria)}">${escapeHtml(cat.categoria || 'Sin categoria')}</span>
                        <span class="item-partidas">${cat.num_partidas} partida${cat.num_partidas !== 1 ? 's' : ''}</span>
                    </div>
                    <div style="display: flex; align-items: center; gap: 12px;">
                        <span class="item-porcentaje">${porcentaje.toFixed(1)}%</span>
                        <span class="item-total">${formatearMoneda(cat.total_mxn)}</span>
                    </div>
                </div>
                <div class="conceptos-container ${isExpanded ? 'expanded' : ''}" id="conceptos-${escapeHtml(cat.categoria).replace(/\s+/g, '_')}">
                    <!-- Conceptos cargados dinamicamente -->
                </div>
            </div>
        `;
    }).join('');

    // Si hay categorias expandidas, cargar sus conceptos
    Object.keys(estadoExpansion.categorias).forEach(cat => {
        if (estadoExpansion.categorias[cat]) {
            cargarConceptosCategoria(cat);
        }
    });
}

// Toggle expansion de categoria
async function toggleCategoria(categoria) {
    const isExpanded = estadoExpansion.categorias[categoria];

    if (isExpanded) {
        // Colapsar
        estadoExpansion.categorias[categoria] = false;
        // Tambien colapsar conceptos dentro de esta categoria
        Object.keys(estadoExpansion.conceptos).forEach(key => {
            if (key.startsWith(categoria + ':')) {
                estadoExpansion.conceptos[key] = false;
            }
        });
        actualizarVistaCategoria(categoria);
    } else {
        // Expandir y cargar conceptos
        estadoExpansion.categorias[categoria] = true;
        actualizarVistaCategoria(categoria);
        await cargarConceptosCategoria(categoria);
    }
}

// Actualizar vista de una categoria (sin recargar datos)
function actualizarVistaCategoria(categoria) {
    const item = document.querySelector(`[data-categoria="${escapeHtml(categoria)}"]`);
    if (!item) return;

    const nivel1 = item.querySelector('.arbol-nivel-1');
    const expandIcon = item.querySelector('.expand-icon');
    const conceptosContainer = item.querySelector('.conceptos-container');

    if (estadoExpansion.categorias[categoria]) {
        nivel1.classList.add('expanded');
        expandIcon.classList.add('expanded');
        conceptosContainer.classList.add('expanded');
    } else {
        nivel1.classList.remove('expanded');
        expandIcon.classList.remove('expanded');
        conceptosContainer.classList.remove('expanded');
    }
}

// Cargar conceptos de una categoria
async function cargarConceptosCategoria(categoria) {
    try {
        let url = `/proyectos/${estado.proyectoActual}/resumen-jerarquico/categoria/${encodeURIComponent(categoria)}`;
        const params = new URLSearchParams();
        if (filtrosResumen.torre) params.append('torre', filtrosResumen.torre);
        if (filtrosResumen.piso) params.append('piso', filtrosResumen.piso);
        if (filtrosResumen.depto) params.append('depto', filtrosResumen.depto);
        if (params.toString()) url += '?' + params.toString();

        const data = await fetchAPI(url);
        renderizarConceptos(categoria, data.conceptos);
    } catch (error) {
        console.error('Error cargando conceptos:', error);
    }
}

// Renderizar conceptos (nivel 2)
function renderizarConceptos(categoria, conceptos) {
    const containerId = `conceptos-${escapeHtml(categoria).replace(/\s+/g, '_')}`;
    const container = document.getElementById(containerId);
    if (!container) return;

    if (!conceptos || conceptos.length === 0) {
        container.innerHTML = '<div class="arbol-nivel-2" style="color: var(--text-muted); cursor: default;">Sin conceptos</div>';
        return;
    }

    container.innerHTML = conceptos.map(con => {
        const key = `${categoria}:${con.concepto}`;
        const isExpanded = estadoExpansion.conceptos[key];

        return `
            <div class="concepto-item" data-concepto="${escapeHtml(con.concepto)}">
                <div class="arbol-nivel-2 ${isExpanded ? 'expanded' : ''}" onclick="toggleConcepto('${escapeJs(categoria)}', '${escapeJs(con.concepto)}')">
                    <div class="item-info">
                        <span class="expand-icon ${isExpanded ? 'expanded' : ''}">▶</span>
                        <span class="item-nombre" title="${escapeHtml(con.concepto)}">${escapeHtml(con.concepto || 'Sin concepto')}</span>
                        <span class="item-partidas">${con.num_partidas} partida${con.num_partidas !== 1 ? 's' : ''}</span>
                    </div>
                    <span class="item-total">${formatearMoneda(con.total_mxn)}</span>
                </div>
                <div class="detalles-container ${isExpanded ? 'expanded' : ''}" id="detalles-${escapeHtml(categoria).replace(/\s+/g, '_')}-${escapeHtml(con.concepto).replace(/\s+/g, '_')}">
                    <!-- Detalles cargados dinamicamente -->
                </div>
            </div>
        `;
    }).join('');

    // Si hay conceptos expandidos, cargar sus detalles
    conceptos.forEach(con => {
        const key = `${categoria}:${con.concepto}`;
        if (estadoExpansion.conceptos[key]) {
            cargarDetallesConcepto(categoria, con.concepto);
        }
    });
}

// Toggle expansion de concepto
async function toggleConcepto(categoria, concepto) {
    const key = `${categoria}:${concepto}`;
    const isExpanded = estadoExpansion.conceptos[key];

    if (isExpanded) {
        // Colapsar
        estadoExpansion.conceptos[key] = false;
        actualizarVistaConcepto(categoria, concepto);
    } else {
        // Expandir y cargar detalles
        estadoExpansion.conceptos[key] = true;
        actualizarVistaConcepto(categoria, concepto);
        await cargarDetallesConcepto(categoria, concepto);
    }
}

// Actualizar vista de un concepto
function actualizarVistaConcepto(categoria, concepto) {
    const key = `${categoria}:${concepto}`;
    const containerId = `conceptos-${escapeHtml(categoria).replace(/\s+/g, '_')}`;
    const container = document.getElementById(containerId);
    if (!container) return;

    const conceptoItem = container.querySelector(`[data-concepto="${escapeHtml(concepto)}"]`);
    if (!conceptoItem) return;

    const nivel2 = conceptoItem.querySelector('.arbol-nivel-2');
    const expandIcon = conceptoItem.querySelector('.expand-icon');
    const detallesContainer = conceptoItem.querySelector('.detalles-container');

    if (estadoExpansion.conceptos[key]) {
        nivel2.classList.add('expanded');
        expandIcon.classList.add('expanded');
        detallesContainer.classList.add('expanded');
    } else {
        nivel2.classList.remove('expanded');
        expandIcon.classList.remove('expanded');
        detallesContainer.classList.remove('expanded');
    }
}

// Cargar detalles de un concepto
async function cargarDetallesConcepto(categoria, concepto) {
    try {
        let url = `/proyectos/${estado.proyectoActual}/resumen-jerarquico/categoria/${encodeURIComponent(categoria)}/concepto/${encodeURIComponent(concepto)}`;
        const params = new URLSearchParams();
        if (filtrosResumen.torre) params.append('torre', filtrosResumen.torre);
        if (filtrosResumen.piso) params.append('piso', filtrosResumen.piso);
        if (filtrosResumen.depto) params.append('depto', filtrosResumen.depto);
        if (params.toString()) url += '?' + params.toString();

        const data = await fetchAPI(url);
        renderizarDetalles(categoria, concepto, data.detalles);
    } catch (error) {
        console.error('Error cargando detalles:', error);
    }
}

// Renderizar detalles (nivel 3)
function renderizarDetalles(categoria, concepto, detalles) {
    const containerId = `detalles-${escapeHtml(categoria).replace(/\s+/g, '_')}-${escapeHtml(concepto).replace(/\s+/g, '_')}`;
    const container = document.getElementById(containerId);
    if (!container) return;

    if (!detalles || detalles.length === 0) {
        container.innerHTML = '<div class="arbol-nivel-3" style="color: var(--text-muted);">Sin detalles</div>';
        return;
    }

    container.innerHTML = detalles.map(det => {
        const infoExtra = [];
        if (det.cantidad && det.unidad) {
            infoExtra.push(`${formatearNumero(det.cantidad)} ${det.unidad}`);
        }
        if (det.proveedor) {
            infoExtra.push(det.proveedor);
        }

        return `
            <div class="arbol-nivel-3">
                <div class="item-info">
                    <span class="item-nombre" title="${escapeHtml(det.detalle)}">${escapeHtml(det.detalle || 'Sin detalle')}</span>
                    ${infoExtra.length > 0 ? `
                        <div class="item-detalles-extra">
                            ${infoExtra.map(info => `<span>${escapeHtml(info)}</span>`).join('')}
                        </div>
                    ` : ''}
                </div>
                <span class="item-total">${formatearMoneda(det.total_mxn)}</span>
            </div>
        `;
    }).join('');
}

// Mostrar filtros solo para Beachfront
async function mostrarFiltrosBeachfront() {
    const filtrosDiv = document.getElementById('filtros-beachfront');
    const proyectoSelect = document.getElementById('proyecto-select');
    const nombreProyecto = proyectoSelect.options[proyectoSelect.selectedIndex]?.text || '';

    // Verificar si el proyecto tiene torres, pisos o deptos
    if (estado.proyectoActual) {
        try {
            const [torres, pisos, deptos] = await Promise.all([
                fetchAPI(`/proyectos/${estado.proyectoActual}/torres`),
                fetchAPI(`/proyectos/${estado.proyectoActual}/pisos`),
                fetchAPI(`/proyectos/${estado.proyectoActual}/deptos`)
            ]);

            const tieneFiltros = (torres && torres.length > 0) ||
                               (pisos && pisos.length > 0) ||
                               (deptos && deptos.length > 0);

            if (tieneFiltros) {
                filtrosDiv.classList.remove('hidden');
                cargarFiltrosResumen(torres, pisos, deptos);
            } else {
                filtrosDiv.classList.add('hidden');
            }
        } catch (error) {
            console.error('Error cargando filtros:', error);
            filtrosDiv.classList.add('hidden');
        }
    } else {
        filtrosDiv.classList.add('hidden');
    }
}

// Cargar opciones de filtros
function cargarFiltrosResumen(torres, pisos, deptos) {
    const selectTorre = document.getElementById('filtro-resumen-torre');
    const selectPiso = document.getElementById('filtro-resumen-piso');
    const selectDepto = document.getElementById('filtro-resumen-depto');

    // Torres
    selectTorre.innerHTML = '<option value="">Todas las Torres</option>';
    if (torres) {
        torres.forEach(t => {
            const option = document.createElement('option');
            option.value = t;
            option.textContent = t;
            if (filtrosResumen.torre === t) option.selected = true;
            selectTorre.appendChild(option);
        });
    }

    // Pisos
    selectPiso.innerHTML = '<option value="">Todos los Pisos</option>';
    if (pisos) {
        pisos.forEach(p => {
            const option = document.createElement('option');
            option.value = p;
            option.textContent = p;
            if (filtrosResumen.piso === p) option.selected = true;
            selectPiso.appendChild(option);
        });
    }

    // Deptos
    selectDepto.innerHTML = '<option value="">Todos los Deptos</option>';
    if (deptos) {
        deptos.forEach(d => {
            const option = document.createElement('option');
            option.value = d;
            option.textContent = d;
            if (filtrosResumen.depto === d) option.selected = true;
            selectDepto.appendChild(option);
        });
    }
}

// Limpiar resumen jerarquico
function limpiarResumenJerarquico() {
    document.getElementById('resumen-total-proyecto').textContent = '$0.00';
    document.getElementById('resumen-num-categorias').textContent = '0';
    document.getElementById('resumen-total-partidas').textContent = '0';
    document.getElementById('arbol-resumen').innerHTML = `
        <div class="arbol-empty">
            <p>Selecciona un proyecto para ver el resumen jerarquico</p>
        </div>
    `;
    document.getElementById('filtros-beachfront').classList.add('hidden');
    estadoExpansion = { categorias: {}, conceptos: {} };
    filtrosResumen = { torre: '', piso: '', depto: '' };
}

// Funciones de escape para seguridad
function escapeHtml(str) {
    if (!str) return '';
    return str.toString()
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function escapeJs(str) {
    if (!str) return '';
    return str.toString()
        .replace(/\\/g, '\\\\')
        .replace(/'/g, "\\'")
        .replace(/"/g, '\\"')
        .replace(/\n/g, '\\n')
        .replace(/\r/g, '\\r');
}

// Inicializar tabs y resumen al cargar
document.addEventListener('DOMContentLoaded', () => {
    configurarTabs();
    configurarResumen();
});

// ============== GLOSARIO ==============

async function cargarGlosario() {
    if (!estado.proyectoActual) return;
    try {
        glosario = await fetchAPI(`/proyectos/${estado.proyectoActual}/glosario`);
        renderizarGlosario();
    } catch (error) {
        console.error('Error cargando glosario:', error);
    }
}

function renderizarGlosario() {
    const container = document.getElementById('glosario-container');

    if (!estado.proyectoActual) {
        container.innerHTML = `
            <div class="empty-state">
                <p>Selecciona un proyecto para ver su glosario</p>
            </div>
        `;
        return;
    }

    if (glosario.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <p>No hay categorias en el glosario</p>
                <p>Importa desde las partidas existentes o agrega manualmente</p>
            </div>
        `;
        return;
    }

    container.innerHTML = glosario.map(cat => `
        <div class="glosario-categoria" data-categoria-id="${cat.id}">
            <div class="glosario-categoria-header">
                <div class="glosario-categoria-nombre">
                    <span class="expand-icon">▼</span>
                    <span>${escapeHtml(cat.categoria)}</span>
                    <span class="badge">${cat.conceptos.length} conceptos</span>
                </div>
                <div class="glosario-categoria-actions">
                    <button class="btn-icon" onclick="mostrarModalAgregarConcepto(${cat.id})" title="Agregar concepto">+</button>
                    <button class="btn-icon danger" onclick="eliminarCategoria(${cat.id})" title="Eliminar categoria">×</button>
                </div>
            </div>
            <div class="glosario-conceptos">
                ${cat.conceptos.length > 0 ? cat.conceptos.map(con => `
                    <div class="glosario-concepto">
                        <span>${escapeHtml(con.nombre)}</span>
                        <button class="btn-icon danger" onclick="eliminarConcepto(${con.id})" title="Eliminar concepto">×</button>
                    </div>
                `).join('') : '<div class="glosario-concepto-empty">Sin conceptos</div>'}
            </div>
        </div>
    `).join('');
}

async function importarGlosario() {
    if (!estado.proyectoActual) {
        alert('Selecciona un proyecto primero');
        return;
    }

    if (!confirm('¿Importar glosario desde el archivo Excel del proyecto?\nEsto reemplazara el glosario existente.')) {
        return;
    }

    try {
        const resultado = await fetchAPI(`/proyectos/${estado.proyectoActual}/glosario/importar-excel`, {
            method: 'POST'
        });

        if (resultado.error) {
            alert(`Error: ${resultado.error}`);
            return;
        }

        alert(`Importacion completada:\n${resultado.categorias} categorias\n${resultado.conceptos} conceptos`);
        await cargarGlosario();
    } catch (error) {
        console.error('Error importando glosario:', error);
        alert('Error al importar el glosario. Verifica que el archivo Excel existe.');
    }
}

// Modal para agregar categoria
function mostrarModalAgregarCategoria() {
    if (!estado.proyectoActual) {
        alert('Selecciona un proyecto primero');
        return;
    }
    document.getElementById('nueva-categoria').value = '';
    document.getElementById('modal-categoria').classList.add('active');
    document.getElementById('nueva-categoria').focus();
}

function cerrarModalCategoria() {
    document.getElementById('modal-categoria').classList.remove('active');
}

async function guardarCategoria(event) {
    event.preventDefault();
    const nombre = document.getElementById('nueva-categoria').value.trim();

    if (!nombre) {
        alert('El nombre es requerido');
        return;
    }

    try {
        await fetchAPI(`/proyectos/${estado.proyectoActual}/glosario/categorias`, {
            method: 'POST',
            body: JSON.stringify({ nombre })
        });
        cerrarModalCategoria();
        await cargarGlosario();
    } catch (error) {
        console.error('Error guardando categoria:', error);
        alert('Error al guardar la categoria. Puede que ya exista.');
    }
}

// Modal para agregar concepto
function mostrarModalAgregarConcepto(categoriaId) {
    document.getElementById('concepto-categoria-id').value = categoriaId;
    document.getElementById('nuevo-concepto').value = '';
    document.getElementById('modal-concepto').classList.add('active');
    document.getElementById('nuevo-concepto').focus();
}

function cerrarModalConcepto() {
    document.getElementById('modal-concepto').classList.remove('active');
}

async function guardarConcepto(event) {
    event.preventDefault();
    const categoriaId = document.getElementById('concepto-categoria-id').value;
    const nombre = document.getElementById('nuevo-concepto').value.trim();

    if (!nombre) {
        alert('El nombre es requerido');
        return;
    }

    try {
        await fetchAPI(`/glosario/categorias/${categoriaId}/conceptos`, {
            method: 'POST',
            body: JSON.stringify({ nombre })
        });
        cerrarModalConcepto();
        await cargarGlosario();
    } catch (error) {
        console.error('Error guardando concepto:', error);
        alert('Error al guardar el concepto. Puede que ya exista.');
    }
}

async function eliminarCategoria(categoriaId) {
    if (!confirm('¿Eliminar esta categoria y todos sus conceptos?')) {
        return;
    }

    try {
        await fetchAPI(`/glosario/categorias/${categoriaId}`, {
            method: 'DELETE'
        });
        await cargarGlosario();
    } catch (error) {
        console.error('Error eliminando categoria:', error);
        alert('Error al eliminar la categoria');
    }
}

async function eliminarConcepto(conceptoId) {
    if (!confirm('¿Eliminar este concepto?')) {
        return;
    }

    try {
        await fetchAPI(`/glosario/conceptos/${conceptoId}`, {
            method: 'DELETE'
        });
        await cargarGlosario();
    } catch (error) {
        console.error('Error eliminando concepto:', error);
        alert('Error al eliminar el concepto');
    }
}

// Funciones para el modal de partidas con selects
function actualizarSelectCategorias() {
    const select = document.getElementById('partida-categoria');
    select.innerHTML = '<option value="">Seleccionar categoria...</option>' +
        glosario.map(cat => `<option value="${escapeHtml(cat.categoria)}">${escapeHtml(cat.categoria)}</option>`).join('');
}

function actualizarConceptosModal() {
    const categoriaSeleccionada = document.getElementById('partida-categoria').value;
    const selectConcepto = document.getElementById('partida-concepto');

    const categoria = glosario.find(c => c.categoria === categoriaSeleccionada);
    if (categoria && categoria.conceptos.length > 0) {
        selectConcepto.innerHTML = '<option value="">Seleccionar concepto...</option>' +
            categoria.conceptos.map(con => `<option value="${escapeHtml(con.nombre)}">${escapeHtml(con.nombre)}</option>`).join('');
    } else {
        selectConcepto.innerHTML = '<option value="">Seleccionar concepto...</option>';
    }
}

// ============== GLOSARIO GLOBAL DE PROVEEDORES ==============

let proveedoresGlobal = []; // Cache de proveedores globales

async function cargarProveedoresGlobal() {
    try {
        proveedoresGlobal = await fetchAPI('/proveedores-global');
        renderizarProveedoresGlobal();
    } catch (error) {
        console.error('Error cargando proveedores globales:', error);
        document.getElementById('proveedores-container').innerHTML = `
            <div class="empty-state">
                <p>Error al cargar proveedores</p>
            </div>
        `;
    }
}

function renderizarProveedoresGlobal() {
    const container = document.getElementById('proveedores-container');

    if (!proveedoresGlobal || proveedoresGlobal.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <p>No hay proveedores registrados en ningun proyecto</p>
            </div>
        `;
        document.getElementById('total-categorias-prov').textContent = '0';
        document.getElementById('total-proveedores').textContent = '0';
        return;
    }

    // Calcular totales
    const totalCategorias = proveedoresGlobal.length;
    const totalProveedores = proveedoresGlobal.reduce((sum, cat) => sum + cat.num_proveedores, 0);

    document.getElementById('total-categorias-prov').textContent = totalCategorias;
    document.getElementById('total-proveedores').textContent = totalProveedores;

    // Renderizar lista de categorías con proveedores
    container.innerHTML = proveedoresGlobal.map(cat => `
        <div class="proveedor-categoria">
            <div class="proveedor-categoria-header">
                <div class="proveedor-categoria-nombre">
                    <span class="categoria-icon">📁</span>
                    <span>${escapeHtml(cat.categoria)}</span>
                    <span class="badge">${cat.num_proveedores} proveedor${cat.num_proveedores !== 1 ? 'es' : ''}</span>
                </div>
            </div>
            <div class="proveedor-lista">
                ${cat.proveedores.map(prov => `
                    <div class="proveedor-item" onclick="verDetalleProveedor('${escapeJs(prov)}')">
                        <span class="proveedor-nombre">${escapeHtml(prov)}</span>
                        <span class="proveedor-ver">Ver detalles →</span>
                    </div>
                `).join('')}
            </div>
        </div>
    `).join('');
}

async function verDetalleProveedor(proveedor) {
    const modal = document.getElementById('modal-proveedor');
    const titulo = document.getElementById('modal-proveedor-nombre');
    const contenido = document.getElementById('modal-proveedor-content');

    titulo.textContent = proveedor;
    contenido.innerHTML = '<p class="loading-text">Cargando estadisticas...</p>';
    modal.classList.add('active');

    try {
        const stats = await fetchAPI(`/proveedores-global/${encodeURIComponent(proveedor)}/estadisticas`);

        contenido.innerHTML = `
            <div class="proveedor-stats-detalle">
                <div class="stats-row">
                    <div class="stat-box">
                        <span class="stat-numero">${stats.num_proyectos}</span>
                        <span class="stat-texto">Proyectos</span>
                    </div>
                    <div class="stat-box">
                        <span class="stat-numero">${stats.total_partidas}</span>
                        <span class="stat-texto">Partidas</span>
                    </div>
                    <div class="stat-box stat-box-primary">
                        <span class="stat-numero">${formatearMoneda(stats.total_general)}</span>
                        <span class="stat-texto">Total Facturado</span>
                    </div>
                </div>

                <h4 class="detalle-subtitulo">Desglose por Proyecto</h4>
                <div class="proyectos-lista">
                    ${stats.proyectos.length > 0 ? stats.proyectos.map(p => `
                        <div class="proyecto-row">
                            <span class="proyecto-nombre">${escapeHtml(p.proyecto)}</span>
                            <span class="proyecto-partidas">${p.num_partidas} partidas</span>
                            <span class="proyecto-total">${formatearMoneda(p.total_mxn)}</span>
                        </div>
                    `).join('') : '<p class="no-data">Sin datos</p>'}
                </div>
            </div>
        `;
    } catch (error) {
        console.error('Error cargando estadisticas del proveedor:', error);
        contenido.innerHTML = '<p class="error-text">Error al cargar estadisticas</p>';
    }
}

function cerrarModalProveedor() {
    document.getElementById('modal-proveedor').classList.remove('active');
}

// Modificar configurarTabs para incluir el tab de Proveedores
const originalConfigurarTabs = configurarTabs;
configurarTabs = function() {
    const tabBtns = document.querySelectorAll('.tab-btn');

    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const tabId = btn.dataset.tab;

            // Desactivar todos los tabs
            tabBtns.forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));

            // Activar el tab seleccionado
            btn.classList.add('active');
            document.getElementById(`tab-${tabId}`).classList.add('active');

            // Cargar datos según el tab
            if (tabId === 'resumen' && estado.proyectoActual) {
                cargarResumenJerarquico();
            }

            if (tabId === 'glosario' && estado.proyectoActual) {
                renderizarGlosario();
            }

            // Cargar proveedores globales cuando se selecciona el tab
            if (tabId === 'proveedores') {
                cargarProveedoresGlobal();
            }

            // Cargar cotizaciones cuando se selecciona el tab
            if (tabId === 'cotizaciones') {
                cargarCotizaciones();
                cargarFiltrosCotizaciones();
            }
        });
    });
};

// ============== COTIZACIONES ==============

let cotizaciones = [];
let cotizacionActual = null;
let proveedoresCotizaciones = [];

async function cargarCotizaciones() {
    try {
        const proyectoId = document.getElementById('filtro-cot-proyecto').value;
        const proveedor = document.getElementById('filtro-cot-proveedor').value;

        let url = '/cotizaciones';
        const params = new URLSearchParams();
        if (proyectoId) params.append('proyecto_id', proyectoId);
        if (proveedor) params.append('proveedor', proveedor);
        if (params.toString()) url += '?' + params.toString();

        cotizaciones = await fetchAPI(url);
        renderizarCotizaciones();

        // Actualizar estadísticas
        const proveedoresUnicos = [...new Set(cotizaciones.map(c => c.proveedor))];
        const totalItems = cotizaciones.reduce((sum, c) => sum + (c.num_items || 0), 0);

        document.getElementById('total-cotizaciones').textContent = cotizaciones.length;
        document.getElementById('total-items-cot').textContent = totalItems;
        document.getElementById('total-proveedores-cot').textContent = proveedoresUnicos.length;
    } catch (error) {
        console.error('Error cargando cotizaciones:', error);
    }
}

async function cargarFiltrosCotizaciones() {
    try {
        // Cargar proyectos para el filtro
        const proyectos = await fetchAPI('/proyectos');
        const selectProyecto = document.getElementById('filtro-cot-proyecto');
        selectProyecto.innerHTML = '<option value="">Todos los proyectos</option>';
        proyectos.forEach(p => {
            const option = document.createElement('option');
            option.value = p.id;
            option.textContent = p.nombre;
            selectProyecto.appendChild(option);
        });

        // Cargar proveedores que tienen cotizaciones
        proveedoresCotizaciones = await fetchAPI('/cotizaciones/proveedores');
        const selectProveedor = document.getElementById('filtro-cot-proveedor');
        selectProveedor.innerHTML = '<option value="">Todos los proveedores</option>';
        proveedoresCotizaciones.forEach(p => {
            const option = document.createElement('option');
            option.value = p;
            option.textContent = p;
            selectProveedor.appendChild(option);
        });
    } catch (error) {
        console.error('Error cargando filtros de cotizaciones:', error);
    }
}

function renderizarCotizaciones() {
    const container = document.getElementById('cotizaciones-lista');

    if (!cotizaciones || cotizaciones.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <p>No hay cotizaciones cargadas</p>
                <p class="empty-state-hint">Sube un PDF de cotizacion para comenzar</p>
            </div>
        `;
        return;
    }

    // Agrupar por proveedor
    const porProveedor = {};
    cotizaciones.forEach(c => {
        if (!porProveedor[c.proveedor]) {
            porProveedor[c.proveedor] = [];
        }
        porProveedor[c.proveedor].push(c);
    });

    container.innerHTML = Object.entries(porProveedor).map(([proveedor, cots]) => `
        <div class="cotizacion-grupo">
            <div class="cotizacion-grupo-header">
                <span class="proveedor-nombre">${escapeHtml(proveedor)}</span>
                <span class="badge">${cots.length} cotizacion${cots.length !== 1 ? 'es' : ''}</span>
            </div>
            <div class="cotizacion-grupo-items">
                ${cots.map(c => `
                    <div class="cotizacion-card" onclick="verItemsCotizacion(${c.id})">
                        <div class="cotizacion-card-header">
                            <span class="cotizacion-proyecto">${escapeHtml(c.proyecto_nombre)}</span>
                            <span class="cotizacion-fecha">${c.fecha_cotizacion || c.fecha_carga?.split('T')[0] || '-'}</span>
                        </div>
                        <div class="cotizacion-card-body">
                            <div class="cotizacion-categorias">
                                ${(c.categorias || []).map(cat => `<span class="tag">${escapeHtml(cat)}</span>`).join('')}
                            </div>
                            <div class="cotizacion-stats">
                                <span>${c.num_items || 0} items</span>
                                <span class="cotizacion-total">${formatearMoneda(c.total, c.moneda)}</span>
                            </div>
                        </div>
                        <div class="cotizacion-card-footer">
                            <span class="cotizacion-archivo">${escapeHtml(c.archivo_nombre || 'Sin archivo')}</span>
                            <button class="btn-icon danger" onclick="event.stopPropagation(); eliminarCotizacion(${c.id})" title="Eliminar">×</button>
                        </div>
                    </div>
                `).join('')}
            </div>
        </div>
    `).join('');
}

// Modal para subir cotización
async function mostrarModalSubirCotizacion() {
    // Cargar proyectos
    const proyectos = await fetchAPI('/proyectos');
    const selectProyecto = document.getElementById('cot-proyecto');
    selectProyecto.innerHTML = '<option value="">Seleccionar proyecto...</option>';
    proyectos.forEach(p => {
        const option = document.createElement('option');
        option.value = p.id;
        option.textContent = p.nombre;
        selectProyecto.appendChild(option);
    });

    // Cargar categorías del glosario (todas las categorías de todos los proyectos)
    await cargarCategoriasParaCotizacion();

    // Cargar lista de proveedores para autocompletado
    const datalist = document.getElementById('lista-proveedores-cot');
    datalist.innerHTML = proveedoresCotizaciones.map(p =>
        `<option value="${escapeHtml(p)}">`
    ).join('');

    // Limpiar formulario
    document.getElementById('cot-archivo').value = '';
    document.getElementById('cot-proveedor').value = '';
    document.getElementById('cot-fecha').value = '';
    document.getElementById('cot-moneda').value = 'MXN';
    document.getElementById('cot-notas').value = '';
    document.getElementById('file-upload-label').textContent = 'Arrastra un PDF o haz clic para seleccionar';

    document.getElementById('modal-subir-cotizacion').classList.add('active');
}

async function cargarCategoriasParaCotizacion() {
    const container = document.getElementById('cot-categorias-container');

    // Obtener categorías únicas de todos los proyectos (de las partidas)
    let todasCategorias = new Set();

    try {
        const proyectos = await fetchAPI('/proyectos');
        for (const p of proyectos) {
            const categorias = await fetchAPI(`/proyectos/${p.id}/categorias`);
            categorias.forEach(c => todasCategorias.add(c));
        }
    } catch (error) {
        console.error('Error cargando categorías:', error);
    }

    const categoriasArray = Array.from(todasCategorias).sort();

    if (categoriasArray.length === 0) {
        container.innerHTML = '<p class="text-muted">No hay categorías disponibles</p>';
        return;
    }

    container.innerHTML = categoriasArray.map(cat => `
        <label class="categoria-checkbox">
            <input type="checkbox" name="categorias" value="${escapeHtml(cat)}">
            <span>${escapeHtml(cat)}</span>
        </label>
    `).join('');
}

function cerrarModalSubirCotizacion() {
    document.getElementById('modal-subir-cotizacion').classList.remove('active');
}

function mostrarNombreArchivo(input) {
    const label = document.getElementById('file-upload-label');
    if (input.files && input.files[0]) {
        label.textContent = input.files[0].name;
    } else {
        label.textContent = 'Arrastra un PDF o haz clic para seleccionar';
    }
}

async function procesarCotizacion(event) {
    event.preventDefault();

    const archivo = document.getElementById('cot-archivo').files[0];
    const proyectoId = document.getElementById('cot-proyecto').value;
    const proveedor = document.getElementById('cot-proveedor').value.trim();
    const fecha = document.getElementById('cot-fecha').value;
    const moneda = document.getElementById('cot-moneda').value;
    const notas = document.getElementById('cot-notas').value;

    // Obtener categorías seleccionadas
    const categoriasCheckboxes = document.querySelectorAll('input[name="categorias"]:checked');
    const categorias = Array.from(categoriasCheckboxes).map(cb => cb.value);

    if (!archivo) {
        alert('Selecciona un archivo PDF');
        return;
    }
    if (!proyectoId) {
        alert('Selecciona un proyecto');
        return;
    }
    if (!proveedor) {
        alert('Ingresa el nombre del proveedor');
        return;
    }

    // Mostrar estado de carga
    const btnText = document.getElementById('btn-procesar-text');
    const btnLoading = document.getElementById('btn-procesar-loading');
    const btn = document.getElementById('btn-procesar-cot');

    btnText.classList.add('hidden');
    btnLoading.classList.remove('hidden');
    btn.disabled = true;

    try {
        const formData = new FormData();
        formData.append('archivo', archivo);
        formData.append('proyecto_id', proyectoId);
        formData.append('proveedor', proveedor);
        formData.append('categorias', JSON.stringify(categorias));
        formData.append('fecha_cotizacion', fecha);
        formData.append('moneda', moneda);
        formData.append('notas', notas);

        const response = await fetch('/api/cotizaciones/upload', {
            method: 'POST',
            body: formData
        });

        const resultado = await response.json();

        if (!response.ok) {
            throw new Error(resultado.error || 'Error procesando PDF');
        }

        cerrarModalSubirCotizacion();

        // Mostrar items extraídos
        if (resultado.items && resultado.items.length > 0) {
            alert(`Se extrajeron ${resultado.items.length} items de ${resultado.num_paginas} página(s)`);
            await verItemsCotizacion(resultado.cotizacion.id);
        } else {
            alert('No se encontraron items en el PDF. Verifica que el formato sea correcto.');
        }

        // Recargar lista
        await cargarCotizaciones();
        await cargarFiltrosCotizaciones();

    } catch (error) {
        console.error('Error procesando cotización:', error);
        alert('Error: ' + error.message);
    } finally {
        btnText.classList.remove('hidden');
        btnLoading.classList.add('hidden');
        btn.disabled = false;
    }
}

async function eliminarCotizacion(id) {
    if (!confirm('¿Eliminar esta cotización y todos sus items?')) {
        return;
    }

    try {
        await fetchAPI(`/cotizaciones/${id}`, { method: 'DELETE' });
        await cargarCotizaciones();
    } catch (error) {
        console.error('Error eliminando cotización:', error);
        alert('Error al eliminar la cotización');
    }
}

// Modal para ver items de cotización
async function verItemsCotizacion(cotizacionId) {
    try {
        const [cotizacion, items] = await Promise.all([
            fetchAPI(`/cotizaciones/${cotizacionId}`),
            fetchAPI(`/cotizaciones/${cotizacionId}/items`)
        ]);

        cotizacionActual = cotizacion;

        document.getElementById('modal-items-titulo').textContent =
            `Items: ${cotizacion.proveedor} - ${cotizacion.proyecto_nombre}`;

        document.getElementById('items-cot-info').innerHTML = `
            <div class="items-info-grid">
                <div><strong>Archivo:</strong> ${escapeHtml(cotizacion.archivo_nombre || '-')}</div>
                <div><strong>Fecha:</strong> ${cotizacion.fecha_cotizacion || '-'}</div>
                <div><strong>Moneda:</strong> ${cotizacion.moneda}</div>
                <div><strong>Total:</strong> ${formatearMoneda(cotizacion.total, cotizacion.moneda)}</div>
            </div>
            <div class="items-categorias">
                <strong>Categorías:</strong>
                ${(cotizacion.categorias || []).map(c => `<span class="tag">${escapeHtml(c)}</span>`).join('') || '-'}
            </div>
        `;

        renderizarItemsCotizacion(items);
        document.getElementById('modal-items-cotizacion').classList.add('active');

    } catch (error) {
        console.error('Error cargando items:', error);
        alert('Error al cargar los items');
    }
}

function renderizarItemsCotizacion(items) {
    const tbody = document.getElementById('tbody-items-cot');

    if (!items || items.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="text-center">No hay items</td></tr>';
        return;
    }

    tbody.innerHTML = items.map(item => `
        <tr data-item-id="${item.id}">
            <td>${escapeHtml(item.codigo || '-')}</td>
            <td class="descripcion-cell" title="${escapeHtml(item.descripcion)}">${escapeHtml(item.descripcion)}</td>
            <td>${escapeHtml(item.unidad || '-')}</td>
            <td class="num">${formatearNumero(item.cantidad)}</td>
            <td class="num">${formatearMoneda(item.precio_unitario, item.moneda)}</td>
            <td class="num">${formatearMoneda(item.importe, item.moneda)}</td>
            <td>
                <button class="btn-icon" onclick="editarItemCotizacion(${item.id})" title="Editar">✎</button>
                <button class="btn-icon danger" onclick="eliminarItemCotizacion(${item.id})" title="Eliminar">×</button>
            </td>
        </tr>
    `).join('');
}

function cerrarModalItemsCotizacion() {
    document.getElementById('modal-items-cotizacion').classList.remove('active');
    cotizacionActual = null;
}

async function editarItemCotizacion(itemId) {
    const row = document.querySelector(`tr[data-item-id="${itemId}"]`);
    if (!row) return;

    // Obtener datos actuales
    const items = await fetchAPI(`/cotizaciones/${cotizacionActual.id}/items`);
    const item = items.find(i => i.id === itemId);
    if (!item) return;

    // Convertir fila a editable
    row.innerHTML = `
        <td><input type="text" value="${escapeHtml(item.codigo || '')}" class="edit-input" id="edit-codigo-${itemId}"></td>
        <td><input type="text" value="${escapeHtml(item.descripcion)}" class="edit-input" id="edit-desc-${itemId}"></td>
        <td><input type="text" value="${escapeHtml(item.unidad || '')}" class="edit-input edit-small" id="edit-unidad-${itemId}"></td>
        <td><input type="number" step="0.01" value="${item.cantidad || 0}" class="edit-input edit-small" id="edit-cant-${itemId}"></td>
        <td><input type="number" step="0.01" value="${item.precio_unitario || 0}" class="edit-input edit-small" id="edit-pu-${itemId}"></td>
        <td><input type="number" step="0.01" value="${item.importe || 0}" class="edit-input edit-small" id="edit-imp-${itemId}"></td>
        <td>
            <button class="btn-icon success" onclick="guardarItemCotizacion(${itemId})" title="Guardar">✓</button>
            <button class="btn-icon" onclick="verItemsCotizacion(${cotizacionActual.id})" title="Cancelar">×</button>
        </td>
    `;
}

async function guardarItemCotizacion(itemId) {
    const datos = {
        codigo: document.getElementById(`edit-codigo-${itemId}`).value,
        descripcion: document.getElementById(`edit-desc-${itemId}`).value,
        unidad: document.getElementById(`edit-unidad-${itemId}`).value,
        cantidad: parseFloat(document.getElementById(`edit-cant-${itemId}`).value) || 0,
        precio_unitario: parseFloat(document.getElementById(`edit-pu-${itemId}`).value) || 0,
        importe: parseFloat(document.getElementById(`edit-imp-${itemId}`).value) || 0,
        moneda: cotizacionActual.moneda
    };

    try {
        await fetchAPI(`/cotizaciones/items/${itemId}`, {
            method: 'PUT',
            body: JSON.stringify(datos)
        });
        await verItemsCotizacion(cotizacionActual.id);
    } catch (error) {
        console.error('Error guardando item:', error);
        alert('Error al guardar');
    }
}

async function eliminarItemCotizacion(itemId) {
    if (!confirm('¿Eliminar este item?')) return;

    try {
        await fetchAPI(`/cotizaciones/items/${itemId}`, { method: 'DELETE' });
        await verItemsCotizacion(cotizacionActual.id);
    } catch (error) {
        console.error('Error eliminando item:', error);
        alert('Error al eliminar');
    }
}

// ============== COMPARACION DE UNITARIOS ==============

async function mostrarComparacion() {
    // Cargar proveedores que tienen cotizaciones
    const proveedores = await fetchAPI('/cotizaciones/proveedores');

    const selectProveedor = document.getElementById('comp-proveedor');
    selectProveedor.innerHTML = '<option value="">Seleccionar proveedor...</option>';
    proveedores.forEach(p => {
        const option = document.createElement('option');
        option.value = p;
        option.textContent = p;
        selectProveedor.appendChild(option);
    });

    // Cargar categorías
    let todasCategorias = new Set();
    try {
        const proyectos = await fetchAPI('/proyectos');
        for (const p of proyectos) {
            const categorias = await fetchAPI(`/proyectos/${p.id}/categorias`);
            categorias.forEach(c => todasCategorias.add(c));
        }
    } catch (error) {
        console.error('Error cargando categorías:', error);
    }

    const selectCategoria = document.getElementById('comp-categoria');
    selectCategoria.innerHTML = '<option value="">Todas las categorías</option>';
    Array.from(todasCategorias).sort().forEach(c => {
        const option = document.createElement('option');
        option.value = c;
        option.textContent = c;
        selectCategoria.appendChild(option);
    });

    document.getElementById('comparacion-resultado').innerHTML = `
        <div class="empty-state">
            <p>Selecciona un proveedor para comparar precios</p>
        </div>
    `;

    document.getElementById('modal-comparacion').classList.add('active');
}

function cerrarModalComparacion() {
    document.getElementById('modal-comparacion').classList.remove('active');
}

async function ejecutarComparacion() {
    const proveedor = document.getElementById('comp-proveedor').value;
    const categoria = document.getElementById('comp-categoria').value;

    if (!proveedor) {
        document.getElementById('comparacion-resultado').innerHTML = `
            <div class="empty-state">
                <p>Selecciona un proveedor para comparar precios</p>
            </div>
        `;
        return;
    }

    try {
        let url = `/comparar-unitarios?proveedor=${encodeURIComponent(proveedor)}`;
        if (categoria) {
            url += `&categoria=${encodeURIComponent(categoria)}`;
        }

        const resultado = await fetchAPI(url);
        renderizarComparacion(resultado);

    } catch (error) {
        console.error('Error en comparación:', error);
        document.getElementById('comparacion-resultado').innerHTML = `
            <div class="empty-state error">
                <p>Error al cargar la comparación</p>
            </div>
        `;
    }
}

function renderizarComparacion(resultado) {
    const container = document.getElementById('comparacion-resultado');

    if (!resultado.items || resultado.items.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <p>No hay items para comparar de este proveedor</p>
                <p class="empty-state-hint">Sube cotizaciones de diferentes proyectos para poder comparar</p>
            </div>
        `;
        return;
    }

    const proyectos = resultado.proyectos || [];

    let html = `
        <div class="comparacion-info">
            <p><strong>Proveedor:</strong> ${escapeHtml(resultado.proveedor)}</p>
            <p><strong>Proyectos:</strong> ${proyectos.join(', ')}</p>
            <p><strong>Items:</strong> ${resultado.items.length}</p>
        </div>
        <div class="tabla-container">
            <table class="tabla-comparacion">
                <thead>
                    <tr>
                        <th>Descripción</th>
                        <th>Unidad</th>
                        ${proyectos.map(p => `<th class="num">${escapeHtml(p)}</th>`).join('')}
                        <th class="num">Dif %</th>
                    </tr>
                </thead>
                <tbody>
    `;

    resultado.items.forEach(item => {
        const tieneDiferencia = item.diferencia_pct && item.diferencia_pct > 0;
        const claseFila = tieneDiferencia && item.diferencia_pct > 10 ? 'fila-alerta' : '';

        html += `<tr class="${claseFila}">`;
        html += `<td title="${escapeHtml(item.descripcion)}">${escapeHtml(truncar(item.descripcion, 40))}</td>`;
        html += `<td>${escapeHtml(item.unidad || '-')}</td>`;

        proyectos.forEach(p => {
            const precio = item.precios[p];
            let claseP = 'num';

            if (tieneDiferencia && precio !== undefined && precio !== null) {
                if (precio === item.max_precio) {
                    claseP += ' precio-alto';
                } else if (precio === item.min_precio) {
                    claseP += ' precio-bajo';
                }
            }

            html += `<td class="${claseP}">${precio !== undefined && precio !== null ? formatearMoneda(precio) : '-'}</td>`;
        });

        const difClass = tieneDiferencia ? (item.diferencia_pct > 10 ? 'dif-alta' : 'dif-media') : '';
        html += `<td class="num ${difClass}">${item.diferencia_pct !== undefined ? '+' + item.diferencia_pct + '%' : '-'}</td>`;
        html += '</tr>';
    });

    html += `
                </tbody>
            </table>
        </div>
        <div class="comparacion-leyenda">
            <span class="leyenda-item"><span class="color-box precio-alto"></span> Precio más alto</span>
            <span class="leyenda-item"><span class="color-box precio-bajo"></span> Precio más bajo</span>
        </div>
    `;

    container.innerHTML = html;
}
