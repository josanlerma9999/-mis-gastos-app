const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(__dirname)); 

// Conexión MongoDB - TU BASE DE DATOS REAL
const MONGO_URI = 'mongodb+srv://Josan77:Yakonala@cluster0.npzvokr.mongodb.net/test?retryWrites=true&w=majority'; 
mongoose.connect(MONGO_URI)
    .then(() => console.log('✅ DB Conectada'))
    .catch(err => console.error('❌ Error DB:', err));

const Gasto = mongoose.model('Gasto', new mongoose.Schema({
    concepto: String, 
    importe: Number, 
    categoria: String, 
    fecha: String
}));

// API de Gastos (Lo que hace que veas tus datos)
app.get('/api/gastos', async (req, res) => {
    try { 
        // El 1 significa orden ascendente (de más antiguo a más futuro)
        // Si quisieras los más nuevos primero, pondrías -1
        const gastos = await Gasto.find().sort({ fecha: 1 }); 
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

// Ruta para cargar la web
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => console.log(`🚀 Puerto ${PORT}`));
