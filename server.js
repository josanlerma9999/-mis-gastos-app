const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const webpush = require('web-push');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Configuración VAPID (Usa las tuyas que funcionan en el HTML)
const publicVapidKey = 'BOXvAuzEtZeLfjrb-naB5CufutD4qWBEO1zstHnQSuggfodPx8cxZQI1fNPSSLyKC1xJ5AatPATzYGvBd7YJVnM';
const privateVapidKey = 'L81-5R816y3RAsv-r7Cj5yGZz3hDndK-U8Uo3U8x3YQ'; 

webpush.setVapidDetails('mailto:test@test.com', publicVapidKey, privateVapidKey);

app.use(cors());
app.use(express.json());

// --- ESTO ES LO QUE SOLUCIONA LA PANTALLA BLANCA ---
// Le dice al servidor que sirva TODOS los archivos de la carpeta principal
app.use(express.static(__dirname)); 

// Conexión MongoDB
const MONGO_URI = 'mongodb+srv://Josan77:Yakonala@cluster0.npzvokr.mongodb.net/bbva_db?retryWrites=true&w=majority'; 
mongoose.connect(MONGO_URI).then(() => console.log('✅ DB Conectada')).catch(err => console.error('❌ Error DB:', err));

const Gasto = mongoose.model('Gasto', new mongoose.Schema({
    concepto: String, importe: Number, categoria: String, fecha: String
}));

// API de Notificaciones
let suscripciones = []; 
app.post('/api/subscribe', (req, res) => {
    const sub = req.body;
    if (sub && sub.endpoint) {
        if (!suscripciones.find(s => s.endpoint === sub.endpoint)) suscripciones.push(sub);
    }
    res.status(201).json({ ok: true });
});

// Rutas de Gastos
app.get('/api/gastos', async (req, res) => {
    try { const gastos = await Gasto.find().sort({fecha: -1}); res.json(gastos); } 
    catch (e) { res.status(500).json([]); }
});

app.post('/api/gastos', async (req, res) => {
    try {
        const nuevoGasto = new Gasto(req.body);
        await nuevoGasto.save();
        res.status(201).json(nuevoGasto);
    } catch (e) { res.status(500).json({error: e.message}); }
});

// --- ESTA RUTA ES EL SALVAVIDAS ---
// Si alguien entra a la raíz, le mandamos el index.html sí o sí
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => console.log(`🚀 Puerto ${PORT}`));
