const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const app = express();

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname))); 

const MONGO_URI ='mongodb+srv://Josan77:Yakonala@cluster0.npzvokr.mongodb.net/?appName=Cluster0';

mongoose.connect(MONGO_URI)
    .then(() => console.log('✅ ¡CONECTADO A MONGODB ATLAS!'))
    .catch(err => console.error('❌ Error de conexión:', err));

const GastoSchema = new mongoose.Schema({
    concepto: String,
    importe: Number,
    categoria: String,
    estado: String,
    fecha: String
});

const Gasto = mongoose.model('Gasto', GastoSchema);

app.get('/api/gastos', async (req, res) => {
    const gastos = await Gasto.find();
    res.json(gastos);
});

app.post('/api/gastos', async (req, res) => {
    const nuevoGasto = new Gasto(req.body);
    await nuevoGasto.save();
    res.status(201).json(nuevoGasto);
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Servidor listo en puerto ${PORT}`);
});
