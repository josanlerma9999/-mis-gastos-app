const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const webpush = require('web-push');
const cron = require('node-cron');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// 1. CONFIGURACIÓN AUTOMÁTICA DE LLAVES (Para evitar errores de longitud)
const keys = webpush.generateVAPIDKeys();
webpush.setVapidDetails(
    'mailto:test@test.com',
    keys.publicKey,
    keys.privateKey
);
console.log("Llave Pública para el index.html:", keys.publicKey);

// 2. MIDDLEWARES
app.use(cors());
app.use(express.json());

// 3. CONEXIÓN MONGODB
const MONGO_URI = 'mongodb+srv://Josan77:Yakonala@cluster0.npzvokr.mongodb.net/?appName=Cluster0'; 
mongoose.connect(MONGO_URI)
    .then(() => console.log('✅ DB Conectada'))
    .catch(err => console.error('❌ Error DB:', err));

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
        webpush.sendNotification(sub, payload).catch(() => {
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

app.get('/', (req, res) => {
    res.send('Servidor Activo 🚀');
});

app.listen(PORT, () => {
    console.log(`🚀 Servidor listo en puerto ${PORT}`);
});
