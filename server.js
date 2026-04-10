const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const webpush = require('web-push');
const cron = require('node-cron');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// 1. CONFIGURACIÓN DE LLAVES FIJAS (He puesto las tuyas del index.html para que coincidan)
const publicVapidKey = 'BOXvAuzEtZeLfjrb-naB5CufutD4qWBEO1zstHnQSuggfodPx8cxZQI1fNPSSLyKC1xJ5AatPATzYGvBd7YJVnM';
const privateVapidKey = 'L81-5R816y3RAsv-r7Cj5yGZz3hDndK-U8Uo3U8x3YQ'; // Nota: Esta debe ser tu privada real

webpush.setVapidDetails(
    'mailto:test@test.com',
    publicVapidKey,
    privateVapidKey
);

// 2. MIDDLEWARES
app.use(cors());
app.use(express.json());

// --- ESTO ES LO QUE TE FALTABA PARA VER LA WEB ---
app.use(express.static(path.join(__dirname, 'public'))); 
// Asegúrate de que tu index.html y sw.js estén en una carpeta llamada 'public'
// Si los tienes en la raíz, usa: app.use(express.static(__dirname));
// ------------------------------------------------

// 3. CONEXIÓN MONGODB
const MONGO_URI = 'mongodb+srv://Josan77:Yakonala@cluster0.npzvokr.mongodb.net/bbva_db?retryWrites=true&w=majority'; 
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
        if (!suscripciones.find(s => s.endpoint === sub.endpoint)) {
            suscripciones.push(sub);
            console.log("Nuevas suscripción guardada");
        }
    }
    res.status(201).json({ ok: true });
});

function enviarAviso(titulo, texto) {
    const payload = JSON.stringify({ title: titulo, body: texto });
    suscripciones.forEach(sub => {
        webpush.sendNotification(sub, payload).catch(err => {
            console.error("Error enviando notif:", err);
            suscripciones = suscripciones.filter(s => s.endpoint !== sub.endpoint);
        });
    });
}

// 5. RUTAS API
app.get('/api/gastos', async (req, res) => {
    try {
        const gastos = await Gasto.find().sort({fecha: -1});
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
        else enviarAviso("✅ Operación Realizada", `${req.body.concepto}: ${req.body.importe}€`);

        res.status(201).json(nuevoGasto);
    } catch (e) { res.status(500).json({error: e.message}); }
});

app.delete('/api/gastos/:id', async (req, res) => {
    try {
        await Gasto.findByIdAndDelete(req.params.id);
        res.json({ ok: true });
    } catch (e) { res.status(500).json({ ok: false }); }
});

// 6. RUTA PARA SERVIR LA APP (Si no encuentra estáticos)
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

cron.schedule('0 9 * * *', () => {
    enviarAviso("🔔 BBVA Premium", "Revisa tus movimientos de hoy");
});

app.listen(PORT, () => {
    console.log(`🚀 Servidor listo en puerto ${PORT}`);
});
