const express = require('express');
const mongoose = require('mongoose');
const crypto = require('crypto');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

const MONGO_URI = process.env.MONGO_URI;
const APP_PIN = process.env.APP_PIN;
const SESSION_SECRET = process.env.SESSION_SECRET;

if (!MONGO_URI) {
    console.error('❌ ERROR: Falta la variable MONGO_URI');
    process.exit(1);
}

if (!APP_PIN) {
    console.error('❌ ERROR: Falta la variable APP_PIN');
    process.exit(1);
}

if (!SESSION_SECRET || SESSION_SECRET.length < 32) {
    console.error('❌ ERROR: SESSION_SECRET debe existir y tener al menos 32 caracteres');
    process.exit(1);
}

// Render funciona detrás de un proxy HTTPS
app.set('trust proxy', 1);

app.use(express.json({ limit: '100kb' }));
app.use(express.static(__dirname));

// =========================
// MONGODB
// =========================

mongoose.connect(MONGO_URI)
    .then(() => console.log('✅ DB Conectada correctamente'))
    .catch(err => console.error('❌ Error conectando a MongoDB:', err.message));

mongoose.connection.on('error', err => {
    console.error('❌ Error de MongoDB:', err.message);
});

mongoose.connection.on('disconnected', () => {
    console.warn('⚠️ MongoDB desconectada');
});

mongoose.connection.on('reconnected', () => {
    console.log('🔄 MongoDB reconectada');
});

// =========================
// MODELO GASTOS
// =========================

const gastoSchema = new mongoose.Schema({
    concepto: {
        type: String,
        required: true,
        trim: true,
        maxlength: 200
    },
    importe: {
        type: Number,
        required: true,
        finite: true
    },
    categoria: {
        type: String,
        required: true,
        trim: true,
        maxlength: 100
    },
    fecha: {
        type: String,
        required: true,
        trim: true
    }
}, {
    timestamps: true
});

const Gasto = mongoose.model('Gasto', gastoSchema);

// =========================
// SESIONES
// =========================

const COOKIE_NAME = 'bbva_session';
const SESSION_DURATION = 7 * 24 * 60 * 60 * 1000;

function obtenerCookie(req, nombre) {
    const header = req.headers.cookie;

    if (!header) return null;

    for (const cookie of header.split(';')) {
        const partes = cookie.trim().split('=');
        const clave = partes.shift();

        if (clave === nombre) {
            return decodeURIComponent(partes.join('='));
        }
    }

    return null;
}

function firmarSesion(valor) {
    return crypto
        .createHmac('sha256', SESSION_SECRET)
        .update(valor)
        .digest('hex');
}

function crearTokenSesion() {
    const expira = Date.now() + SESSION_DURATION;

    const nonce = crypto
        .randomBytes(32)
        .toString('hex');

    const contenido = `${expira}.${nonce}`;

    const firma = firmarSesion(contenido);

    return `${contenido}.${firma}`;
}

function validarTokenSesion(token) {

    if (!token || typeof token !== 'string') {
        return false;
    }

    const partes = token.split('.');

    if (partes.length !== 3) {
        return false;
    }

    const [expiraTexto, nonce, firma] = partes;

    if (!expiraTexto || !nonce || !firma) {
        return false;
    }

    const expira = Number(expiraTexto);

    if (!Number.isFinite(expira)) {
        return false;
    }

    if (Date.now() > expira) {
        return false;
    }

    const contenido = `${expiraTexto}.${nonce}`;

    const firmaEsperada = firmarSesion(contenido);

    if (firma.length !== firmaEsperada.length) {
        return false;
    }

    try {

        return crypto.timingSafeEqual(
            Buffer.from(firma, 'utf8'),
            Buffer.from(firmaEsperada, 'utf8')
        );

    } catch {

        return false;
    }
}

function establecerCookieSesion(req, res, token) {

    const esHttps =
        req.secure ||
        req.headers['x-forwarded-proto'] === 'https';

    const secure = esHttps ? '; Secure' : '';

    res.setHeader(
        'Set-Cookie',
        `${COOKIE_NAME}=${encodeURIComponent(token)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${Math.floor(SESSION_DURATION / 1000)}${secure}`
    );
}

function eliminarCookieSesion(req, res) {

    const esHttps =
        req.secure ||
        req.headers['x-forwarded-proto'] === 'https';

    const secure = esHttps ? '; Secure' : '';

    res.setHeader(
        'Set-Cookie',
        `${COOKIE_NAME}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0${secure}`
    );
}

// =========================
// LOGIN
// =========================

app.post('/api/login', (req, res) => {

    try {

        const pinRecibido = String(
            req.body?.pin ?? ''
        );

        if (!pinRecibido) {

            return res.status(400).json({
                error: 'PIN requerido'
            });

        }

        if (pinRecibido !== String(APP_PIN)) {

            console.log('❌ Intento de login incorrecto');

            return res.status(401).json({
                error: 'PIN incorrecto'
            });

        }

        const token = crearTokenSesion();

        establecerCookieSesion(
            req,
            res,
            token
        );

        console.log('✅ Login correcto');

        res.json({
            ok: true
        });

    } catch (error) {

        console.error(
            '❌ Error POST /api/login:',
            error
        );

        res.status(500).json({
            error: 'No se pudo iniciar sesión'
        });
    }
});

// =========================
// LOGOUT
// =========================

app.post('/api/logout', (req, res) => {

    eliminarCookieSesion(req, res);

    console.log('👋 Sesión cerrada');

    res.json({
        ok: true
    });
});

