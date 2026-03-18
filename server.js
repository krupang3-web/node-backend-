// ═══════════════════════════════════════════════════════════════
//  NeuroCry AI  —  Node.js / Express / MongoDB Backend
//  Port: 3001
// ═══════════════════════════════════════════════════════════════

const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = 3001;
const JWT_SECRET = 'neurocry-ai-jwt-secret-2026-secure';
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/neurocry';

// ── Middleware ─────────────────────────────────────────────────
app.use(cors({ origin: '*', credentials: true }));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
const IS_VERCEL = process.env.VERCEL === '1' || process.env.VERCEL;
const UPLOADS_DIR = IS_VERCEL ? '/tmp/uploads' : path.join(__dirname, 'uploads');
fs.mkdirSync(UPLOADS_DIR, { recursive: true });
const FRONTEND = path.join(__dirname, '../frontend');
app.use('/static', express.static(FRONTEND));
app.use(express.static(FRONTEND));

// ── In-Memory DB for Demo Mode ─────────────────────────────────
let dbConnected = false;
const DB_FILE = IS_VERCEL ? '/tmp/demo_db.json' : path.join(__dirname, 'demo_db.json');
let DEMO_DB = { users: [], patients: [], analyses: [] };
if (fs.existsSync(DB_FILE)) {
  try { DEMO_DB = JSON.parse(fs.readFileSync(DB_FILE, 'utf8')); }
  catch (e) { console.warn('Could not read demo_db.json, starting fresh.'); }
}
function saveDemoDB() {
  fs.writeFileSync(DB_FILE, JSON.stringify(DEMO_DB, null, 2), 'utf8');
}

// Normalize legacy camelCase fields to snake_case on startup
function normalizeDemoDB() {
  DEMO_DB.patients = DEMO_DB.patients.map(p => ({
    ...p,
    user_id: p.user_id || p.userId || '',
    age_weeks: p.age_weeks != null ? p.age_weeks : (p.ageWeeks != null ? p.ageWeeks : null),
    parent_name: p.parent_name || p.parentName || '',
    contact_number: p.contact_number || p.contactNumber || '',
    medical_notes: p.medical_notes || p.medicalNotes || '',
    created_at: p.created_at || p.createdAt || new Date().toISOString()
  }));
  DEMO_DB.analyses = DEMO_DB.analyses.map(a => ({
    ...a,
    patient_id: a.patient_id || a.patientId || '',
    cry_type: a.cry_type || a.cryType || 'Unknown',
    risk_level: a.risk_level || a.riskLevel || 'Low',
    media_type: a.media_type || a.mediaType || 'upload'
  }));
}
normalizeDemoDB();

function genId() { return Math.random().toString(36).substring(2, 10); }

// ── Mongoose Models ────────────────────────────────────────────
const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true, lowercase: true },
  password: { type: String, required: true },
  created_at: { type: Date, default: Date.now }
});
const patientSchema = new mongoose.Schema({
  user_id: { type: String, required: true },
  name: { type: String, required: true },
  gender: String, age_weeks: Number, weight: Number, parent_name: String,
  contact_number: String, medical_notes: String, created_at: { type: Date, default: Date.now }
});
const analysisSchema = new mongoose.Schema({
  patient_id: { type: String, required: true },
  cry_type: { type: String, required: true },
  confidence: { type: Number, required: true },
  risk_level: { type: String, default: 'Low' },
  status: { type: String, default: 'Normal' },
  recommendation: String, media_type: { type: String, default: 'upload' },
  timestamp: { type: Date, default: Date.now }
});
const User = mongoose.model('User', userSchema);
const Patient = mongoose.model('Patient', patientSchema);
const Analysis = mongoose.model('Analysis', analysisSchema);

// ── Auth Middleware ────────────────────────────────────────────
function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) return res.status(401).json({ error: 'Not authenticated.' });
  try {
    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user_id = decoded.user_id;
    req.userName = decoded.name;
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Invalid or expired token.' });
  }
}

