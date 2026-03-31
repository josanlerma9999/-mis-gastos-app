const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors'); // El portero que deja pasar los datos
const path = require('path');

const app = express();
app.use(cors()); // Permitir que el móvil envíe datos
app.use(express.json());
app.use(express.static(__dirname));

// CONEXIÓN (Usa tu dirección de MongoDB aquí debajo)
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

app.get('/api/gastos', async (req, res) => {
    const gastos = await Gasto.find();
    res.json(gastos);
});

app.post('/api/gastos', async (req, res) => {
    try {
        const nuevoGasto = new Gasto(req.body);
        await nuevoGasto.save();
        res.status(201).json(nuevoGasto);
    } catch (error) {
        res.status(500).json({ error: 'Error al guardar' });
    }
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Servidor en puerto ${PORT}`);
});
