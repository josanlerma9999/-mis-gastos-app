const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const webpush = require('web-push');
const cron = require('node-cron');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// CONFIG VAPID
webpush.setVapidDetails(
    'mailto:test@test.com',
    'BJm_Y2M9h_S-p1nS0O-pL9p6-E5Xz7y7XvI3p2k8j4m5n6o7p8q9r0s1t2u3v4w5x6y7z8a9b0c1d2e3f4g5h6',
    'w2R_Y9k8v7j6m5n4b3v2c1x0z9l8k7j6h5g4f3d2s1a'
);

// CONEXIÓN
mongoose.connect('mongodb+srv://Josan77:Yakonala@cluster0.npzvokr.mongodb.net/?appName=Cluster0')
    .then(() => console.log('✅ MongoDB OK'))
    .catch(err => console.error('❌ MongoDB Error:', err));

const Gasto = mongoose.model('Gasto', new mongoose.Schema({
    concepto: String, importe: Number, categoria: String, fecha: String
}));

app.get('/api/gastos', async (req, res) => {
    try {
        const gastos = await Gasto.find();
        res.json(gastos);
    } catch (e) { res.status(500).json([]); }
});

app.post('/api/gastos', async (req, res) => {
    try {
        const nuevo = new Gasto(req.body);
        await nuevo.save();
        res.json(nuevo);
    } catch (e) { res.status(500).json({error: e.message}); }
});

app.get('/', (req, res) => res.send('BBVA PREMIUM ONLINE 🚀'));

app.listen(PORT, () => console.log(`🚀 Servidor listo en puerto ${PORT}`));
