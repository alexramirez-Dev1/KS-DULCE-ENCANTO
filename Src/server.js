const express    = require('express');
const mongoose   = require('mongoose');
const cors       = require('cors');
const admin      = require('firebase-admin');
require('dotenv').config();

// ─── FIREBASE ADMIN ───────────────────────────────────────────────────────────
const serviceAccount = require('./serviceAccount.json');

admin.initializeApp({
  credential:  admin.credential.cert(serviceAccount),
  databaseURL: `https://${serviceAccount.project_id}-default-rtdb.firebaseio.com`,
  projectId:   serviceAccount.project_id,
});

const db = admin.firestore();
console.log('>>> [Firebase Admin] Inicializado —', serviceAccount.project_id);

// ─── APP ──────────────────────────────────────────────────────────────────────
const app = express();

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// ─── MIDDLEWARE: verificar token Firebase ─────────────────────────────────────
async function verifyFirebaseToken(req, res, next) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer '))
    return res.status(401).json({ message: 'Token requerido' });
  try {
    req.user = await admin.auth().verifyIdToken(header.split('Bearer ')[1]);
    next();
  } catch {
    res.status(401).json({ message: 'Token inválido o expirado' });
  }
}

// ─── MIDDLEWARE: solo admin ───────────────────────────────────────────────────
async function requireAdmin(req, res, next) {
  const snap = await db.collection('users').doc(req.user.uid).get();
  if (!snap.exists || snap.data().role !== 'admin')
    return res.status(403).json({ message: 'Acceso denegado: se requiere rol admin' });
  next();
}

// ─── RUTAS PÚBLICAS ───────────────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', project: serviceAccount.project_id, ts: new Date() });
});

// ─── RUTAS AUTENTICADAS ───────────────────────────────────────────────────────

// Perfil del usuario actual
app.get('/api/me', verifyFirebaseToken, async (req, res) => {
  try {
    const snap = await db.collection('users').doc(req.user.uid).get();
    const profile = snap.exists ? snap.data() : {};
    res.json({ uid: req.user.uid, email: req.user.email, ...profile });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Actualizar perfil
app.put('/api/me', verifyFirebaseToken, async (req, res) => {
  try {
    const { name, lastname, phone, age } = req.body;
    await db.collection('users').doc(req.user.uid).update({
      ...(name     && { name }),
      ...(lastname && { lastname }),
      ...(phone    && { phone }),
      ...(age      && { age: Number(age) }),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    res.json({ message: 'Perfil actualizado' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ─── RUTAS ADMIN ──────────────────────────────────────────────────────────────

// Listar todos los usuarios
app.get('/api/admin/users', verifyFirebaseToken, requireAdmin, async (req, res) => {
  try {
    const snap = await db.collection('users').orderBy('createdAt', 'desc').get();
    res.json(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Cambiar rol de un usuario
app.patch('/api/admin/users/:uid/role', verifyFirebaseToken, requireAdmin, async (req, res) => {
  try {
    const { role } = req.body;
    if (!['admin', 'empleado', 'cliente'].includes(role))
      return res.status(400).json({ message: 'Rol inválido' });
    await db.collection('users').doc(req.params.uid).update({ role });
    res.json({ message: `Rol actualizado a "${role}"` });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Eliminar usuario (Auth + Firestore)
app.delete('/api/admin/users/:uid', verifyFirebaseToken, requireAdmin, async (req, res) => {
  try {
    await admin.auth().deleteUser(req.params.uid);
    await db.collection('users').doc(req.params.uid).delete();
    res.json({ message: 'Usuario eliminado' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Productos desde Firestore
app.get('/api/productos', async (req, res) => {
  try {
    const snap = await db.collection('productos').orderBy('nombre').get();
    res.json(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ─── MODELOS MONGOOSE ─────────────────────────────────────────────────────────
const ProductoSchema = new mongoose.Schema({
  nombre:      { type: String, required: true },
  descripcion: String,
  precio:      { type: Number, required: true },
  imagen:      String,
});
const Producto = mongoose.model('Producto', ProductoSchema);

// Seed MongoDB
app.get('/api/seed-productos', async (req, res) => {
  try {
    await Producto.deleteMany();
    await Producto.insertMany([
      { nombre:'Cupcakes x6',        descripcion:'Vainilla y chocolate',      precio:35 },
      { nombre:'Empanadas x6',        descripcion:'Jamón y queso, carne, pollo', precio:14 },
      { nombre:'Torta de Chocolate',  descripcion:'Bizcocho con chocolate',    precio:80 },
      { nombre:'Cheesecake de Fresa', descripcion:'Con base crocante',         precio:60 },
      { nombre:'Galletas x12',        descripcion:'Chispas de chocolate',      precio:20 },
      { nombre:'Croissants x4',       descripcion:'Hojaldre con mantequilla',  precio:18 },
    ]);
    res.json({ mensaje: 'Productos en MongoDB OK' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Seed Firestore
app.get('/api/seed-productos-firestore', async (req, res) => {
  try {
    const batch = db.batch();
    [
      { nombre:'Cupcakes x6',        descripcion:'Vainilla y chocolate', precio:35 },
      { nombre:'Torta de Chocolate',  descripcion:'Bizcocho con chocolate', precio:80 },
      { nombre:'Cheesecake de Fresa', descripcion:'Con base crocante',    precio:60 },
      { nombre:'Galletas x12',        descripcion:'Chispas de chocolate', precio:20 },
    ].forEach(p => batch.set(db.collection('productos').doc(), {
      ...p, createdAt: admin.firestore.FieldValue.serverTimestamp(),
    }));
    await batch.commit();
    res.json({ mensaje: 'Productos en Firestore OK' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Rutas auth legacy
const authRoutes = require('./routes/auth');
app.use('/api/legacy', authRoutes);

// ─── MONGODB ──────────────────────────────────────────────────────────────────
const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/ks-dulce-encanto';
mongoose.connect(MONGO_URI)
  .then(() => console.log('>>> [MongoDB] Conectada:', MONGO_URI))
  .catch(err => console.warn('>>> [MongoDB] No disponible:', err.message));

// ─── INICIO ───────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`>>> [SERVER] http://localhost:${PORT}`));