// ── Sample Data Seeder ─────────────────────────────────────────
function seedDataIfEmpty() {
  const adminEmail = 'admin@neurocry.com';
  let admin = dbConnected ? null : DEMO_DB.users.find(u => u.email === adminEmail);

  if (!admin) {
    const hashed = bcrypt.hashSync('admin123', 12);
    const adminId = genId();
    admin = { _id: adminId, name: 'Admin', email: adminEmail, password: hashed, role: 'admin' };
    if (!dbConnected) DEMO_DB.users.push(admin);
  }

  const adminId = admin._id || admin.id;
  const adminPatients = dbConnected ? [] : DEMO_DB.patients.filter(p => p.user_id === adminId);

  if (adminPatients.length === 0) {
    const p1 = genId(), p2 = genId(), p3 = genId();
    if (!dbConnected) {
      DEMO_DB.patients.push(
        { _id: p1, user_id: adminId, name: 'Baby John', gender: 'Male', age_weeks: 5, weight: 4.2, parent_name: 'Jane Doe', created_at: new Date(Date.now() - 86400000 * 5) },
        { _id: p2, user_id: adminId, name: 'Emma Smith', gender: 'Female', age_weeks: 12, weight: 6.1, parent_name: 'Sarah Smith', created_at: new Date(Date.now() - 86400000 * 10) },
        { _id: p3, user_id: adminId, name: 'Liam Wilson', gender: 'Male', age_weeks: 2, weight: 3.8, parent_name: 'Mike Wilson', created_at: new Date(Date.now() - 86400000 * 2) }
      );

      // Some analyses
      DEMO_DB.analyses.push(
        { _id: genId(), patient_id: p1, cry_type: 'Hunger', confidence: 92, risk_level: 'Low', status: 'Normal', timestamp: new Date(Date.now() - 3600000 * 2) },
        { _id: genId(), patient_id: p2, cry_type: 'Pain', confidence: 88, risk_level: 'High', status: 'Critical', timestamp: new Date(Date.now() - 3600000 * 24) },
        { _id: genId(), patient_id: p1, cry_type: 'Sleep', confidence: 75, risk_level: 'Low', status: 'Normal', timestamp: new Date(Date.now() - 3600000 * 48) }
      );
      saveDemoDB();
    }
  }
}
seedDataIfEmpty();

// ── AI Cry Analysis Engine (Simulation) ───────────────────────
const CRY_DATA = {
  'Hunger Cry': { weight: 28, risk: 'Low', recommendation: 'Feed the infant within the next few minutes. Monitor feeding amount carefully.' },
  'Sleep Cry': { weight: 22, risk: 'Low', recommendation: 'Create a calm, dark environment. Begin sleep routine immediately.' },
  'Discomfort Cry': { weight: 14, risk: 'Medium', recommendation: 'Check diaper, clothing, or temperature. Ensure environment is comfortable.' },
  'Pain Cry': { weight: 12, risk: 'High', recommendation: 'Check for physical discomfort. Assess temperature and visible issues. Consult doctor if persistent.' },
  'Normal Cry': { weight: 10, risk: 'Low', recommendation: 'The infant is likely just communicating a normal state or minor need.' }
};

