/* =========================================================
   1. CONSTANTES DE LA APLICACIÓN
========================================================= */
const CONFIG = {
    API_URL: '/api/gastos',
    CONFIG_URL: '/api/config',
    PALABRAS_EXCLUIDAS_PRESUPUESTO: ['hacienda', '#extra']
};

const CATEGORIAS = {
    AQUA: "Tarjeta Aqua",
    EXPLORA: "Tarjeta Explora",
    ABONO_AQUA: "Abono Aqua",
    ABONO_EXPLORA: "Abono Explora",
    SUELDO: "Sueldo",
    OTROS_INGRESOS: "Otros Ingresos"
};

const INGRESOS_LISTA = [CATEGORIAS.SUELDO, CATEGORIAS.OTROS_INGRESOS];

/* =========================================================
   2. GESTOR DE ESTADO GLOBAL (Centralizado)
========================================================= */
const state = {
    ui: {
        currentTabIndex: 0,
        isPrivate: false,
        pin: "",
        editMode: false,
        editId: null,
        editWasRecurrent: false,
        editRecId: null,
        filtroCategoria: null,
        desgloseAbierto: false,
        touchstartX: 0,
        touchstartY: 0
    },
    data: {
        appData: [],
        pagosProcesadosMes: null,
        saldoTimer: null,
        gastosChart: null,
        cardCharts: {}
    }
};

/* =========================================================
   3. FUNCIONES UTILITARIAS Y HELPERS
========================================================= */
async function apiFetch(url, options = {}) {
    const headers = { ...(options.headers || {}) };
    return fetch(url, { ...options, headers, credentials: 'include' });
}

async function iniciarSesion(pinIntroducido) {
    const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ pin: pinIntroducido })
    });

    let data = {};
    try { data = await res.json(); } catch { data = {}; }

    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    return true;
}

function parsearFecha(fechaStr) {
    if (!fechaStr) return new Date(0);
    const valor = String(fechaStr).trim();
    if (valor.includes('/')) {
        const [d, m, a] = valor.split('/');
        return new Date(Number(a), Number(m) - 1, Number(d));
    }
    const partes = valor.split('-');
    if (partes.length !== 3) return new Date(0);
    if (partes[0].length === 4) {
        return new Date(Number(partes[0]), Number(partes[1]) - 1, Number(partes[2]));
    }
    return new Date(Number(partes[2]), Number(partes[1]) - 1, Number(partes[0]));
}

function fechaLocalYYYYMM(fecha = new Date()) {
    return `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}`;
}

function fechaLocalYYYYMMDD(fecha = new Date()) {
    return `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}-${String(fecha.getDate()).padStart(2, '0')}`;
}

function obtenerFechaPagoMes(mesSel, dia) {
    const [anio, mes] = String(mesSel || fechaLocalYYYYMM()).split('-').map(Number);
    const diasEnMes = new Date(anio, mes, 0).getDate();
    const diaInt = Math.max(1, Math.min(parseInt(dia, 10) || 1, diasEnMes));
    return `${mesSel}-${String(diaInt).padStart(2, '0')}`;
}

function numeroSeguro(valor) {
    const n = Number.parseFloat(valor);
    return Number.isFinite(n) ? n : 0;
}

function normalizarTexto(valor) {
    return String(valor ?? '').trim().toLowerCase();
}

function esGastoExtraordinario(concepto) {
    const texto = normalizarTexto(concepto);
    return CONFIG.PALABRAS_EXCLUIDAS_PRESUPUESTO.some(palabra => texto.includes(normalizarTexto(palabra)));
}

