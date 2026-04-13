
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(__dirname)); 

// 1. CONEXIÓN SEGURA A MONGODB (Usando la variable de Render)
const MONGO_URI = process.env.MONGO_URI; 

mongoose.connect(MONGO_URI)
    .then(() => console.log('✅ DB Conectada'))
    .catch(err => console.error('❌ Error DB:', err));

const Gasto = mongoose.model('Gasto', new mongoose.Schema({
    concepto: String, 
    importe: Number, 
    categoria: String, 
    fecha: String
}));

// 2. EL PORTERO (SEGURIDAD API KEY)
// Este bloque protege todas las rutas que vienen después
app.use((req, res, next) => {
    const MI_CLAVE_MAESTRA = process.env.MI_LLAVE_SECRETA;
    const llaveEnviada = req.headers['x-api-key'];

    if (llaveEnviada && llaveEnviada === MI_CLAVE_MAESTRA) {
        next(); // Si la llave es correcta, adelante
    } else {
        console.log("❌ Intento de acceso bloqueado");
        res.status(403).json({ error: "Acceso denegado. Se requiere API Key válida." });
    }
});

// --- RUTAS DE LA API (Ahora todas están protegidas por el portero) ---

app.get('/api/gastos', async (req, res) => {
    try { 
        const gastos = await Gasto.find();
        res.json(gastos); 
    } catch (e) { 
        res.status(500).json([]); 
    }
});

app.post('/api/gastos', async (req, res) => {
    try {
        const nuevoGasto = new Gasto(req.body);
        await nuevoGasto.save();
        res.status(201).json(nuevoGasto);
    } catch (e) { 
        res.status(500).json({error: e.message}); 
    }
});

app.delete('/api/gastos/:id', async (req, res) => {
    try {
        await Gasto.findByIdAndDelete(req.params.id);
        res.json({ message: 'Eliminado' });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Ruta para cargar la web (Esta no necesita protección porque es lo que carga el navegador)
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => console.log(`🚀 Puerto ${PORT}`));
