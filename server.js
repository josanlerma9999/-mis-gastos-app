const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// ============================================================
// CONFIGURACIÓN
// ============================================================

const MONGO_URI = process.env.MONGO_URI;
const MI_LLAVE_SECRETA = process.env.MI_LLAVE_SECRETA;

// Comprobar variables imprescindibles al arrancar
if (!MONGO_URI) {
    console.error('❌ ERROR: Falta la variable de entorno MONGO_URI');
    process.exit(1);
}

if (!MI_LLAVE_SECRETA) {
    console.error('❌ ERROR: Falta la variable de entorno MI_LLAVE_SECRETA');
    process.exit(1);
}

// ============================================================
// MIDDLEWARES
// ============================================================

// CORS
app.use(cors({
    origin: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'x-api-key']
}));

// JSON
app.use(express.json({ limit: '100kb' }));

// Archivos estáticos
app.use(express.static(__dirname));

// ============================================================
// CONEXIÓN A MONGODB
// ============================================================

mongoose.connect(MONGO_URI)
    .then(() => {
        console.log('✅ DB Conectada correctamente');
    })
    .catch((err) => {
        console.error('❌ Error conectando a MongoDB:', err.message);
    });

// Eventos de conexión para detectar problemas posteriores
mongoose.connection.on('error', (err) => {
    console.error('❌ Error de MongoDB:', err.message);
});

mongoose.connection.on('disconnected', () => {
    console.warn('⚠️ MongoDB desconectada');
});

mongoose.connection.on('reconnected', () => {
    console.log('🔄 MongoDB reconectada');
});

// ============================================================
// MODELO
// ============================================================

const gastoSchema = new mongoose.Schema(
    {
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
    },
    {
        timestamps: true
    }
);

const Gasto = mongoose.model('Gasto', gastoSchema);

// ============================================================
// PORTERO / API KEY
// ============================================================

app.use('/api', (req, res, next) => {
    const llaveEnviada = req.headers['x-api-key'];

    if (!llaveEnviada) {
        console.log(`❌ Acceso bloqueado: falta API Key (${req.method} ${req.path})`);

        return res.status(401).json({
            error: 'Falta la API Key'
        });
    }

    if (llaveEnviada !== MI_LLAVE_SECRETA) {
        console.log(`❌ Acceso bloqueado: API Key incorrecta (${req.method} ${req.path})`);

        return res.status(403).json({
            error: 'API Key no válida'
        });
    }

    next();
});

// ============================================================
// GET - OBTENER TODOS LOS GASTOS
// ============================================================

app.get('/api/gastos', async (req, res) => {
    try {
        const gastos = await Gasto.find()
            .sort({ fecha: -1, createdAt: -1 });

        res.json(gastos);

    } catch (e) {
        console.error('❌ Error GET /api/gastos:', e);

        res.status(500).json({
            error: 'No se pudieron obtener los gastos'
        });
    }
});

// ============================================================
// POST - CREAR GASTO
// ============================================================

app.post('/api/gastos', async (req, res) => {
    try {
        const { concepto, importe, categoria, fecha } = req.body;

        // Validaciones básicas
        if (
            typeof concepto !== 'string' ||
            !concepto.trim()
        ) {
            return res.status(400).json({
                error: 'El concepto es obligatorio'
            });
        }

        if (
            importe === undefined ||
            importe === null ||
            importe === '' ||
            !Number.isFinite(Number(importe))
        ) {
            return res.status(400).json({
                error: 'El importe debe ser un número válido'
            });
        }

        if (
            typeof categoria !== 'string' ||
            !categoria.trim()
        ) {
            return res.status(400).json({
                error: 'La categoría es obligatoria'
            });
        }

        if (
            typeof fecha !== 'string' ||
            !fecha.trim()
        ) {
            return res.status(400).json({
                error: 'La fecha es obligatoria'
            });
        }

        const nuevoGasto = new Gasto({
            concepto: concepto.trim(),
            importe: Number(importe),
            categoria: categoria.trim(),
            fecha: fecha.trim()
        });

        await nuevoGasto.save();

        console.log(`✅ Gasto creado: ${nuevoGasto._id}`);

        res.status(201).json(nuevoGasto);

    } catch (e) {
        console.error('❌ Error POST /api/gastos:', e);

        res.status(500).json({
            error: 'No se pudo crear el gasto'
        });
    }
});