// ── Deterministic PRNG ────────────────────────────────────────────
function cyrb128(str) {
  let h1 = 1779033703, h2 = 3144134277, h3 = 1013904242, h4 = 2773480762;
  for (let i = 0, k; i < str.length; i++) {
    k = str.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  return (h1 ^ h2 ^ h3 ^ h4) >>> 0;
}

function mulberry32(a) {
  return function () {
    var t = a += 0x6D2B79F5;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  }
}

function simulateCryAnalysis(seedStr = null) {
  const randFunc = seedStr ? mulberry32(cyrb128(seedStr)) : Math.random;

  const types = Object.keys(CRY_DATA);
  const weights = types.map(t => CRY_DATA[t].weight);
  const totalWeight = weights.reduce((a, b) => a + b, 0);
  let rand = randFunc() * totalWeight;
  let cryType = types[0];
  for (let i = 0; i < types.length; i++) {
    rand -= weights[i];
    if (rand <= 0) { cryType = types[i]; break; }
  }
  const { risk, recommendation } = CRY_DATA[cryType];
  return {
    cry_type: cryType,
    confidence: Math.round(70 + randFunc() * 25),
    risk_level: risk,
    recommendation,
    status: risk === 'High' ? 'Critical' : 'Normal'
  };
}

const upload = multer({ dest: UPLOADS_DIR, limits: { fileSize: 100 * 1024 * 1024 } });

// ═══════════════════════════════════════════════════════════════
//  ROUTES
// ═══════════════════════════════════════════════════════════════

app.post('/api/auth/register', async (req, res) => {
  try {
    const { name, email, password } = req.body;
    if (!name?.trim() || !email?.trim() || !password || password.length < 5) return res.status(400).json({ error: 'Invalid input data' });
    const emailLow = email.toLowerCase();

    let exists = dbConnected ? await User.findOne({ email: emailLow }) : DEMO_DB.users.find(u => u.email === emailLow);
    if (exists) return res.status(400).json({ error: 'Email already registered. Please login.' });

    const hashed = await bcrypt.hash(password, 12);
    if (dbConnected) {
      await User.create({ name: name.trim(), email: emailLow, password: hashed });
    } else {
      DEMO_DB.users.push({ _id: genId(), name: name.trim(), email: emailLow, password: hashed });
      saveDemoDB();
    }
    res.status(201).json({ status: 'success', message: 'Registration successful!' });
  } catch (err) { res.status(500).json({ error: 'Registration failed: ' + err.message }); }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const emailLow = email.toLowerCase();

    let user = dbConnected ? await User.findOne({ email: emailLow }) : DEMO_DB.users.find(u => u.email === emailLow);
    if (!user) return res.status(401).json({ status: 'error', message: 'Invalid email or password' });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(401).json({ status: 'error', message: 'Invalid email or password' });

    const token = jwt.sign({ user_id: user._id, name: user.name, email: user.email }, JWT_SECRET, { expiresIn: '24h' });
    res.json({
      success: true,
      token: token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role || 'admin'
      }
    });
  } catch (err) { res.status(500).json({ error: 'Login failed: ' + err.message }); }
});

app.post('/api/auth/logout', (req, res) => {
  res.json({ success: true, message: 'Logged out successfully' });
});

// Added granular endpoints for dashboard
app.get('/api/patients/count', authMiddleware, async (req, res) => {
  const patients = dbConnected ? await Patient.find({ user_id: req.user_id }) : DEMO_DB.patients.filter(p => p.user_id === req.user_id);
  res.json({ total_patients: patients.length });
});
app.get('/api/analysis/count', authMiddleware, async (req, res) => {
  const analyses = dbConnected ? await Analysis.find() : DEMO_DB.analyses;
  res.json({ total_analyses: analyses.length });
});
app.get('/api/analysis/high-risk', authMiddleware, async (req, res) => {
  const analyses = dbConnected ? await Analysis.find({ risk_level: 'High' }) : DEMO_DB.analyses.filter(a => a.risk_level === 'High');
  res.json({ high_risk: analyses.length });
});
app.get('/api/system/status', (req, res) => res.json({ status: 'Online' }));
app.get('/api/patients/recent', authMiddleware, async (req, res) => {
  let patients = dbConnected ? await Patient.find({ user_id: req.user_id }).sort({ created_at: -1 }).limit(10) : DEMO_DB.patients.filter(p => p.user_id === req.user_id).reverse().slice(0, 10);
  const result = patients.map(p => {
    let pAns = dbConnected ? [] : DEMO_DB.analyses.filter(a => a.patient_id.toString() === p._id.toString()).sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    let lastA = pAns[0];
    return { id: p._id, name: p.name, gender: p.gender, age_weeks: p.age_weeks, weight: p.weight, parent_name: p.parent_name, last_cry_type: lastA?.cry_type || '—', last_risk_level: lastA?.risk_level || 'Low', last_analysis: lastA?.timestamp || null };
  });
  res.json(result);
});
app.get('/api/analysis/cry-distribution', authMiddleware, async (req, res) => {
  const analyses = dbConnected ? await Analysis.find() : DEMO_DB.analyses;
  const cryDist = {};
  analyses.forEach(a => { cryDist[a.cry_type] = (cryDist[a.cry_type] || 0) + 1; });
  res.json(cryDist);
});

