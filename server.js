const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const webpush = require('web-push');
const cron = require('node-cron');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// 1. CONFIGURACIÓN VAPID
const vapidKeys = {
    publicKey: 'BJm_Y2M9h_S-p1nS0O-pL9p6-E5Xz7y7XvI3p2k8j4m5n6o7p8q9r0s1t2u3v4w5x6y7z8a9b0c1d2e3f4g5h6',
    privateKey: 'w2R_Y9k8v7j6m5n4b3v2c1x0z9l8k7j6h5g4f3d2s1a'
};

webpush.setVapidDetails('mailto:test@test.com', vapidKeys.publicKey, vapidKeys.privateKey);

// 2. MIDDLEWARES
app.use(cors());
app.use(express.json());

// 3. CONEXIÓN MONGODB (Con manejo de errores para que Render no se apague)
const MONGO_URI = 'mongodb+srv://Josan77:Yakonala@cluster0.npzvokr.mongodb.net/?appName=Cluster0'; 
mongoose.connect(MONGO_URI)
    .then(() => console.log('✅ DB Conectada'))
    .catch(err => console.error('❌ Error conexión DB:', err));

const Gasto = mongoose.model('Gasto', new mongoose.Schema({
    concepto: String, importe: Number, categoria: String, fecha: String
}));

// 4. SISTEMA DE NOTIFICACIONES
let suscripciones = []; 

app.post('/api/subscribe', (req, res) => {
    const sub = req.body;
    if (sub && sub.endpoint) {
        if (!suscripciones.find(s => s.endpoint === sub.endpoint)) suscripciones.push(sub);
    }
    res.status(201).json({ ok: true });
});

function enviarAviso(titulo, texto) {
    const payload = JSON.stringify({ title: titulo, body: texto });
    suscripciones.forEach(sub => {
        webpush.sendNotification(sub, payload).catch(err => {
            console.log("Suscripción inválida borrada");
            suscripciones = suscripciones.filter(s => s.endpoint !== sub.endpoint);
        });
    });
}

// 5. RUTAS API
app.get('/api/gastos', async (req, res) => {
    try {
        const gastos = await Gasto.find();
        res.json(gastos);
    } catch (e) { res.status(500).json([]); }
});

app.post('/api/gastos', async (req, res) => {
    try {
        const nuevoGasto = new Gasto(req.body);
        await nuevoGasto.save();
        
        // Lógica de saldo bajo
        const todos = await Gasto.find();
        let saldo = 0;
        todos.forEach(g => {
            if (["Sueldo", "Otros Ingresos"].includes(g.categoria)) saldo += Number(g.importe);
            else saldo -= Number(g.importe);
        });
        if (saldo < 100) enviarAviso("⚠️ Saldo Bajo", `Te quedan ${saldo.toFixed(2)}€`);
        
        res.status(201).json(nuevoGasto);
    } catch (e) { res.status(500).json({error: e.message}); }
});

app.delete('/api/gastos/:id', async (req, res) => {
    try {
        await Gasto.findByIdAndDelete(req.params.id);
        res.json({ ok: true });
    } catch (e) { res.status(500).json({ ok: false }); }
});

// 6. PROGRAMACIÓN (Cada mañana a las 9 AM)
cron.schedule('0 9 * * *', () => {
    enviarAviso("🔔 BBVA Premium", "Revisa tus movimientos de hoy");
});

// Ruta simple para verificar que el servidor vive
app.get('/', (req, res) => {
    res.send('Servidor BBVA Premium Activo 🚀');
});

app.listen(PORT, () => {
    console.log(`🚀 Servidor listo en puerto ${PORT}`);
});
