const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const webpush = require('web-push');
const cron = require('node-cron');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// 1. CONFIGURACIÓN NOTIFICACIONES (VAPID)
const vapidKeys = {
    publicKey: 'BJm_Y2M9h_S-p1nS0O-pL9p6-E5Xz7y7XvI3p2k8j4m5n6o7p8q9r0s1t2u3v4w5x6y7z8a9b0c1d2e3f4g5h6',
    privateKey: 'w2R_Y9k8v7j6m5n4b3v2c1x0z9l8k7j6h5g4f3d2s1a'
};

webpush.setVapidDetails(
    'mailto:tu@correo.com',
    vapidKeys.publicKey,
    vapidKeys.privateKey
);

// 2. MIDDLEWARES
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

// 3. CONEXIÓN MONGODB
const MONGO_URI = 'mongodb+srv://Josan77:Yakonala@cluster0.npzvokr.mongodb.net/?appName=Cluster0'; 

mongoose.connect(MONGO_URI)
  .then(() => console.log('✅ ¡CONECTADO A MONGODB!'))
  .catch(err => console.error('❌ ERROR MONGODB:', err));

const GastoSchema = new mongoose.Schema({
    concepto: String,
    importe: Number,
    categoria: String,
    pagado: Boolean,
    fecha: String
});

const Gasto = mongoose.model('Gasto', GastoSchema);

// 4. ALMACÉN DE SUSCRIPCIONES
let suscripciones = []; // Aquí se guardan los móviles que aceptan notificaciones

// 5. RUTAS API
app.get('/api/gastos', async (req, res) => {
    try {
        const gastos = await Gasto.find();
        res.json(gastos);
    } catch (error) {
        res.status(500).json({ error: 'Error al obtener datos' });
    }
});

app.post('/api/gastos', async (req, res) => {
    try {
        const nuevoGasto = new Gasto(req.body);
        await nuevoGasto.save();

        // LÓGICA SALDO BAJO: Si el nuevo gasto deja el saldo por debajo de 100€
        const todos = await Gasto.find();
        let saldo = 0;
        const categIngresos = ["Sueldo", "Otros Ingresos"];
        
        todos.forEach(g => {
            if (categIngresos.includes(g.categoria)) saldo += g.importe;
            else saldo -= g.importe;
        });

        if (saldo < 100) {
            enviarAviso("⚠️ Saldo Bajo", `Tu saldo ha bajado a ${saldo.toFixed(2)}€. ¡Cuidado!`);
        }

        res.status(201).json(nuevoGasto);
    } catch (error) {
        res.status(500).json({ error: 'Error al guardar' });
    }
});

app.delete('/api/gastos/:id', async (req, res) => {
    try {
        await Gasto.findByIdAndDelete(req.params.id);
        res.json({ mensaje: "Gasto eliminado correctamente" });
    } catch (error) {
        res.status(500).json({ error: "Error al borrar" });
    }
});

// 6. RUTAS NOTIFICACIONES
app.post('/api/subscribe', (req, res) => {
    const subscription = req.body;
    // Evitar duplicados
    if (!suscripciones.find(s => s.endpoint === subscription.endpoint)) {
        suscripciones.push(subscription);
    }
    res.status(201).json({ mensaje: "Suscrito con éxito" });
});

function enviarAviso(titulo, texto) {
    const payload = JSON.stringify({ title: titulo, body: texto });
    suscripciones.forEach(sub => {
        webpush.sendNotification(sub, payload).catch(err => {
            console.error("Suscripción antigua eliminada");
            suscripciones = suscripciones.filter(s => s.endpoint !== sub.endpoint);
        });
    });
}

// 7. PROGRAMACIÓN DE AVISOS (CRON)
// Avisar cada mañana a las 09:00
cron.schedule('0 9 * * *', async () => {
    console.log('Enviando recordatorio matutino...');
    enviarAviso("🔔 BBVA Premium", "Buenos días. Revisa tus pagos programados para hoy.");
});

// 8. SERVIR APP Y ARRANCAR
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Servidor corriendo en puerto ${PORT}`);
});