function escapeHtml(valor) {
    return String(valor ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function claveRecurrente(concepto, categoria) {
    return normalizarTexto(concepto) + '|' + normalizarTexto(categoria);
}

async function sincronizarConfigServidor(payload) {
    try {
        const res = await apiFetch(CONFIG.CONFIG_URL, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
    } catch (e) {
        console.error('Error sincronizando configuración con servidor:', e);
    }
}

function obtenerRecurrentes() {
    try {
        const recs = JSON.parse(localStorage.getItem('recurrentes') || '[]');
        return Array.isArray(recs) ? recs : [];
    } catch { return []; }
}

function guardarRecurrentes(recs, sincronizar = true) {
    localStorage.setItem('recurrentes', JSON.stringify(recs));
    if (sincronizar) {
        sincronizarConfigServidor({ recurrentes: recs });
    }
}

function obtenerLimitesTarjetas() {
    try {
        const lim = JSON.parse(localStorage.getItem('card_limits') || '{}');
        return (lim && typeof lim === 'object') ? lim : {};
    } catch { return {}; }
}

function guardarLimitesTarjetas(limites, sincronizar = true) {
    localStorage.setItem('card_limits', JSON.stringify(limites));
    if (sincronizar) {
        sincronizarConfigServidor({ card_limits: limites });
    }
}

function resetearFormularioOperar() {
    const form = document.getElementById('mainForm');
    if (form) form.reset();
    const inFecha = document.getElementById('in-fecha');
    if (inFecha) inFecha.value = fechaLocalYYYYMMDD();
    const checkExtra = document.getElementById('check-extra');
    if (checkExtra) checkExtra.checked = false;
    const tituloForm = document.getElementById('form-operar-titulo');
    if (tituloForm) tituloForm.innerText = "Nueva Operación";

    const selectRec = document.getElementById('check-recurrente');
    if (selectRec) {
        const optPuntual = selectRec.querySelector('option[value="no"]');
        if (optPuntual) optPuntual.disabled = false;
    }

    const btnForm = document.querySelector('#mainForm button[type="submit"]');
    if (btnForm) {
        btnForm.innerText = "Confirmar Operación";
        btnForm.style.backgroundColor = "#00e5ff";
        btnForm.style.color = "#000";
    }
}

/* =========================================================
   4. INICIALIZACIÓN PIN
========================================================= */
const pinPadKeys = [1, 2, 3, 4, 5, 6, 7, 8, 9, 'C', 0, 'DEL'];
const pinPadContainer = document.getElementById('pin-pad');

pinPadKeys.forEach(v => {
    const b = document.createElement('button');
    b.className = "num-btn";
    b.innerText = v;
    b.onclick = async () => {
        if (v === 'C') {
            state.ui.pin = "";
        } else if (v === 'DEL') {
            state.ui.pin = state.ui.pin.slice(0, -1);
        } else if (state.ui.pin.length < 4) {
            state.ui.pin += v;
        }

        document.querySelectorAll('#pin-dots div').forEach((d, i) => {
            d.style.background = i < state.ui.pin.length ? '#00e5ff' : 'transparent';
        });

        if (state.ui.pin.length === 4) {
            const botones = document.querySelectorAll('#pin-pad button');
            botones.forEach(boton => boton.disabled = true);

            try {
                await iniciarSesion(state.ui.pin);
                document.getElementById('pin-screen').remove();
                document.getElementById('app-content').classList.remove('hidden');
                resetearFormularioOperar();
                await renderApp();
            } catch (error) {
                console.error('❌ Error de login:', error);
                state.ui.pin = "";
                document.querySelectorAll('#pin-dots div').forEach(d => d.style.background = 'transparent');
                const msgError = (error.message === 'PIN incorrecto' || String(error.message || '').startsWith('Demasiados intentos'))
                    ? error.message
                    : 'No se pudo iniciar sesión';
                showToast(msgError, 'error');
            } finally {
                botones.forEach(boton => boton.disabled = false);
            }
        }
    };
    if (pinPadContainer) pinPadContainer.appendChild(b);
});

/* =========================================================
   5. NAVEGACIÓN Y SWIPE
========================================================= */
window.goToTab = function(i) {
    state.ui.currentTabIndex = i;
    document.getElementById('main-view').style.transform = `translateX(-${i * 16.666}%)`;
    
    document.querySelectorAll('.nav-btn').forEach((b, idx) => {
        if (idx === i) b.classList.add('active-tab');
        else b.classList.remove('active-tab');
    });

    if (i === 0) setTimeout(updateChart, 100);

    if (i === 5 && !state.ui.editMode && !state.ui.editRecId) {
        const inFecha = document.getElementById('in-fecha');
        if (inFecha && !inFecha.value) inFecha.value = fechaLocalYYYYMMDD();
    }

    if (i !== 5) {
        state.ui.editMode = false;
        state.ui.editId = null;
        state.ui.editWasRecurrent = false;
        state.ui.editRecId = null;
        resetearFormularioOperar();
    }
};

window.cambiarMes = function(delta) {
    const filtro = document.getElementById('filtroMes');
    if (!filtro) return;
    const actual = filtro.value || fechaLocalYYYYMM();
    const [anio, mes] = actual.split('-').map(Number);
    const nuevaFecha = new Date(anio, mes - 1 + delta, 1);
    filtro.value = fechaLocalYYYYMM(nuevaFecha);
    actualizarInterfaz();
};

const vp = document.getElementById('viewport');
if (vp) {
    vp.addEventListener('touchstart', e => {
        state.ui.touchstartX = e.changedTouches[0].screenX;
        state.ui.touchstartY = e.changedTouches[0].screenY;
    }, { passive: true });

    vp.addEventListener('touchend', e => {
        const dx = e.changedTouches[0].screenX - state.ui.touchstartX;
        const dy = e.changedTouches[0].screenY - state.ui.touchstartY;
        
        if (Math.abs(dx) > 80 && Math.abs(dx) > Math.abs(dy)) {
            if (dx < 0 && state.ui.currentTabIndex < 5) {
                goToTab(state.ui.currentTabIndex + 1);
            } else if (dx > 0 && state.ui.currentTabIndex > 0) {
                goToTab(state.ui.currentTabIndex - 1);
            }
        }
    }, { passive: true });
}

/* =========================================================
   6. UI - TOAST, SALUDOS Y AUTOCOMPLETADO
========================================================= */
window.showToast = function(msj, tipo = 'success') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const esError = tipo !== 'success';
    const colorBorder = esError ? 'border-rose-500' : 'border-cyan-400';
    const icono = esError ? '⚠️' : '✅';
    const toast = document.createElement('div');
    
    toast.className = `bg-black/80 backdrop-blur-md border-l-4 ${colorBorder} text-white text-[10px] font-bold uppercase tracking-widest p-4 rounded-r-xl shadow-2xl transform translate-y-10 opacity-0 transition-all duration-500 flex items-center gap-3`;
    toast.innerHTML = `<span>${icono}</span><span>${escapeHtml(msj)}</span>`;
    
    container.appendChild(toast);
    setTimeout(() => toast.classList.remove('translate-y-10', 'opacity-0'), 100);
    setTimeout(() => {
        toast.classList.add('translate-y-[-20px]', 'opacity-0');
        setTimeout(() => toast.remove(), 500);
    }, 3000);
};

window.togglePrivacy = function() {
    state.ui.isPrivate = !state.ui.isPrivate;
    actualizarInterfaz();
};

window.toggleDesglosePresupuesto = function() {
    state.ui.desgloseAbierto = !state.ui.desgloseAbierto;
    const panel = document.getElementById('presupuesto-desglose');
    const icono = document.getElementById('icono-desglose-presupuesto');
    if (panel) panel.classList.toggle('hidden', !state.ui.desgloseAbierto);
    if (icono) icono.innerText = state.ui.desgloseAbierto ? '▲' : '▼';
};

function actualizarSaludo(saldo) {
    const hora = new Date().getHours();
    const texto = hora >= 6 && hora < 12 ? "¡Buenos días!" : hora >= 12 && hora < 21 ? "¡Buenas tardes!" : "¡Buenas noches!";
    
    let emoji, mensaje;
    if (saldo > 500) { emoji = "🤑"; mensaje = "Estado: En la gloria"; }
    else if (saldo > 100) { emoji = "⚖️"; mensaje = "Estado: Bajo control"; }
    else if (saldo > 0) { emoji = "😶"; mensaje = "Estado: Zona crítica"; }
    else { emoji = "💀"; mensaje = "Estado: Saldo en rojo"; }

    const elTexto = document.getElementById('saludo-texto');
    const elAnimo = document.getElementById('animo-financiero');
    if (elTexto && elAnimo) {
        elTexto.innerText = `${texto} ${emoji}`;
        elAnimo.innerText = mensaje;
    }
}

function actualizarAutocompletadoConceptos() {
    const datalist = document.getElementById('conceptos-frecuentes');
    if (!datalist) return;

    const conteo = new Map();
    const registrar = (raw, peso = 1) => {
        const limpio = String(raw || '').replace(/\s*#extra\b/gi, '').trim();
        if (!limpio) return;
        const clave = normalizarTexto(limpio);
        const actual = conteo.get(clave);
        if (actual) {
            actual.count += peso;
        } else {
            conteo.set(clave, { label: limpio, count: peso });
        }
    };

    obtenerRecurrentes().forEach(r => registrar(r.concepto, 5));
    state.data.appData.forEach(g => registrar(g.concepto, 1));

    const ordenados = Array.from(conteo.values())
        .sort((a, b) => b.count - a.count)
        .slice(0, 40);

    datalist.innerHTML = ordenados
        .map(item => `<option value="${escapeHtml(item.label)}">`)
        .join('');
}

function obtenerLogo(concepto) {
    const c = String(concepto || '').toLowerCase();
    const reglas = [
        ['nala', '#FFC0CB', '🐶'],
        ['sueldo', '#22c55e', '💵'],
        ['nomina', '#22c55e', '💵'],
        ['ingreso', '#22c55e', '💵'],
        ['extra', '#22c55e', '💵'],
        ['abono', '#10b981', '🔄'],
        ['devolución', '#10b981', '🔄'],
        ['gasolina', '#4b5563', '⛽'],
        ['recarga', '#0070f3', '⚡'],
        ['portátil', '#475569', '💻'],
        ['tarjeta', '#00e5ff', '💳'],
        ['amazon', '#FF9900', 'A'],
        ['gasto', '#ef4444', '💸']
    ];
    
    const match = reglas.find(r => c.includes(r[0]));
    if (match) {
        return `<div class="flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-lg shadow-lg" style="background:${match[1]}">${match[2]}</div>`;
    }
    const inicial = escapeHtml(String(concepto || '?').charAt(0).toUpperCase());
    return `<div class="flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-lg bg-slate-700 shadow-lg">${inicial}</div>`;
}

/* =========================================================
   7. CORE & LOGICA DE NEGOCIO
========================================================= */
async function renderApp() {
    const cache = localStorage.getItem('appData_cache');
    if (cache) {
        try {
            state.data.appData = JSON.parse(cache);
            if (!Array.isArray(state.data.appData)) state.data.appData = [];
            actualizarInterfaz();
        } catch { state.data.appData = []; }
    }

    try {
        const res = await apiFetch(CONFIG.API_URL, {});
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const dataFresh = await res.json();
        
        const hoy = new Date();
        hoy.setHours(0, 0, 0, 0);

        let processedData = Array.isArray(dataFresh) ? dataFresh.map((g, index) => ({
            ...g,
            importe: numeroSeguro(g.importe),
            fechaObjeto: parsearFecha(g.fecha),
            indexOriginal: index
        })) : [];

        processedData.sort((a, b) => {
            const aEsFuturo = a.fechaObjeto > hoy;
            const bEsFuturo = b.fechaObjeto > hoy;
            if (aEsFuturo && !bEsFuturo) return 1;
            if (!aEsFuturo && bEsFuturo) return -1;
            if (a.fechaObjeto.getTime() !== b.fechaObjeto.getTime()) return b.fechaObjeto - a.fechaObjeto;
            return b.indexOriginal - a.indexOriginal;
        });

        state.data.appData = processedData.map(mov => {
            const cleanMov = { ...mov };
            delete cleanMov.fechaObjeto;
            delete cleanMov.indexOriginal;
            return cleanMov;
        });

        localStorage.setItem('appData_cache', JSON.stringify(state.data.appData));

        try {
            const configRes = await apiFetch(CONFIG.CONFIG_URL, {});
            if (configRes.ok) {
                const configFresh = await configRes.json();
                const migracionInicial = {};

                if (Array.isArray(configFresh.recurrentes)) {
                    guardarRecurrentes(configFresh.recurrentes, false);
                } else {
                    const localesRecs = obtenerRecurrentes();
                    if (localesRecs.length > 0) {
                        migracionInicial.recurrentes = localesRecs;
                    }
                }

                if (configFresh.card_limits && typeof configFresh.card_limits === 'object') {
                    guardarLimitesTarjetas(configFresh.card_limits, false);
                } else {
                    const localesLimites = obtenerLimitesTarjetas();
                    if (Object.keys(localesLimites).length > 0) {
                        migracionInicial.card_limits = localesLimites;
                    }
                }

                if (Object.keys(migracionInicial).length > 0) {
                    await sincronizarConfigServidor(migracionInicial);
                }
            }
        } catch (errConfig) {
            console.error("Error sincronizando configuración:", errConfig);
        }

        actualizarInterfaz();
        await procesarPagosAutomaticos();
    } catch(e) {
        console.error("Error cargando datos:", e);
        showToast("No se pudieron actualizar los datos", "error");
    }
}

window.actualizarInterfaz = function() {
    const filtro = document.getElementById('filtroMes');
    if (!filtro) return;

    const mesSel = filtro.value || fechaLocalYYYYMM();
    filtro.value = mesSel;
    localStorage.setItem('ultimo_mes_consultado', mesSel);

    const [anioFiltro, mesFiltroNumero] = mesSel.split('-').map(Number);
    const mesFiltro = mesFiltroNumero - 1;

    const elMesLabel = document.getElementById('mes-actual-label');
    if (elMesLabel) {
        const fechaLabel = new Date(anioFiltro, mesFiltro, 1);
        elMesLabel.innerText = fechaLabel.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });
    }

    const hoy = new Date();
    const mesActual = hoy.getMonth();
    const anioActual = hoy.getFullYear();
    const hoyStr = fechaLocalYYYYMMDD(hoy);
    const hoyRef = parsearFecha(hoyStr).getTime();

    let saldoReal = 0, gFuturos = 0, iFuturos = 0;
    let deudaAqua = 0, deudaExplora = 0;
    const recs = limpiarPagosFijosCaducados();

    // PAGOS E INGRESOS FIJOS FUTUROS (Comprueba todo el mes por si se adelantó alguno)
    recs.forEach(p => {
        if (!pagoFijoDentroDelPlazo(p, mesSel)) return;
        const importe = Math.abs(numeroSeguro(p.importe));
        const catRec = String(p.categoria || '');
        const esIngresoRec = INGRESOS_LISTA.includes(catRec) || catRec.includes("Abono");
        const yaRegistrado = state.data.appData.some(g => movimientoCoincideRecurrenteEnMes(g, p, mesSel));

        if (!yaRegistrado) {
            if (esIngresoRec) iFuturos += importe;
            else gFuturos += importe;
        }
    });

    // HISTORIAL
    const listaPasado = document.getElementById('listaPasado');
    let listaPasadoHTML = [];
    let fechaUltimoGrupo = "";

    state.data.appData.forEach(g => {
        const val = Math.abs(numeroSeguro(g.importe));
        const categoria = String(g.categoria || '');
        const esI = INGRESOS_LISTA.includes(categoria);
        const esAbono = categoria.includes("Abono");
        const fechaG = parsearFecha(g.fecha);
        const fechaGRef = fechaG.getTime();
        const esP = fechaGRef <= hoyRef;

        // DEUDA TARJETAS
        if (categoria === CATEGORIAS.AQUA && fechaG.getMonth() === mesFiltro && fechaG.getFullYear() === anioFiltro) deudaAqua += val;
        if (categoria === CATEGORIAS.EXPLORA && fechaG.getMonth() === mesFiltro && fechaG.getFullYear() === anioFiltro) deudaExplora += val;
        if (categoria === CATEGORIAS.ABONO_AQUA && fechaG.getMonth() === mesFiltro && fechaG.getFullYear() === anioFiltro) deudaAqua -= val;
        if (categoria === CATEGORIAS.ABONO_EXPLORA && fechaG.getMonth() === mesFiltro && fechaG.getFullYear() === anioFiltro) deudaExplora -= val;

        // SALDO REAL
        if (esI) {
            if (esP) saldoReal += val; else iFuturos += val;
        } else if (esAbono) {
            const fechaCobro = new Date(fechaG.getFullYear(), fechaG.getMonth() + 1, 5);
            if (hoy >= fechaCobro) saldoReal += val;
            else if (fechaG.getFullYear() < anioActual || (fechaG.getFullYear() === anioActual && fechaG.getMonth() < mesActual)) gFuturos = Math.max(0, gFuturos - val);
        } else {
            const esTarjeta = categoria === CATEGORIAS.AQUA || categoria === CATEGORIAS.EXPLORA;
            if (!esTarjeta) {
                if (esP) saldoReal -= val; else gFuturos += val;
            } else {
                const fechaCobro = new Date(fechaG.getFullYear(), fechaG.getMonth() + 1, 5);
                if (hoy >= fechaCobro) saldoReal -= val;
                else if (fechaG.getFullYear() < anioActual || (fechaG.getFullYear() === anioActual && fechaG.getMonth() < mesActual)) gFuturos += val;
            }
        }

        // PREPARAR RENDER MOVIMIENTO
        if (String(g.fecha || '').startsWith(mesSel)) {
            if (g.fecha !== fechaUltimoGrupo) {
                const labelF = g.fecha === hoyStr ? "HOY" : fechaG.toLocaleDateString('es-ES', { day: 'numeric', month: 'long' });
                listaPasadoHTML.push(`<div class="pt-6 pb-2 px-2 fecha-separador"><p class="text-[10px] font-black text-cyan-400/80 uppercase tracking-widest">${escapeHtml(labelF)}</p></div>`);
                fechaUltimoGrupo = g.fecha;
            }

            const estiloFuturo = !esP ? 'opacity-40 border-l-4 border-cyan-400' : '';
            const disp = state.ui.isPrivate ? "****€" : val.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + "€";
            const esPositivo = esI || esAbono;
            const signedVal = esPositivo ? val : -val;
            const idSeguro = encodeURIComponent(String(g._id ?? ''));
            const badgeExtra = (!esPositivo && esGastoExtraordinario(g.concepto))
                ? `<span class="text-[8px] font-black uppercase px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-300 ml-1">EXTRA</span>`
                : '';

            listaPasadoHTML.push(`
                <div class="bbva-card p-4 flex justify-between items-center gap-3 ${estiloFuturo}" data-cat="${escapeHtml(categoria)}" data-search="${escapeHtml(normalizarTexto(g.concepto + ' ' + categoria))}" data-signed="${signedVal}">
                    <div class="flex items-center gap-3 flex-1 overflow-hidden">
                        ${obtenerLogo(g.concepto)}
                        <div class="truncate">
                            <p class="text-sm font-bold text-white truncate">${escapeHtml(g.concepto)}${badgeExtra}</p>
                            <p class="text-[9px] text-slate-500 uppercase mt-1">${escapeHtml(categoria)}</p>
                        </div>
                    </div>
                    <div class="flex items-center gap-3">
                        <p class="font-black ${esPositivo ? 'text-cyan-400' : 'text-white'}">${esPositivo ? '+' : '-'}${disp}</p>
                        <div class="flex items-center gap-2">
                            <button onclick="prepararEdicion(decodeURIComponent('${idSeguro}'))" class="btn-action text-[#00fbff]">✏️</button>
                            <button onclick="deleteGasto(decodeURIComponent('${idSeguro}'))" class="btn-action text-[#ff0040]">🗑️</button>
                        </div>
                    </div>
                </div>
            `);
        }
    });
    
    listaPasado.innerHTML = listaPasadoHTML.join('');
    aplicarFiltrosMovimientos();

    deudaAqua = Math.max(0, deudaAqua);
    deudaExplora = Math.max(0, deudaExplora);

    // PREVISIÓN (Con botón para adelantar cobro/pago a HOY)
    const listaFuturo = document.getElementById('listaFuturo');
    let listaFuturoHTML = [];
    let fechaUltimoGrupoFuturo = "";

    let movsParaLista = state.data.appData
        .filter(g => g.fecha > hoyStr && String(g.fecha || '').startsWith(mesSel))
        .map(g => ({ ...g, esFijo: false }));

    recs.forEach(p => {
        if (!pagoFijoDentroDelPlazo(p, mesSel)) return;
        const fechaP = obtenerFechaPagoMes(mesSel, p.dia);
        const yaRegistrado = state.data.appData.some(g => movimientoCoincideRecurrenteEnMes(g, p, mesSel));

        if (fechaP > hoyStr && !yaRegistrado) {
            movsParaLista.push({
                recId: p.id,
                concepto: p.concepto,
                importe: numeroSeguro(p.importe),
                categoria: p.categoria,
                fecha: fechaP,
                esFijo: true
            });
        }
    });

    movsParaLista.sort((a, b) => a.fecha.localeCompare(b.fecha)).forEach(g => {
        const val = Math.abs(numeroSeguro(g.importe));
        const disp = state.ui.isPrivate ? "****€" : val.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + "€";
        const catFuturo = String(g.categoria || '');
        const esIngresoFuturo = INGRESOS_LISTA.includes(catFuturo) || catFuturo.includes("Abono");

        if (g.fecha !== fechaUltimoGrupoFuturo) {
            const fLabel = parsearFecha(g.fecha).toLocaleDateString('es-ES', { day: 'numeric', month: 'long' });
            listaFuturoHTML.push(`<div class="pt-6 pb-2 px-2"><p class="text-[10px] font-black text-cyan-400 uppercase tracking-widest">${escapeHtml(fLabel)}</p></div>`);
            fechaUltimoGrupoFuturo = g.fecha;
        }

        const esTrulyFijo = g.esFijo || recs.some(p => claveRecurrente(p.concepto, p.categoria) === claveRecurrente(g.concepto, g.categoria));
        const etiquetaFijo = esTrulyFijo ? `<span style="color:#fde68a;font-size:8px;margin-left:4px;font-weight:900;">FIJO</span>` : '';
        const refId = encodeURIComponent(String(g.esFijo ? (g.recId ?? '') : (g._id ?? '')));
        const tipoAdelanto = g.esFijo ? 'fijo' : 'mov';

        listaFuturoHTML.push(`
            <div class="bbva-card p-4 flex justify-between items-center gap-3 border-l-4 ${esIngresoFuturo ? 'border-emerald-400/40' : 'border-cyan-400/30'} mx-2 mb-2">
                <div class="flex items-center gap-3 flex-1 overflow-hidden">
                    ${obtenerLogo(g.concepto)}
                    <div class="truncate">
                        <p class="text-sm font-bold text-white truncate">${escapeHtml(g.concepto)} ${etiquetaFijo}</p>
                        <p class="text-[9px] text-slate-500 uppercase mt-1">${escapeHtml(catFuturo)}</p>
                    </div>
                </div>
                <div class="flex flex-col items-end gap-1.5">
                    <p class="font-black ${esIngresoFuturo ? 'text-emerald-400' : 'text-white'}">${esIngresoFuturo ? '+' : '-'}${disp}</p>
                    <button onclick="adelantarPrevision('${tipoAdelanto}', decodeURIComponent('${refId}'))" class="px-2 py-0.5 rounded-md bg-cyan-400/15 border border-cyan-400/40 text-[8px] font-black uppercase tracking-wider text-cyan-300 active:scale-95 transition-transform">⚡ Hoy</button>
                </div>
            </div>
        `);
    });

    if (!listaFuturoHTML.length) {
        listaFuturoHTML.push(`<div class="text-center py-10 opacity-30"><span class="text-4xl">⏳</span><p class="text-[10px] font-bold uppercase mt-2 tracking-widest">Sin movimientos pendientes este mes</p></div>`);
    }
    listaFuturo.innerHTML = listaFuturoHTML.join('');

    // ACTUALIZAR SALDOS Y UI TEXTOS
    const elReal = document.getElementById('valReal');
    clearInterval(state.data.saldoTimer);

    if (state.ui.isPrivate) {
        elReal.innerText = "****€";
        elReal.style.color = "white";
    } else {
        let inicio = 0;
        const saldoFinal = saldoReal;
        state.data.saldoTimer = setInterval(() => {
            inicio += (saldoFinal - inicio) / 10;
            if (Math.abs(saldoFinal - inicio) < 0.1) {
                inicio = saldoFinal;
                clearInterval(state.data.saldoTimer);
            }
            elReal.innerText = inicio.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + "€";
            elReal.style.color = inicio > 200 ? '#00e5ff' : inicio >= 100 ? '#fbbf24' : '#f43f5e';
        }, 30);
    }

    actualizarSaludo(saldoReal);

    const saldoFinalCalculado = saldoReal - gFuturos + iFuturos;
    document.getElementById('valPend').innerText = state.ui.isPrivate ? "****€" : "-" + gFuturos.toLocaleString('de-DE', { minimumFractionDigits: 2 }) + "€";
    
    const elProj = document.getElementById('valProj');
    elProj.innerText = state.ui.isPrivate ? "****€" : saldoFinalCalculado.toLocaleString('de-DE', { minimumFractionDigits: 2 }) + "€";
    elProj.style.setProperty('color', saldoFinalCalculado < 0 ? '#f43f5e' : '#00e5ff', 'important');

    document.getElementById('card-aqua-val').innerText = state.ui.isPrivate ? "****€" : deudaAqua.toLocaleString('de-DE', { minimumFractionDigits: 2 }) + "€";
    document.getElementById('card-explora-val').innerText = state.ui.isPrivate ? "****€" : deudaExplora.toLocaleString('de-DE', { minimumFractionDigits: 2 }) + "€";
    actualizarBarrasLimitesTarjetas(deudaExplora, deudaAqua);

    actualizarAutocompletadoConceptos();
    renderRecurrentes(mesSel);
    updateChart();
    calcularPresupuesto(mesSel);
};

/* =========================================================
   8. LÍMITES VISUALES DE TARJETAS
========================================================= */
function actualizarBarrasLimitesTarjetas(deudaExplora, deudaAqua) {
    const limites = obtenerLimitesTarjetas();
    const fmt = (n) => state.ui.isPrivate
        ? "****€"
        : n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + "€";

    const aplicar = (deuda, limite, barId, txtId) => {
        const bar = document.getElementById(barId);
        const txt = document.getElementById(txtId);
        if (!bar || !txt) return;

        if (!limite || limite <= 0) {
            bar.style.width = "0%";
            bar.className = "h-full bg-cyan-400 rounded-full transition-all duration-700";
            txt.innerText = "Pulsa ⚙️ Límites para configurar";
            return;
        }

        const pct = (deuda / limite) * 100;
        const disponible = Math.max(0, limite - deuda);
        bar.style.width = `${Math.min(pct, 100)}%`;

        if (pct >= 95) {
            bar.className = "h-full bg-rose-500 rounded-full transition-all duration-700";
        } else if (pct >= 75) {
            bar.className = "h-full bg-amber-400 rounded-full transition-all duration-700";
        } else {
            bar.className = "h-full bg-cyan-400 rounded-full transition-all duration-700";
        }

        txt.innerText = `Disp: ${fmt(disponible)} / Límite: ${fmt(limite)} (${Math.round(pct)}%)`;
    };

    aplicar(deudaExplora, numeroSeguro(limites[CATEGORIAS.EXPLORA]), 'bar-explora', 'limit-explora-txt');
    aplicar(deudaAqua, numeroSeguro(limites[CATEGORIAS.AQUA]), 'bar-aqua', 'limit-aqua-txt');
}

window.configurarLimitesTarjetas = function() {
    const actuales = obtenerLimitesTarjetas();
    const expActual = numeroSeguro(actuales[CATEGORIAS.EXPLORA]);
    const aquaActual = numeroSeguro(actuales[CATEGORIAS.AQUA]);

    const resExp = prompt("Límite mensual para Tarjeta Explora (€) — pon 0 para quitar:", expActual > 0 ? String(expActual) : "1000");
    if (resExp === null) return;
    const resAqua = prompt("Límite mensual para Tarjeta Aqua (€) — pon 0 para quitar:", aquaActual > 0 ? String(aquaActual) : "600");
    if (resAqua === null) return;

    const nuevoExp = Math.max(0, numeroSeguro(resExp.replace(',', '.')));
    const nuevoAqua = Math.max(0, numeroSeguro(resAqua.replace(',', '.')));

    guardarLimitesTarjetas({
        [CATEGORIAS.EXPLORA]: nuevoExp,
        [CATEGORIAS.AQUA]: nuevoAqua
    });
    actualizarInterfaz();
    showToast("Límites de tarjetas guardados", "success");
};

/* =========================================================
   9. FILTROS Y EXPORTACIÓN CSV EN MOVIMIENTOS
========================================================= */
window.aplicarFiltrosMovimientos = function() {
    const buscador = document.getElementById('buscadorMovs');
    const texto = normalizarTexto(buscador ? buscador.value : '');
    const catFiltro = state.ui.filtroCategoria;
    const hayFiltroActivo = Boolean(texto || catFiltro);

    document.querySelectorAll('.fecha-separador').forEach(f => {
        f.style.display = hayFiltroActivo ? 'none' : 'block';
    });

    const elementos = document.querySelectorAll('#listaPasado .bbva-card');
    let visibles = 0;
    let totalNeto = 0;

    elementos.forEach(el => {
        const cat = el.getAttribute('data-cat');
        const searchStr = el.getAttribute('data-search') || '';
        const signed = numeroSeguro(el.getAttribute('data-signed'));

        const cumpleCat = !catFiltro || cat === catFiltro ||
            (catFiltro === CATEGORIAS.AQUA && cat === CATEGORIAS.ABONO_AQUA) ||
            (catFiltro === CATEGORIAS.EXPLORA && cat === CATEGORIAS.ABONO_EXPLORA);
        const cumpleTexto = !texto || searchStr.includes(texto);

        if (cumpleCat && cumpleTexto) {
            el.style.display = 'flex';
            if (catFiltro) el.style.borderLeft = "4px solid #00e5ff";
            visibles++;
            totalNeto += signed;
        } else {
            el.style.display = 'none';
        }
    });

    const panelResumen = document.getElementById('resumen-filtro-movs');
    const elCount = document.getElementById('filtro-movs-count');
    const elTotal = document.getElementById('filtro-movs-total');

    if (panelResumen && elCount && elTotal) {
        if (hayFiltroActivo) {
            panelResumen.classList.remove('hidden');
            elCount.innerText = `${visibles} ${visibles === 1 ? 'movimiento' : 'movimientos'}`;
            if (state.ui.isPrivate) {
                elTotal.innerText = "****€";
                elTotal.className = "text-xs font-black text-white";
            } else {
                const signo = totalNeto > 0 ? '+' : '';
                elTotal.innerText = `Total: ${signo}${totalNeto.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}€`;
                elTotal.className = `text-xs font-black ${totalNeto > 0 ? 'text-emerald-400' : totalNeto < 0 ? 'text-rose-400' : 'text-white'}`;
            }
        } else {
            panelResumen.classList.add('hidden');
        }
    }
};

window.exportarMesCSV = function() {
    const filtro = document.getElementById('filtroMes');
    const mesSel = (filtro && filtro.value) ? filtro.value : fechaLocalYYYYMM();
    const movsMes = state.data.appData
        .filter(g => String(g.fecha || '').startsWith(mesSel))
        .sort((a, b) => String(a.fecha).localeCompare(String(b.fecha)));

    if (!movsMes.length) {
        showToast("No hay movimientos en este mes", "error");
        return;
    }

    const escaparCSV = (val) => `"${String(val ?? '').replace(/"/g, '""')}"`;
    const lineas = ['Fecha;Concepto;Categoría;Tipo;Extraordinario;Importe'];

    movsMes.forEach(g => {
        const val = Math.abs(numeroSeguro(g.importe));
        const cat = String(g.categoria || '');
        const esIngreso = INGRESOS_LISTA.includes(cat);
        const esAbono = cat.includes("Abono");
        const tipo = esIngreso ? 'Ingreso' : esAbono ? 'Abono' : 'Gasto';
        const extra = (!esIngreso && !esAbono && esGastoExtraordinario(g.concepto)) ? 'Sí' : 'No';
        const importeFirmado = (esIngreso || esAbono) ? val : -val;
        const importeStr = importeFirmado.toFixed(2).replace('.', ',');

        lineas.push([
            escaparCSV(g.fecha),
            escaparCSV(g.concepto),
            escaparCSV(cat),
            escaparCSV(tipo),
            escaparCSV(extra),
            importeStr
        ].join(';'));
    });

    const csvContenido = '\uFEFF' + lineas.join('\r\n');
    const blob = new Blob([csvContenido], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `bbva-movimientos-${mesSel}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    showToast(`CSV de ${mesSel} descargado`, "success");
};

/* =========================================================
   10. PRESUPUESTO CON DESGLOSE DETALLADO
========================================================= */
function calcularPresupuesto(mesSel) {
    const bPresupuesto = document.getElementById('barra-presupuesto');
    const tLimite = document.getElementById('txt-limite');
    const mPresupuesto = document.getElementById('msg-presupuesto');
    const vLimite = document.getElementById('valor-limite');
    if (!bPresupuesto || !tLimite || !mPresupuesto || !vLimite) return;

    const fmt = (num) => state.ui.isPrivate
        ? "****€"
        : num.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + "€";

    const recsActivos = obtenerRecurrentes().filter(p => pagoFijoDentroDelPlazo(p, mesSel));

    // 1. INGRESOS DEL MES
    const ingresosRegistrados = state.data.appData
        .filter(g => String(g.fecha || '').startsWith(mesSel) && INGRESOS_LISTA.includes(g.categoria))
        .reduce((sum, g) => sum + Math.abs(numeroSeguro(g.importe)), 0);

    const ingresosFijosPendientes = recsActivos
        .filter(p => {
            const cat = String(p.categoria || '');
            if (!INGRESOS_LISTA.includes(cat)) return false;
            return !state.data.appData.some(g => movimientoCoincideRecurrenteEnMes(g, p, mesSel));
        })
        .reduce((sum, p) => sum + Math.abs(numeroSeguro(p.importe)), 0);

    const ingresosTotales = (ingresosRegistrados + ingresosFijosPendientes) > 0
        ? (ingresosRegistrados + ingresosFijosPendientes)
        : 700;

    // 2. GASTOS FIJOS VS. VARIABLES VS. EXTRAORDINARIOS
    const recsGasto = recsActivos.filter(p => {
        const cat = String(p.categoria || '');
        return !INGRESOS_LISTA.includes(cat) && !cat.includes("Abono");
    });

    const clavesFijos = new Set(recsGasto.map(p => claveRecurrente(p.concepto, p.categoria)));

    let totalFijosMes = 0;
    recsGasto.forEach(p => {
        const movReal = state.data.appData.find(g => movimientoCoincideRecurrenteEnMes(g, p, mesSel));
        totalFijosMes += movReal
            ? Math.abs(numeroSeguro(movReal.importe))
            : Math.abs(numeroSeguro(p.importe));
    });

    let gastosVariablesBrutos = 0;
    let totalExtraMes = 0;

    state.data.appData.forEach(g => {
        if (!String(g.fecha || '').startsWith(mesSel)) return;
        const cat = String(g.categoria || '');
        if (INGRESOS_LISTA.includes(cat) || cat.includes("Abono")) return;
        const val = Math.abs(numeroSeguro(g.importe));

        if (esGastoExtraordinario(g.concepto)) {
            totalExtraMes += val;
        } else if (!clavesFijos.has(claveRecurrente(g.concepto, cat))) {
            gastosVariablesBrutos += val;
        }
    });

    const abonosMes = state.data.appData
        .filter(g => String(g.fecha || '').startsWith(mesSel) && String(g.categoria || '').includes("Abono"))
        .reduce((sum, g) => sum + Math.abs(numeroSeguro(g.importe)), 0);

    const gastosVariables = Math.max(0, gastosVariablesBrutos - abonosMes);

    // Actualizar desglose desplegable
    const elIng = document.getElementById('desglose-ingresos');
    const elFij = document.getElementById('desglose-fijos');
    const elVar = document.getElementById('desglose-variable');
    const elExt = document.getElementById('desglose-extra');
    if (elIng) elIng.innerText = state.ui.isPrivate ? "****€" : `+${fmt(ingresosTotales)}`;
    if (elFij) elFij.innerText = state.ui.isPrivate ? "****€" : `-${fmt(totalFijosMes)}`;
    if (elVar) elVar.innerText = state.ui.isPrivate ? "****€" : `-${fmt(gastosVariables)}`;
    if (elExt) elExt.innerText = state.ui.isPrivate ? "****€" : `-${fmt(totalExtraMes)}`;

    // 3. MARGEN REAL DISPONIBLE
    const limiteVariable = Math.max(0, ingresosTotales - totalFijosMes);
    vLimite.innerText = fmt(limiteVariable);

    if (limiteVariable <= 0) {
        bPresupuesto.style.width = "100%";
        bPresupuesto.className = "h-full rounded-full transition-all duration-1000 ease-out bg-rose-500 shadow-[0_0_15px_rgba(244,63,94,0.7)] animate-pulse";
        tLimite.innerText = "100%";
        mPresupuesto.innerText = "Fijos cubren el 100% de ingresos";
        mPresupuesto.style.color = "#fb7185";
        return;
    }

    // 4. RITMO DE GASTO VS. CALENDARIO
    const hoy = new Date();
    const mesActualStr = fechaLocalYYYYMM(hoy);
    const [anioSel, mesNumSel] = mesSel.split('-').map(Number);
    const diasEnMes = new Date(anioSel, mesNumSel, 0).getDate();

    let pctMesTranscurrido = 100;
    let diasRestantes = 0;

    if (mesSel === mesActualStr) {
        const diaHoy = hoy.getDate();
        pctMesTranscurrido = (diaHoy / diasEnMes) * 100;
        diasRestantes = Math.max(1, diasEnMes - diaHoy + 1);
    } else if (mesSel > mesActualStr) {
        pctMesTranscurrido = 0;
        diasRestantes = diasEnMes;
    }

    const pctReal = (gastosVariables / limiteVariable) * 100;
    const pctBarra = Math.min(pctReal, 100);
    const diferenciaRitmo = pctReal - pctMesTranscurrido;
    const disponible = limiteVariable - gastosVariables;
    const margenDiario = diasRestantes > 0 ? Math.max(0, disponible / diasRestantes) : 0;

    bPresupuesto.style.width = `${pctBarra}%`;
    tLimite.innerText = `${Math.round(pctReal)}%`;

    if (pctReal >= 100) {
        bPresupuesto.className = "h-full rounded-full transition-all duration-1000 ease-out bg-rose-500 shadow-[0_0_15px_rgba(244,63,94,0.7)] animate-pulse";
        mPresupuesto.innerText = `Excedido en ${fmt(Math.abs(disponible))}`;
        mPresupuesto.style.color = "#fb7185";
    } else if (pctReal >= 85 || (mesSel === mesActualStr && diferenciaRitmo > 10)) {
        bPresupuesto.className = "h-full rounded-full transition-all duration-1000 ease-out bg-amber-400 shadow-[0_0_10px_rgba(251,191,36,0.4)]";
        mPresupuesto.innerText = diasRestantes > 0
            ? `Ritmo alto (+${Math.round(diferenciaRitmo)}%) · ${fmt(margenDiario)}/día`
            : `Cerrado · Sobró ${fmt(disponible)}`;
        mPresupuesto.style.color = "#fbbf24";
    } else {
        bPresupuesto.className = "h-full rounded-full transition-all duration-1000 ease-out bg-cyan-400";
        mPresupuesto.innerText = diasRestantes > 0
            ? `Ritmo óptimo · ${fmt(margenDiario)}/día`
            : `Cerrado · Ahorrado ${fmt(disponible)}`;
        mPresupuesto.style.color = "rgba(0,229,255,0.75)";
    }
}

/* =========================================================
   11. GRÁFICO PRINCIPAL
========================================================= */
function updateChart() {
    const canvas = document.getElementById('gastosChart');
    const filtro = document.getElementById('filtroMes');
    if (!canvas || !filtro) return;

    const mesActual = filtro.value;
    const desglose = {};

    state.data.appData.forEach(g => {
        if (!String(g.fecha || '').startsWith(mesActual)) return;
        const importe = Math.abs(numeroSeguro(g.importe));

        if (g.categoria === CATEGORIAS.ABONO_AQUA) desglose[CATEGORIAS.AQUA] = (desglose[CATEGORIAS.AQUA] || 0) - importe;
        else if (g.categoria === CATEGORIAS.ABONO_EXPLORA) desglose[CATEGORIAS.EXPLORA] = (desglose[CATEGORIAS.EXPLORA] || 0) - importe;
        else if (!INGRESOS_LISTA.includes(g.categoria)) desglose[g.categoria] = (desglose[g.categoria] || 0) + importe;
    });

    Object.keys(desglose).forEach(key => { if (desglose[key] <= 0) delete desglose[key]; });

    if (state.data.gastosChart) {
        state.data.gastosChart.destroy();
        state.data.gastosChart = null;
    }

    state.data.gastosChart = new Chart(canvas.getContext('2d'), {
        type: 'doughnut',
        data: {
            labels: Object.keys(desglose),
            datasets: [{
                data: Object.values(desglose),
                backgroundColor: ['#00e5ff', '#7c4dff', '#ff4081', '#ffee33', '#4caf50', '#ff9800', '#E0E0E0', '#0091EA', '#8D6E63', '#26A69A'],
                borderColor: '#072146',
                borderWidth: 2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '75%',
            plugins: {
                legend: { position: 'right', align: 'center', labels: { color: 'white', font: { size: 10 }, boxWidth: 12, padding: 15, usePointStyle: true } },
                tooltip: {
                    callbacks: {
                        label: ctx => state.ui.isPrivate
                            ? ` ${ctx.label}: ****€`
                            : ` ${ctx.label}: ${Number(ctx.raw).toLocaleString('de-DE', { minimumFractionDigits: 2 })}€`
                    }
                }
            },
            onClick: (evt, item) => {
                if (!item.length) return;
                const index = item[0].index;
                const categoriaPulsada = state.data.gastosChart.data.labels[index];
                state.ui.filtroCategoria = categoriaPulsada;
                
                goToTab(3);
                setTimeout(() => {
                    const tabMovs = document.querySelectorAll('.tab-content')[3];
                    if (tabMovs) tabMovs.scrollTop = 0;
                    aplicarFiltrosMovimientos();

                    const btnExistente = document.getElementById('btn-quitar-filtro');
                    if (btnExistente) btnExistente.remove();

                    const btn = document.createElement('button');
                    btn.id = 'btn-quitar-filtro';
                    btn.innerHTML = `Limpiar filtro: ${escapeHtml(categoriaPulsada)} ✕`;
                    btn.className = "fixed bottom-24 left-1/2 -translate-x-1/2 bg-white px-6 py-3 rounded-full font-black text-[10px] uppercase shadow-2xl z-[50] border-2 border-cyan-400";
                    btn.style.color = "#072146";
                    btn.onclick = () => {
                        state.ui.filtroCategoria = null;
                        document.querySelectorAll('#listaPasado .bbva-card').forEach(el => { el.style.borderLeft = "none"; });
                        aplicarFiltrosMovimientos();
                        btn.remove();
                    };
                    document.body.appendChild(btn);
                }, 400);
            }
        }
    });
}

/* =========================================================
   12. GESTION RECURRENTES + BACKUP + PREVISIÓN
========================================================= */
window.adelantarPrevision = async function(tipo, id) {
    const hoyStr = fechaLocalYYYYMMDD();

    if (tipo === 'fijo') {
        const rec = obtenerRecurrentes().find(p => String(p.id) === String(id));
        if (!rec) return;
        if (!confirm(`¿Registrar "${rec.concepto}" hoy (${hoyStr})?`)) return;

        try {
            const res = await apiFetch(CONFIG.API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    concepto: rec.concepto,
                    importe: Math.abs(numeroSeguro(rec.importe)),
                    categoria: rec.categoria,
                    fecha: hoyStr
                })
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            showToast("Movimiento adelantado a hoy", "success");
            await renderApp();
        } catch {
            showToast("No se pudo adelantar el movimiento", "error");
        }
    } else {
        const mov = state.data.appData.find(g => String(g._id) === String(id));
        if (!mov) return;
        if (!confirm(`¿Mover "${mov.concepto}" a hoy (${hoyStr})?`)) return;

        try {
            const res = await apiFetch(`${CONFIG.API_URL}/${encodeURIComponent(id)}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    concepto: mov.concepto,
                    importe: Math.abs(numeroSeguro(mov.importe)),
                    categoria: mov.categoria,
                    fecha: hoyStr
                })
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            showToast("Fecha actualizada a hoy", "success");
            await renderApp();
        } catch {
            showToast("No se pudo actualizar la fecha", "error");
        }
    }
};