// =========================
// PROTEGER API
// =========================

app.use('/api', (req, res, next) => {

    if (
        req.path === '/login' ||
        req.path === '/logout'
    ) {
        return next();
    }

    const token = obtenerCookie(
        req,
        COOKIE_NAME
    );

    if (!validarTokenSesion(token)) {

        console.log(
            `❌ Sesión no válida (${req.method} ${req.path})`
        );

        return res.status(401).json({
            error: 'Sesión no válida o expirada'
        });
    }

    next();
});

// =========================
// GET GASTOS
// =========================

app.get('/api/gastos', async (req, res) => {

    try {

        const gastos = await Gasto
            .find()
            .sort({
                fecha: -1,
                createdAt: -1
            });

        res.json(gastos);

    } catch (error) {

        console.error(
            '❌ Error GET /api/gastos:',
            error
        );

        res.status(500).json({
            error: 'Error al obtener los gastos'
        });
    }
});

// =========================
// POST GASTO
// =========================

app.post('/api/gastos', async (req, res) => {

    try {

        const {
            concepto,
            importe,
            categoria,
            fecha
        } = req.body;

        if (
            typeof concepto !== 'string' ||
            !concepto.trim() ||
            concepto.length > 200
        ) {

            return res.status(400).json({
                error: 'Concepto no válido'
            });
        }

        const importeNumero = Number(importe);

        if (!Number.isFinite(importeNumero)) {

            return res.status(400).json({
                error: 'Importe no válido'
            });
        }

        if (
            typeof categoria !== 'string' ||
            !categoria.trim() ||
            categoria.length > 100
        ) {

            return res.status(400).json({
                error: 'Categoría no válida'
            });
        }

        if (
            typeof fecha !== 'string' ||
            !fecha.trim()
        ) {

            return res.status(400).json({
                error: 'Fecha no válida'
            });
        }

        const gasto = await Gasto.create({

            concepto: concepto.trim(),

            importe: importeNumero,

            categoria: categoria.trim(),

            fecha: fecha.trim()

        });

        res.status(201).json(gasto);

    } catch (error) {

        console.error(
            '❌ Error POST /api/gastos:',
            error
        );

        res.status(500).json({
            error: 'Error al crear el gasto'
        });
    }
});

// =========================
// PUT GASTO
// =========================

app.put('/api/gastos/:id', async (req, res) => {

    try {

        const { id } = req.params;

        const {
            concepto,
            importe,
            categoria,
            fecha
        } = req.body;

        if (!mongoose.Types.ObjectId.isValid(id)) {

            return res.status(400).json({
                error: 'ID no válido'
            });
        }

        if (
            typeof concepto !== 'string' ||
            !concepto.trim() ||
            concepto.length > 200
        ) {

            return res.status(400).json({
                error: 'Concepto no válido'
            });
        }

        const importeNumero = Number(importe);

        if (!Number.isFinite(importeNumero)) {

            return res.status(400).json({
                error: 'Importe no válido'
            });
        }

        if (
            typeof categoria !== 'string' ||
            !categoria.trim() ||
            categoria.length > 100
        ) {

            return res.status(400).json({
                error: 'Categoría no válida'
            });
        }

        if (
            typeof fecha !== 'string' ||
            !fecha.trim()
        ) {

            return res.status(400).json({
                error: 'Fecha no válida'
            });
        }

        const gastoActualizado =
            await Gasto.findByIdAndUpdate(

                id,

                {
                    concepto: concepto.trim(),

                    importe: importeNumero,

                    categoria: categoria.trim(),

                    fecha: fecha.trim()
                },

                {
                    new: true,
                    runValidators: true
                }
            );

        if (!gastoActualizado) {

            return res.status(404).json({
                error: 'Gasto no encontrado'
            });
        }

        res.json(gastoActualizado);

    } catch (error) {

        console.error(
            '❌ Error PUT /api/gastos/:id:',
            error
        );

        res.status(500).json({
            error: 'Error al actualizar el gasto'
        });
    }
});

// =========================
// DELETE GASTO
// =========================

app.delete('/api/gastos/:id', async (req, res) => {

    try {

        const { id } = req.params;

        if (!mongoose.Types.ObjectId.isValid(id)) {

            return res.status(400).json({
                error: 'ID no válido'
            });
        }

        const gastoEliminado =
            await Gasto.findByIdAndDelete(id);

        if (!gastoEliminado) {

            return res.status(404).json({
                error: 'Gasto no encontrado'
            });
        }

        res.json({
            ok: true,
            id
        });

    } catch (error) {

        console.error(
            '❌ Error DELETE /api/gastos/:id:',
            error
        );

        res.status(500).json({
            error: 'Error al eliminar el gasto'
        });
    }
});

// =========================
// WEB
// =========================

app.get('/', (req, res) => {

    res.sendFile(
        path.join(__dirname, 'index.html')
    );
});

// =========================
// API 404
// =========================

app.use('/api', (req, res) => {

    res.status(404).json({
        error: 'Ruta API no encontrada'
    });
});

// =========================
// ERROR GLOBAL
// =========================

app.use((error, req, res, next) => {

    console.error(
        '❌ Error global:',
        error
    );

    res.status(500).json({
        error: 'Error interno del servidor'
    });
});

// =========================
// ARRANQUE
// =========================

app.listen(PORT, () => {

    console.log(
        `🚀 Servidor escuchando en puerto ${PORT}`
    );

});