// ============================================================
// PUT - EDITAR GASTO
// ============================================================

app.put('/api/gastos/:id', async (req, res) => {
    try {
        const { id } = req.params;

        // Comprobar que el ID de MongoDB es válido
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({
                error: 'ID de gasto no válido'
            });
        }

        const { concepto, importe, categoria, fecha } = req.body;

        // Validaciones
        if (
            typeof concepto !== 'string' ||
            !concepto.trim()
        ) {
            return res.status(400).json({
                error: 'El concepto es obligatorio'
            });
        }

        if (
            importe === undefined ||
            importe === null ||
            importe === '' ||
            !Number.isFinite(Number(importe))
        ) {
            return res.status(400).json({
                error: 'El importe debe ser un número válido'
            });
        }

        if (
            typeof categoria !== 'string' ||
            !categoria.trim()
        ) {
            return res.status(400).json({
                error: 'La categoría es obligatoria'
            });
        }

        if (
            typeof fecha !== 'string' ||
            !fecha.trim()
        ) {
            return res.status(400).json({
                error: 'La fecha es obligatoria'
            });
        }

        const gastoActualizado = await Gasto.findByIdAndUpdate(
            id,
            {
                concepto: concepto.trim(),
                importe: Number(importe),
                categoria: categoria.trim(),
                fecha: fecha.trim()
            },
            {
                new: true,
                runValidators: true
            }
        );

        // No existe
        if (!gastoActualizado) {
            return res.status(404).json({
                error: 'Gasto no encontrado'
            });
        }

        console.log(`✏️ Gasto actualizado: ${id}`);

        res.json(gastoActualizado);

    } catch (e) {
        console.error('❌ Error PUT /api/gastos/:id:', e);

        res.status(500).json({
            error: 'No se pudo actualizar el gasto'
        });
    }
});

// ============================================================
// DELETE - ELIMINAR GASTO
// ============================================================

app.delete('/api/gastos/:id', async (req, res) => {
    try {
        const { id } = req.params;

        // Comprobar ID
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({
                error: 'ID de gasto no válido'
            });
        }

        const gastoEliminado = await Gasto.findByIdAndDelete(id);

        // No existe
        if (!gastoEliminado) {
            return res.status(404).json({
                error: 'Gasto no encontrado'
            });
        }

        console.log(`🗑️ Gasto eliminado: ${id}`);

        res.json({
            message: 'Gasto eliminado correctamente',
            id: id
        });

    } catch (e) {
        console.error('❌ Error DELETE /api/gastos/:id:', e);

        res.status(500).json({
            error: 'No se pudo eliminar el gasto'
        });
    }
});

// ============================================================
// RUTA PRINCIPAL - CARGAR LA WEB
// ============================================================

// Esta ruta NO pasa por el portero porque el portero está
// limitado a /api
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// ============================================================
// 404 PARA API
// ============================================================

app.use('/api', (req, res) => {
    res.status(404).json({
        error: 'Ruta API no encontrada'
    });
});

// ============================================================
// MANEJADOR GLOBAL DE ERRORES
// ============================================================

app.use((err, req, res, next) => {
    console.error('❌ Error no controlado:', err);

    if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
        return res.status(400).json({
            error: 'JSON inválido'
        });
    }

    res.status(500).json({
        error: 'Error interno del servidor'
    });
});

// ============================================================
// ARRANQUE
// ============================================================

app.listen(PORT, () => {
    console.log(`🚀 Servidor iniciado en puerto ${PORT}`);
});