window.prepararEdicionRecurrente = function(id) {
    const rec = obtenerRecurrentes().find(p => String(p.id) === String(id));
    if (!rec) return;

    const conceptoOriginal = String(rec.concepto || '');
    const esExtra = esGastoExtraordinario(conceptoOriginal);
    const conceptoLimpio = conceptoOriginal.replace(/\s*#extra\b/gi, '').trim();
    const mesBase = (document.getElementById('filtroMes')?.value) || fechaLocalYYYYMM();

    document.getElementById('in-concepto').value = conceptoLimpio;
    document.getElementById('in-importe').value = Math.abs(numeroSeguro(rec.importe));
    document.getElementById('in-categoria').value = rec.categoria || '';
    document.getElementById('in-fecha').value = obtenerFechaPagoMes(mesBase, rec.dia);

    const checkExtra = document.getElementById('check-extra');
    if (checkExtra) checkExtra.checked = esExtra;

    const checkEl = document.getElementById('check-recurrente');
    if (checkEl) {
        checkEl.value = rec.duracion || 'indefinido';
        const optPuntual = checkEl.querySelector('option[value="no"]');
        if (optPuntual) optPuntual.disabled = true;
    }

    state.ui.editMode = false;
    state.ui.editId = null;
    state.ui.editRecId = id;

    const tituloForm = document.getElementById('form-operar-titulo');
    if (tituloForm) tituloForm.innerText = "Editar Movimiento Fijo";

    const btnForm = document.querySelector('#mainForm button[type="submit"]');
    if (btnForm) {
        btnForm.innerText = "Actualizar Fijo";
        btnForm.style.backgroundColor = "#c084fc";
        btnForm.style.color = "#000";
    }
    goToTab(5);
};

window.exportarRecurrentes = function() {
    const recs = obtenerRecurrentes();
    if (!recs.length) {
        showToast("No hay fijos para exportar", "error");
        return;
    }
    const blob = new Blob([JSON.stringify(recs, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `bbva-fijos-${fechaLocalYYYYMMDD()}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    showToast("Copia de fijos descargada", "success");
};

window.importarRecurrentes = function(event) {
    const file = event.target.files && event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = e => {
        try {
            const datos = JSON.parse(e.target.result);
            if (!Array.isArray(datos)) throw new Error("Formato inválido");
            const validos = datos.filter(item => item && item.concepto && item.categoria && item.dia);
            if (!validos.length) throw new Error("Sin registros válidos");
            guardarRecurrentes(validos);
            actualizarInterfaz();
            showToast(`${validos.length} fijos restaurados`, "success");
        } catch {
            showToast("Archivo de copia inválido", "error");
        } finally {
            event.target.value = '';
        }
    };
    reader.readAsText(file);
};

function limpiarPagosFijosCaducados() {
    const recs = obtenerRecurrentes();
    const mesActual = fechaLocalYYYYMM();
    let cambio = false;

    const activos = recs.filter(p => {
        const duracion = Number(p.duracion);
        const inicio = String(p.mesInicio || '');
        if (String(p.duracion || 'indefinido') === 'indefinido' || !Number.isInteger(duracion) || duracion < 3 || duracion > 12 || !/^\d{4}-\d{2}$/.test(inicio) || !/^\d{4}-\d{2}$/.test(mesActual)) {
            return true;
        }
        const [anioInicio, mesInicio] = inicio.split('-').map(Number);
        const [anioActual, mesActualNum] = mesActual.split('-').map(Number);
        const mesesTranscurridos = (anioActual - anioInicio) * 12 + (mesActualNum - mesInicio);
        if (mesesTranscurridos >= duracion) { cambio = true; return false; }
        return true;
    });

    if (cambio) guardarRecurrentes(activos);
    return activos;
}

function movimientoCoincideRecurrente(movimiento, recurrente, fecha) {
    return normalizarTexto(movimiento.concepto) === normalizarTexto(recurrente.concepto) &&
           normalizarTexto(movimiento.categoria) === normalizarTexto(recurrente.categoria) &&
           movimiento.fecha === fecha;
}

function movimientoCoincideRecurrenteEnMes(movimiento, recurrente, mesSel) {
    return normalizarTexto(movimiento.concepto) === normalizarTexto(recurrente.concepto) &&
           normalizarTexto(movimiento.categoria) === normalizarTexto(recurrente.categoria) &&
           String(movimiento.fecha || '').startsWith(mesSel);
}

function renderRecurrentes(mesSel = fechaLocalYYYYMM()) {
    limpiarPagosFijosCaducados();
    const container = document.getElementById('listaRecurrentes');
    if (!container) return;

    const recs = obtenerRecurrentes().sort((a, b) => parseInt(a.dia, 10) - parseInt(b.dia, 10));

    // Calcular resumen superior de fijos activos en el mes seleccionado
    let totalIngFijos = 0;
    let totalGasFijos = 0;
    recs.forEach(p => {
        if (!pagoFijoDentroDelPlazo(p, mesSel)) return;
        const imp = Math.abs(numeroSeguro(p.importe));
        const cat = String(p.categoria || '');
        if (INGRESOS_LISTA.includes(cat) || cat.includes('Abono')) totalIngFijos += imp;
        else totalGasFijos += imp;
    });

    const elIng = document.getElementById('fijos-total-ingresos');
    const elGas = document.getElementById('fijos-total-gastos');
    const elBal = document.getElementById('fijos-total-balance');
    const fmt = (n) => state.ui.isPrivate
        ? "****€"
        : n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + "€";

    if (elIng) elIng.innerText = state.ui.isPrivate ? "****€" : `+${fmt(totalIngFijos)}`;
    if (elGas) elGas.innerText = state.ui.isPrivate ? "****€" : `-${fmt(totalGasFijos)}`;
    if (elBal) {
        const bal = totalIngFijos - totalGasFijos;
        elBal.innerText = state.ui.isPrivate ? "****€" : `${bal > 0 ? '+' : ''}${fmt(bal)}`;
        elBal.className = `text-xs font-black mt-0.5 ${bal >= 0 ? 'text-cyan-400' : 'text-rose-400'}`;
    }

    if (!recs.length) {
        container.innerHTML = `<div class="text-center py-10 opacity-30"><span class="text-4xl">🔄</span><p class="text-[10px] font-bold uppercase mt-2 tracking-widest">No hay movimientos fijos configurados</p></div>`;
        return;
    }

    container.innerHTML = recs.map(p => {
        const importe = state.ui.isPrivate
            ? "****€"
            : Math.abs(numeroSeguro(p.importe)).toLocaleString('de-DE', { minimumFractionDigits: 2 }) + "€";
        const categoria = String(p.categoria || '');
        const esIngreso = INGRESOS_LISTA.includes(categoria) || categoria.includes('Abono');
        const iconoContexto = esIngreso
            ? (categoria.includes('Abono') ? '🔄' : '💰')
            : (categoria.includes('Tarjeta') ? '💳' : categoria.includes('PayPal') ? '💙' : '🏦');

        const duracionPago = String(p.duracion || 'indefinido');
        let estadoPlazo;
        if (duracionPago === 'indefinido' || !p.mesInicio) {
            estadoPlazo = `<span class="inline-flex items-center gap-1 mt-1 text-[10px] font-bold text-emerald-300"><span>∞</span> Indefinido</span>`;
        } else {
            const inicioPlazo = String(p.mesInicio);
            const partesInicio = inicioPlazo.split('-').map(Number);
            const ahora = new Date();
            const totalMeses = Number(duracionPago);
            let cuotasRegistradas = 0;
            
            if (Number.isInteger(Number(p.dia)) && Number(p.dia) >= 1 && Number(p.dia) <= 31 && Number.isInteger(totalMeses) && totalMeses >= 3 && totalMeses <= 12) {
                const fechaInicio = new Date(partesInicio[0], partesInicio[1] - 1, 1);
                const primerMes = fechaInicio.getFullYear() * 12 + fechaInicio.getMonth();
                const mesActualIndice = ahora.getFullYear() * 12 + ahora.getMonth();
                const limiteMeses = Math.min(totalMeses, Math.max(0, mesActualIndice - primerMes + 1));
                for (let i = 0; i < limiteMeses; i++) {
                    const fechaCuota = new Date(partesInicio[0], partesInicio[1] - 1 + i, 1);
                    const mesCuota = `${fechaCuota.getFullYear()}-${String(fechaCuota.getMonth() + 1).padStart(2, '0')}`;
                    const fechaPago = obtenerFechaPagoMes(mesCuota, p.dia);
                    if (fechaPago <= fechaLocalYYYYMMDD(ahora) && state.data.appData.some(g => movimientoCoincideRecurrenteEnMes(g, p, mesCuota))) {
                        cuotasRegistradas++;
                    }
                }
            }
            const mesesRestantes = Math.max(0, totalMeses - cuotasRegistradas);
            estadoPlazo = `<span class="inline-flex items-center gap-1 mt-1 text-[10px] font-bold text-amber-300"><span>◷</span> ${mesesRestantes > 0 ? `${mesesRestantes} ${mesesRestantes === 1 ? 'mes pendiente' : 'meses pendientes'}` : 'Plazo cumplido'}</span>`;
        }

        const idSeguro = encodeURIComponent(String(p.id ?? ''));
        const barraColor = esIngreso ? 'from-emerald-400 to-cyan-500' : 'from-cyan-400 to-purple-600';
        const importeColor = esIngreso ? 'text-emerald-400' : 'text-[#fbbf24]';
        const signoImporte = state.ui.isPrivate ? '' : (esIngreso ? '+' : '-');

        return `
        <div class="relative overflow-hidden bg-white/5 border border-white/10 rounded-2xl p-4 flex items-center gap-4 mb-3 shadow-[0_8px_30px_rgb(0,0,0,0.3)] backdrop-blur-md transition-all">
            <div class="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b ${barraColor} rounded-l-2xl opacity-80"></div>
            <div class="flex flex-col items-center justify-center min-w-[3.5rem] h-14 bg-gradient-to-b from-white/10 to-transparent rounded-xl border border-white/5 shadow-inner">
                <span class="text-[8px] font-bold text-slate-400 uppercase tracking-widest mb-0.5">Día</span>
                <span class="text-xl font-black text-white leading-none">${escapeHtml(p.dia)}</span>
            </div>
            <div class="flex-1 min-w-0">
                <p class="font-black text-white text-[15px] truncate">${escapeHtml(p.concepto)}</p>
                <div class="flex items-center gap-1.5 mt-1">
                    <span class="text-[10px]">${iconoContexto}</span>
                    <p class="text-[9px] font-bold text-cyan-400 uppercase tracking-widest truncate">${escapeHtml(categoria)}</p>
                </div>
                ${estadoPlazo}
            </div>
            <div class="flex flex-col items-end justify-center gap-2">
                <p class="font-black ${importeColor} text-lg">${signoImporte}${importe}</p>
                <div class="flex items-center gap-1.5">
                    <button onclick="prepararEdicionRecurrente(decodeURIComponent('${idSeguro}'))" class="flex items-center justify-center w-8 h-8 rounded-full bg-cyan-400/10 border border-cyan-400/25" title="Editar fijo">
                        <span class="text-xs">✏️</span>
                    </button>
                    <button onclick="borrarRecurrente(decodeURIComponent('${idSeguro}'))" class="flex items-center justify-center w-8 h-8 rounded-full bg-rose-500/10 border border-rose-500/20" title="Eliminar fijo">
                        <span class="text-xs">🗑️</span>
                    </button>
                </div>
            </div>
        </div>`;
    }).join('');
}

function pagoFijoDentroDelPlazo(p, mesActual) {
    const duracion = String(p.duracion || 'indefinido');
    if (duracion === 'indefinido' || !p.mesInicio) return true;
    const inicio = String(p.mesInicio);
    if (!/^\d{4}-\d{2}$/.test(inicio) || !/^\d{4}-\d{2}$/.test(mesActual)) return true;
    const [anioInicio, mesInicio] = inicio.split('-').map(Number);
    const [anioActual, mesActualNum] = mesActual.split('-').map(Number);
    const mesesTranscurridos = (anioActual - anioInicio) * 12 + (mesActualNum - mesInicio);
    const meses = Number(duracion);
    if (!Number.isInteger(meses) || meses < 3 || meses > 12) return true;
    return mesesTranscurridos >= 0 && mesesTranscurridos < meses;
}

async function procesarPagosAutomaticos() {
    limpiarPagosFijosCaducados();
    const hoy = new Date();
    const mesActual = fechaLocalYYYYMM(hoy);
    if (state.data.pagosProcesadosMes === mesActual) return;

    const recs = obtenerRecurrentes();
    const pagosPendientes = recs.filter(p => {
        if (!pagoFijoDentroDelPlazo(p, mesActual)) return false;
        const dia = parseInt(p.dia, 10);
        if (!Number.isFinite(dia) || dia < 1 || dia > 31) return false;
        const fechaPago = obtenerFechaPagoMes(mesActual, dia);
        const diaEfectivo = parseInt(fechaPago.split('-')[2], 10);
        const yaExiste = state.data.appData.some(g => movimientoCoincideRecurrenteEnMes(g, p, mesActual));
        return (hoy.getDate() >= diaEfectivo && !yaExiste);
    });

    if (!pagosPendientes.length) {
        state.data.pagosProcesadosMes = mesActual;
        return;
    }

    try {
        for (const p of pagosPendientes) {
            const fechaPago = obtenerFechaPagoMes(mesActual, p.dia);
            const res = await apiFetch(CONFIG.API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ concepto: p.concepto, importe: Math.abs(numeroSeguro(p.importe)), categoria: p.categoria, fecha: fechaPago })
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
        }
        state.data.pagosProcesadosMes = mesActual;
        await renderApp();
    } catch(e) { console.error("Error en pagos automáticos:", e); }
}

window.borrarRecurrente = function(id) {
    if (!confirm("¿Eliminar este movimiento de la lista de fijos?")) return;
    let recs = obtenerRecurrentes().filter(p => String(p.id) !== String(id));
    guardarRecurrentes(recs);
    actualizarInterfaz();
    showToast("Movimiento fijo eliminado", "success");
};

/* =========================================================
   13. EDICIÓN / BORRADO DE MOVIMIENTOS
========================================================= */
window.prepararEdicion = function(id) {
    const gasto = state.data.appData.find(g => String(g._id) === String(id));
    if (!gasto) return;

    const conceptoOriginal = String(gasto.concepto || '');
    const esExtra = esGastoExtraordinario(conceptoOriginal);
    const conceptoLimpio = conceptoOriginal.replace(/\s*#extra\b/gi, '').trim();

    document.getElementById('in-concepto').value = conceptoLimpio;
    document.getElementById('in-importe').value = Math.abs(numeroSeguro(gasto.importe));
    document.getElementById('in-categoria').value = gasto.categoria || '';
    document.getElementById('in-fecha').value = gasto.fecha || fechaLocalYYYYMMDD();

    const checkExtra = document.getElementById('check-extra');
    if (checkExtra) checkExtra.checked = esExtra;
    
    state.ui.editMode = true;
    state.ui.editId = id;
    state.ui.editRecId = null;

    const checkEl = document.getElementById('check-recurrente');
    const recExistente = obtenerRecurrentes().find(p => claveRecurrente(p.concepto, p.categoria) === claveRecurrente(conceptoOriginal, gasto.categoria));
    state.ui.editWasRecurrent = Boolean(recExistente);
    if (checkEl) {
        const optPuntual = checkEl.querySelector('option[value="no"]');
        if (optPuntual) optPuntual.disabled = false;
        checkEl.value = recExistente ? (recExistente.duracion || 'indefinido') : 'no';
    }

    const tituloForm = document.getElementById('form-operar-titulo');
    if (tituloForm) tituloForm.innerText = "Editar Movimiento";

    const btnForm = document.querySelector('#mainForm button[type="submit"]');
    if (btnForm) {
        btnForm.innerText = "Guardar Cambios";
        btnForm.style.backgroundColor = "#fbbf24";
        btnForm.style.color = "#000";
    }
    goToTab(5);
};

window.deleteGasto = async function(id) {
    if (!confirm("¿Eliminar este movimiento?")) return;
    try {
        const res = await apiFetch(`${CONFIG.API_URL}/${encodeURIComponent(id)}`, { method: 'DELETE' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        
        state.data.appData = state.data.appData.filter(g => String(g._id) !== String(id));
        localStorage.setItem('appData_cache', JSON.stringify(state.data.appData));
        actualizarInterfaz();
        showToast("Movimiento eliminado", "success");
    } catch(error) { showToast("No se pudo eliminar el movimiento", "error"); }
};

/* =========================================================
   14. FORMULARIO PRINCIPAL (Alta, Edición Mov y Edición Fijo)
========================================================= */
document.getElementById('mainForm').addEventListener('submit', async e => {
    e.preventDefault();
    const btnForm = document.querySelector('#mainForm button[type="submit"]');
    const textoOriginal = btnForm.innerText;
    
    btnForm.disabled = true;
    btnForm.innerText = "Guardando...";
    btnForm.style.opacity = "0.5";

    let concepto = document.getElementById('in-concepto').value.trim();
    const checkExtra = document.getElementById('check-extra');
    if (checkExtra && checkExtra.checked && concepto && !esGastoExtraordinario(concepto)) {
        concepto = `${concepto} #extra`;
    }

    const importe = Math.abs(numeroSeguro(document.getElementById('in-importe').value));
    const categoria = document.getElementById('in-categoria').value;
    const fecha = document.getElementById('in-fecha').value;
    const modoRecurrente = document.getElementById('check-recurrente').value;
    const esRecurrente = modoRecurrente !== 'no';

    if (!concepto || !fecha || importe <= 0) {
        showToast("Revisa los datos", "error");
        btnForm.disabled = false; btnForm.innerText = textoOriginal; btnForm.style.opacity = "1";
        return;
    }

    // MODO EDICIÓN EXCLUSIVA DE FIJO (Sin duplicar movimiento en servidor)
    if (state.ui.editRecId) {
        let recs = obtenerRecurrentes();
        const idx = recs.findIndex(r => String(r.id) === String(state.ui.editRecId));
        if (idx !== -1) {
            const diaPago = fecha.split('-')[2];
            const duracionFinal = modoRecurrente === 'no' ? 'indefinido' : modoRecurrente;
            recs[idx] = {
                ...recs[idx],
                concepto,
                importe: importe.toString(),
                categoria,
                dia: diaPago,
                duracion: duracionFinal,
                mesInicio: duracionFinal === 'indefinido' ? null : (recs[idx].mesInicio || fecha.slice(0, 7))
            };
            guardarRecurrentes(recs);
        }

        state.ui.editRecId = null;
        resetearFormularioOperar();
        btnForm.disabled = false;
        btnForm.style.opacity = "1";
        actualizarInterfaz();
        showToast("Movimiento fijo actualizado", "success");
        goToTab(2);
        return;
    }

    let conceptoAnterior = concepto, categoriaAnterior = categoria;
    if (state.ui.editMode && state.ui.editId) {
        const gastoAntiguo = state.data.appData.find(g => String(g._id) === String(state.ui.editId));
        if (gastoAntiguo) { conceptoAnterior = gastoAntiguo.concepto; categoriaAnterior = gastoAntiguo.categoria; }
    }

    const payload = { concepto, importe, categoria, fecha };

    try {
        if (state.ui.editMode && state.ui.editId) {
            const putRes = await apiFetch(`${CONFIG.API_URL}/${encodeURIComponent(state.ui.editId)}`, {
                method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
            });
            if (!putRes.ok) throw new Error(`HTTP ${putRes.status}`);
            showToast("Operación actualizada", "success");
        } else {
            const postRes = await apiFetch(CONFIG.API_URL, {
                method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
            });
            if (!postRes.ok) throw new Error(`HTTP ${postRes.status}`);
            showToast("Operación registrada", "success");
        }

        let recs = obtenerRecurrentes();
        if (esRecurrente) {
            const diaPago = fecha.split('-')[2];
            const indexRec = recs.findIndex(r => claveRecurrente(r.concepto, r.categoria) === claveRecurrente(conceptoAnterior, categoriaAnterior));
            
            if (indexRec !== -1) {
                recs[indexRec] = { ...recs[indexRec], concepto, dia: diaPago, importe: importe.toString(), categoria, duracion: modoRecurrente, mesInicio: modoRecurrente === 'indefinido' ? null : (recs[indexRec].mesInicio || fecha.slice(0, 7)) };
            } else {
                recs.push({ id: Date.now(), concepto, importe: importe.toString(), categoria, dia: diaPago, duracion: modoRecurrente, mesInicio: modoRecurrente === 'indefinido' ? null : fecha.slice(0, 7) });
            }
        } else if (!esRecurrente && state.ui.editMode && state.ui.editWasRecurrent) {
            recs = recs.filter(r => claveRecurrente(r.concepto, r.categoria) !== claveRecurrente(conceptoAnterior, categoriaAnterior));
        }

        guardarRecurrentes(recs);
        state.ui.editMode = false;
        state.ui.editId = null;
        state.ui.editWasRecurrent = false;
        resetearFormularioOperar();
        
        await renderApp();

        btnForm.disabled = false;
        btnForm.style.opacity = "1";
        goToTab(0);

    } catch(error) {
        showToast(error.message || "Error de conexión", "error");
        btnForm.disabled = false; btnForm.innerText = textoOriginal; btnForm.style.opacity = "1";
    }
});

/* =========================================================
   15. GRÁFICOS DE TARJETAS
========================================================= */
window.flipCard = function(el, categoria) {
    const inner = el.querySelector('.card-inner');
    if (!inner) return;
    inner.classList.toggle('is-flipped');
    
    if (!inner.classList.contains('is-flipped')) return;
    renderCardChart(categoria);
    
    setTimeout(() => {
        if (state.data.cardCharts[categoria]) {
            state.data.cardCharts[categoria].resize();
            state.data.cardCharts[categoria].update();
        }
    }, 650);
};

function renderCardChart(cat) {
    const canvasId = cat === CATEGORIAS.EXPLORA ? 'chart-Explora' : 'chart-Aqua';
    const catAbono = cat === CATEGORIAS.EXPLORA ? CATEGORIAS.ABONO_EXPLORA : CATEGORIAS.ABONO_AQUA;
    const canvasEl = document.getElementById(canvasId);
    if (!canvasEl) return;
    const ctx = canvasEl.getContext('2d');
    if (!ctx) return;

    const labelsRaw = [];
    const hoy = new Date();
    for (let i = 3; i >= 0; i--) {
        const d = new Date(hoy.getFullYear(), hoy.getMonth() - i, 1);
        labelsRaw.push(fechaLocalYYYYMM(d));
    }

    const datos = labelsRaw.map(mes => {
        const gastos = state.data.appData
            .filter(g => g.categoria === cat && String(g.fecha || '').startsWith(mes))
            .reduce((sum, g) => sum + Math.abs(numeroSeguro(g.importe)), 0);
        const abonos = state.data.appData
            .filter(g => g.categoria === catAbono && String(g.fecha || '').startsWith(mes))
            .reduce((sum, g) => sum + Math.abs(numeroSeguro(g.importe)), 0);
        return Math.max(0, gastos - abonos);
    });

    const nombresMeses = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
    const etiquetasFinales = labelsRaw.map(m => nombresMeses[Number(m.split('-')[1]) - 1]);

    if (state.data.cardCharts[cat]) {
        state.data.cardCharts[cat].destroy();
        delete state.data.cardCharts[cat];
    }

    state.data.cardCharts[cat] = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: etiquetasFinales,
            datasets: [{
                data: datos,
                backgroundColor: cat === CATEGORIAS.EXPLORA ? 'rgba(255,255,255,0.9)' : '#00e5ff',
                borderRadius: 4, barThickness: 14
            }]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            layout: { padding: { top: 20 } },
            plugins: {
                legend: { display: false },
                tooltip: {
                    enabled: true,
                    callbacks: {
                        label: ctx => state.ui.isPrivate
                            ? "****€"
                            : Number(ctx.raw).toLocaleString('de-DE', { minimumFractionDigits: 2 }) + "€"
                    }
                }
            },
            scales: {
                y: { display: false, beginAtZero: true },
                x: { ticks: { color: 'rgba(255,255,255,0.8)', font: { size: 9, weight: 'bold' } }, grid: { display: false } }
            },
            animation: {
                onComplete: function() {
                    const chartInstance = this;
                    const ctx = chartInstance.ctx;
                    ctx.save();
                    ctx.font = 'bold 9px Inter';
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'bottom';
                    ctx.fillStyle = 'rgba(255,255,255,0.9)';
                    
                    this.data.datasets.forEach((dataset, i) => {
                        const meta = chartInstance.getDatasetMeta(i);
                        meta.data.forEach((bar, index) => {
                            const data = dataset.data[index];
                            if (data > 0) {
                                const texto = state.ui.isPrivate ? '****' : Math.round(data) + '€';
                                ctx.fillText(texto, bar.x, bar.y - 4);
                            }
                        });
                    });
                    ctx.restore();
                }
            }
        }
    });
}