app.get('/api/dashboard', authMiddleware, async (req, res) => {
  try {
    let patients = dbConnected ? await Patient.find({ user_id: req.user_id }) : DEMO_DB.patients.filter(p => p.user_id === req.user_id);
    let pIds = patients.map(p => p._id.toString());
    let analyses = dbConnected ? await Analysis.find({ patient_id: { $in: pIds } }) : DEMO_DB.analyses.filter(a => pIds.includes(a.patient_id.toString()));

    const cryDist = { 'Hunger Cry': 0, 'Pain Cry': 0, 'Discomfort Cry': 0, 'Sleep Cry': 0, 'Normal Cry': 0 };
    let totalConfidence = 0;
    analyses.forEach(a => {
      cryDist[a.cry_type] = (cryDist[a.cry_type] || 0) + 1;
      totalConfidence += a.confidence;
    });

    const avgConfidence = analyses.length > 0 ? Math.round(totalConfidence / analyses.length) : 85;
    const sortedAnalyses = analyses.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    const lastTime = sortedAnalyses[0]?.timestamp || null;

    const recentData = [];
    for (const p of patients.slice().reverse().slice(0, 8)) {
      let pAnalyses = analyses.filter(a => a.patient_id.toString() === p._id.toString()).sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
      let lastA = pAnalyses[0];
      recentData.push({
        id: p._id, name: p.name, age_weeks: p.age_weeks, weight: p.weight, parent_name: p.parent_name,
        analysis_count: pAnalyses.length,
        last_cry_type: lastA?.cry_type || '—', last_risk_level: lastA?.risk_level || 'Low', last_analysis: lastA?.timestamp || null,
        created_at: p.created_at,
        monitoring_status: pAnalyses.length > 0 ? 'Active' : 'Idle'
      });
    }

    res.json({
      total_patients: patients.length,
      total_analyses: analyses.length,
      risk_alerts: analyses.filter(a => a.risk_level === 'High').length,
      avg_confidence: avgConfidence,
      last_analysis_time: lastTime,
      cry_distribution: cryDist,
      recent_patients: recentData
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/history', authMiddleware, async (req, res) => {
  try {
    let patients = dbConnected ? await Patient.find({ user_id: req.user_id }) : DEMO_DB.patients.filter(p => p.user_id === req.user_id);
    let pIds = patients.map(p => p._id.toString());

    let analyses = dbConnected
      ? await Analysis.find({ patient_id: { $in: pIds } }).sort({ timestamp: -1 }).limit(50)
      : DEMO_DB.analyses.filter(a => pIds.includes(a.patient_id.toString())).sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)).slice(0, 50);

    const historyData = analyses.map(a => {
      const p = patients.find(px => px._id.toString() === a.patient_id.toString());
      return {
        id: a._id,
        patient_id: a.patient_id,
        patient_name: p ? p.name : 'Unknown',
        name: p ? p.name : 'Unknown', // Keep both for safety
        cry_type: a.cry_type,
        confidence: a.confidence,
        risk_level: a.risk_level,
        status: a.status,
        date: a.timestamp,
        timestamp: a.timestamp,
        created_at: a.timestamp
      };
    });

    res.json(historyData);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/backup', authMiddleware, async (req, res) => {
  try {
    let patients = dbConnected ? await Patient.find({ user_id: req.user_id }) : DEMO_DB.patients.filter(p => p.user_id === req.user_id);
    let pIds = patients.map(p => p._id.toString());
    let analyses = dbConnected ? await Analysis.find({ patient_id: { $in: pIds } }) : DEMO_DB.analyses.filter(a => pIds.includes(a.patient_id.toString()));

    const backupData = {
      exportDate: new Date().toISOString(),
      user: req.userName,
      stats: {
        totalPatients: patients.length,
        totalAnalyses: analyses.length
      },
      patients: patients.map(p => {
        let pAns = analyses.filter(a => a.patient_id.toString() === p._id.toString());
        return {
          id: p._id,
          name: p.name,
          gender: p.gender,
          age_weeks: p.age_weeks,
          weight: p.weight,
          parent_name: p.parent_name,
          contact_number: p.contact_number,
          medical_notes: p.medical_notes,
          created_at: p.created_at,
          analyses: pAns.map(a => ({
            id: a._id,
            cry_type: a.cry_type,
            confidence: a.confidence,
            risk_level: a.risk_level,
            recommendation: a.recommendation,
            media_type: a.media_type,
            timestamp: a.timestamp
          }))
        };
      })
    };

    res.setHeader('Content-disposition', `attachment; filename=neurocry-backup-${Date.now()}.json`);
    res.setHeader('Content-type', 'application/json');
    res.send(JSON.stringify(backupData, null, 2));
  } catch (err) { res.status(500).json({ error: 'Backup failed: ' + err.message }); }
});

app.get('/api/patients', authMiddleware, async (req, res) => {
  try {
    let patients = dbConnected ? await Patient.find({ user_id: req.user_id }).sort({ created_at: -1 }) : DEMO_DB.patients.filter(p => p.user_id === req.user_id).reverse();
    let analyses = dbConnected ? await Analysis.find() : DEMO_DB.analyses;

    const result = patients.map(p => {
      let pAnalyses = analyses.filter(a => a.patient_id.toString() === p._id.toString()).sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
      let lastA = pAnalyses[0];
      return {
        id: p._id, name: p.name, gender: p.gender, age_weeks: p.age_weeks, weight: p.weight,
        parent_name: p.parent_name, contact_number: p.contact_number, medical_notes: p.medical_notes,
        analysis_count: pAnalyses.length,
        last_cry_type: lastA?.cry_type || '—', last_risk_level: lastA?.risk_level || 'Low', last_analysis: lastA?.timestamp || null,
        created_at: p.created_at
      };
    });
    res.json(result);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/patients/:id', authMiddleware, async (req, res) => {
  try {
    let p = dbConnected ? await Patient.findOne({ _id: req.params.id, user_id: req.user_id }) : DEMO_DB.patients.find(x => x._id.toString() === req.params.id && x.user_id === req.user_id);
    if (!p) return res.status(404).json({ error: 'Patient not found' });

    let pAnalyses = dbConnected ? await Analysis.find({ patient_id: p._id }).sort({ timestamp: -1 }) : DEMO_DB.analyses.filter(a => a.patient_id.toString() === p._id.toString()).sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    res.json({
      id: p._id, name: p.name, gender: p.gender, age_weeks: p.age_weeks, weight: p.weight,
      parent_name: p.parent_name, contact_number: p.contact_number, medical_notes: p.medical_notes, created_at: p.created_at,
      analyses: pAnalyses.map(a => ({
        id: a._id, cry_type: a.cry_type, confidence: a.confidence, risk_level: a.risk_level,
        status: a.status, recommendation: a.recommendation, media_type: a.media_type, date: a.timestamp
      }))
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/patient/final-onboarding', authMiddleware, async (req, res) => {
  try {
    const { name, gender, age_weeks, weight, parent_name, contact_number, medical_notes, cry_type, confidence, risk_level } = req.body;
    const patientId = genId();
    const newPatient = { _id: patientId, user_id: req.user_id, name, gender, age_weeks: Number(age_weeks), weight: Number(weight), parent_name: parent_name, contact_number: contact_number, medical_notes: medical_notes, created_at: new Date() };

    if (dbConnected) {
      const p = new Patient({ ...newPatient, _id: undefined });
      const savedP = await p.save();
      const a = new Analysis({ patient_id: savedP._id, cry_type: cry_type || 'Normal Cry', confidence: confidence || 85, risk_level: risk_level || 'Low', status: risk_level === 'High' ? 'Critical' : 'Normal', timestamp: new Date() });
      await a.save();
    } else {
      DEMO_DB.patients.push(newPatient);
      DEMO_DB.analyses.push({ _id: genId(), patient_id: patientId, cry_type: cry_type || 'Normal Cry', confidence: confidence || 85, risk_level: risk_level || 'Low', status: risk_level === 'High' ? 'Critical' : 'Normal', timestamp: new Date() });
      saveDemoDB();
    }
    res.json({ success: true, patientId });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/patients', authMiddleware, async (req, res) => {
  try {
    const { name, gender, age_weeks, weight, parent_name, contact_number, medical_notes } = req.body;
    if (!name) return res.status(400).json({ error: 'Patient name is required' });
    let id = genId();
    if (dbConnected) {
      const p = await Patient.create({ user_id: req.user_id, name, gender, age_weeks: Number(age_weeks), weight: Number(weight), parent_name: parent_name, contact_number: contact_number, medical_notes: medical_notes });
      id = p._id;
    } else {
      DEMO_DB.patients.push({ _id: id, user_id: req.user_id, name, gender, age_weeks: Number(age_weeks), weight: Number(weight), parent_name: parent_name, contact_number: contact_number, medical_notes: medical_notes, created_at: new Date() });
      saveDemoDB();
    }
    res.status(201).json({ id, message: 'Patient created successfully' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/patients/:id', authMiddleware, async (req, res) => {
  try {
    if (dbConnected) {
      await Patient.deleteOne({ _id: req.params.id, user_id: req.user_id });
      await Analysis.deleteMany({ patient_id: req.params.id });
    } else {
      DEMO_DB.patients = DEMO_DB.patients.filter(p => !(p._id.toString() === req.params.id && p.user_id === req.user_id));
      DEMO_DB.analyses = DEMO_DB.analyses.filter(a => a.patient_id.toString() !== req.params.id);
      saveDemoDB();
    }
    res.json({ message: 'Patient deleted successfully' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/analyze/audio', authMiddleware, async (req, res) => {
  try {
    const { patient_id, audio_data } = req.body;
    await new Promise(r => setTimeout(r, 600));

    // Use the first 50 chars of audio_data as the seed (or "live_recording")
    const seed = audio_data ? audio_data.substring(0, 50) : 'default_audio_seed';
    const result = simulateCryAnalysis(seed);

    // Auto-save analysis if patient_id provided
    if (patient_id) {
      const analysisData = {
        patient_id: patient_id.toString(),
        cry_type: result.cry_type,
        confidence: result.confidence,
        risk_level: result.risk_level,
        status: result.status,
        recommendation: result.recommendation,
        media_type: 'live'
      };
      if (dbConnected) {
        await Analysis.create(analysisData);
      } else {
        DEMO_DB.analyses.push({ _id: genId(), ...analysisData, timestamp: new Date() });
        saveDemoDB();
      }
    }

    res.json({
      cry_type: result.cry_type,
      confidence: result.confidence,
      risk_level: result.risk_level,
      recommendation: result.recommendation
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/analyze/upload', authMiddleware, upload.single('file'), async (req, res) => {
  try {
    const { patient_id } = req.body;

    // Use the original filename AND size as a deterministic seed
    // (e.g. "cry_audio.wav" + 1024 bytes will always yield the same result)
    const seed = req.file ? req.file.originalname + '_' + req.file.size : 'default_upload_seed';

    if (req.file) { try { fs.unlinkSync(req.file.path); } catch (_) { } }

    await new Promise(r => setTimeout(r, 1200));
    const result = simulateCryAnalysis(seed);

    if (patient_id) {
      const analysisData = {
        patient_id: patient_id.toString(),
        cry_type: result.cry_type,
        confidence: result.confidence,
        risk_level: result.risk_level,
        status: result.status,
        recommendation: result.recommendation,
        media_type: 'upload'
      };
      if (dbConnected) {
        await Analysis.create(analysisData);
      } else {
        DEMO_DB.analyses.push({ _id: genId(), ...analysisData, timestamp: new Date() });
        saveDemoDB();
      }
    }

    res.json({
      cry_type: result.cry_type,
      confidence: result.confidence,
      risk_level: result.risk_level,
      recommendation: result.recommendation
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/analyses', authMiddleware, async (req, res) => {
  try {
    const { patient_id, patientId, cry_type, cryType, confidence, risk_level, riskLevel, status, recommendation, media_type, mediaType } = req.body;
    let id = genId();
    const data = {
      patient_id: patient_id || patientId,
      cry_type: cry_type || cryType,
      confidence: confidence || 85,
      risk_level: risk_level || riskLevel || 'Low',
      status: status || 'Normal',
      recommendation,
      media_type: media_type || mediaType || 'upload'
    };
    if (dbConnected) {
      const a = await Analysis.create(data);
      id = a._id;
    } else {
      DEMO_DB.analyses.push({ _id: id, ...data, timestamp: new Date() });
      saveDemoDB();
    }
    res.status(201).json({ id, message: 'Analysis saved' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/analyses/:patientId', authMiddleware, async (req, res) => {
  try {
    let analyses = dbConnected ? await Analysis.find({ patient_id: req.params.patientId }).sort({ timestamp: -1 }) : DEMO_DB.analyses.filter(a => a.patient_id === req.params.patientId).sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    res.json(analyses.map(a => ({ id: a._id, cry_type: a.cry_type, confidence: a.confidence, risk_level: a.risk_level, status: a.status, recommendation: a.recommendation, media_type: a.media_type, date: a.timestamp })));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/patient/onboarding', authMiddleware, async (req, res) => {
  try {
    const { name, gender, age_weeks, ageWeeks, weight, parent_name, parentName, contact_number, contactNumber, medical_notes, medicalNotes, cry_type, cryType, confidence, risk_level, riskLevel, status, recommendation, media_type, mediaType } = req.body;
    if (!name) return res.status(400).json({ error: 'Patient name is required' });

    let pId = genId(), aId = genId();
    if (dbConnected) {
      const p = await Patient.create({ user_id: req.user_id, name, gender, age_weeks: Number(age_weeks || ageWeeks), weight: Number(weight), parent_name: parent_name || parentName, contact_number: contact_number || contactNumber, medical_notes: medical_notes || medicalNotes });
      const a = await Analysis.create({ patient_id: p._id.toString(), cry_type: cry_type || cryType, confidence: confidence || 85, risk_level: risk_level || riskLevel || 'Low', status: status || 'Normal', recommendation, media_type: media_type || mediaType || 'upload' });
      pId = p._id; aId = a._id;
    } else {
      DEMO_DB.patients.push({ _id: pId, user_id: req.user_id, name, gender, age_weeks: Number(age_weeks || ageWeeks), weight: Number(weight), parent_name: parent_name || parentName, contact_number: contact_number || contactNumber, medical_notes: medical_notes || medicalNotes, created_at: new Date() });
      if (cry_type || cryType) DEMO_DB.analyses.push({ _id: aId, patient_id: pId, cry_type: cry_type || cryType, confidence: confidence || 85, risk_level: risk_level || riskLevel || 'Low', status: status || 'Normal', recommendation, media_type: media_type || mediaType || 'upload', timestamp: new Date() });
      saveDemoDB();
    }
    res.status(201).json({ patient_id: pId, analysisId: aId, message: 'Patient onboarding completed successfully!' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/patients/:id/analyses', authMiddleware, async (req, res) => {
  try {
    let analyses = dbConnected ? await Analysis.find({ patient_id: req.params.id }).sort({ timestamp: -1 }) : DEMO_DB.analyses.filter(a => a.patient_id.toString() === req.params.id.toString()).sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    res.json(analyses.map(a => ({ id: a._id, cry_type: a.cry_type, confidence: a.confidence, risk_level: a.risk_level, status: a.status, recommendation: a.recommendation, media_type: a.media_type, date: a.timestamp })));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/health', (req, res) => res.json({ status: 'ok' }));
app.get(/^\/(?!api).*/, (req, res) => {
  const p = path.basename(req.path) || 'index.html';
  const f = path.join(FRONTEND, p.includes('.html') ? p : 'index.html');
  res.sendFile(fs.existsSync(f) ? f : path.join(FRONTEND, 'index.html'));
});

// ═══════════════════════════════════════════════════════════════
//  Connect MongoDB → Start Server
// ═══════════════════════════════════════════════════════════════
mongoose.set('bufferCommands', false); // Fail fast if DB not connected

mongoose.connect(MONGO_URI, { serverSelectionTimeoutMS: 2000 })
  .then(() => { dbConnected = true; console.log('✅ MongoDB connected'); startServer(); })
  .catch(err => {
    dbConnected = false;
    console.log('⚠️  MongoDB not available:', err.message);
    console.log('🔄 Starting in DEMO mode (In-Memory DB active)...');
    startServer();
  });

function startServer() {
  if (IS_VERCEL) return; // Vercel handles starting the server
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`\n║ 🚀 http://localhost:${PORT} | ${dbConnected ? '🟢 MongoDB' : '🟡 Demo Mode'}\n`);
  });
}

module.exports = app;
