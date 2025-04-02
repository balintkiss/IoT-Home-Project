require('dotenv').config();

const express = require('express');
const session = require('express-session');
const bodyParser = require('body-parser');
const passport = require('passport');
const LocalStrategy = require('passport-local').Strategy;
const bcrypt = require('bcrypt');
const cors = require('cors');
const path = require('path');
const mongoose = require('mongoose');
const app = express();
const axios = require('axios');


// === CORS Beállítás (GitHub Pages frontendhez) ===
const corsOptions = {
  origin: 'https://balintkiss.hu',
  credentials: true,
  methods: ['GET', 'POST', 'OPTIONS']
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions)); // 🔥 engedi a böngésző előkérdéseit

// === MongoDB kapcsolat ===
mongoose.connect('mongodb+srv://balintkiss:6eo8bogDbFcI5uQo@m0.d3gpjf9.mongodb.net/wifiapp?retryWrites=true&w=majority&appName=M0')
  .then(() => console.log("✅ Kapcsolódva a MongoDB-hez"))
  .catch(err => console.error("❌ MongoDB hiba:", err));

// === ADMIN USER ===
const adminUser = {
  id: 1,
  username: 'admin',
  passwordHash: '$2b$10$O5OYi9.flRBeifwhT5u5F.I1Eq4QFjXU4aDftZx.hdErPBpDnMgc2'
};

// === Middleware ===
app.use(express.static(path.join(__dirname, 'public')));
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());
app.set('trust proxy', 1);
app.use(session({
  secret: process.env.SESSION_SECRET || 'mySecretKey',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: true, // kötelező HTTPS miatt
    sameSite: 'none', // külön domainről érkezik a kérés
    httpOnly: true
  }
}));
app.use(passport.initialize());
app.use(passport.session());

// === Passport stratégia ===
passport.use(new LocalStrategy((username, password, done) => {
  if (username !== adminUser.username) {
    return done(null, false, { message: 'Hibás hitelesítő adatok.' });
  }
  bcrypt.compare(password, adminUser.passwordHash, (err, isMatch) => {
    if (err) return done(err);
    if (isMatch) return done(null, adminUser);
    return done(null, false, { message: 'Hibás jelszó.' });
  });
}));

passport.serializeUser((user, done) => {
  done(null, user.id);
});

passport.deserializeUser((id, done) => {
  if (id === adminUser.id) {
    done(null, adminUser);
  } else {
    done(new Error('Felhasználó nem található'), null);
  }
});

// === Bejelentkezés ===
app.post('/login', passport.authenticate('local'), (req, res) => {
  res.json({ message: 'Sikeres bejelentkezés', user: req.user });
});

// === Kijelentkezés ===
app.post('/logout', (req, res) => {
  req.logout(err => {
    if (err) return res.status(500).json({ message: 'Hiba kijelentkezéskor' });
    res.json({ message: 'Sikeres kijelentkezés' });
  });
});

// === Védett route: admin ===
app.get('/admin', (req, res) => {
  if (req.isAuthenticated()) {
    res.json({ message: 'Admin felület elérhető' });
  } else {
    res.status(401).json({ message: 'Nincs jogosultság' });
  }
});

// === WIFI State modell ===
const wifiSchema = new mongoose.Schema({
  state: { type: String, enum: ['on', 'off'], default: 'off' }
});
const WifiState = mongoose.model('WifiState', wifiSchema);

// === Smart Plug állapot lekérése ===
app.get('/api/smartplug', async (req, res) => {
  try {
    const response = await axios.post(
      `https://shelly-172-eu.shelly.cloud/v2/devices/api/get?auth_key=${process.env.SHELLY_AUTH_KEY}`,
      {
        ids: [process.env.SHELLY_DEVICE_ID],
        select: ["status"]
      },
      {
        headers: {
          'Content-Type': 'application/json'
        }
      }
    );

    const isOn = response.data?.[0]?.status?.switch?.[0]?.output;
    res.json({ isOn: isOn === true });

  } catch (err) {
    console.error("❌ Hiba a smart plug állapot lekérdezése során:", err.message);
    res.status(500).json({ message: 'Nem sikerült lekérdezni az állapotot' });
  }
});

// === Smart Plug vezérlés és mentés ===
app.post('/api/smartplug', async (req, res) => {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ message: 'Nincs jogosultság' });
  }

  const { isOn } = req.body;
  const newState = isOn ? 'on' : 'off';

  try {
    let state = await WifiState.findOne();
    if (!state) {
      state = new WifiState({ state: newState });
    } else {
      state.state = newState;
    }
    await state.save();
    console.log(`✅ Smart plug állapota mentve: ${newState}`);
    

    // 🔌 Cloud vezérlés
    await axios.post(`https://shelly-172-eu.shelly.cloud/v2/devices/api/set/switch?auth_key=${process.env.SHELLY_AUTH_KEY}`, {
      id: process.env.SHELLY_DEVICE_ID,
      channel: 0,
      on: newState === "on"
    }, {
      headers: {
        'Content-Type': 'application/json'
      }
    });

    console.log(`🔁 Shelly Cloud kapcsolás sikeres: ${newState}`);
    res.json({ success: true, isOn });
  } catch (err) {
    console.error("❌ Hiba a Cloud vezérlés során:", err.message);
    res.status(500).json({ message: 'Hiba a konnektor vezérlése közben' });
  }
});


// === Server indítás ===
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Szerver fut: http://localhost:${PORT} vagy Renderen éles`);
});
