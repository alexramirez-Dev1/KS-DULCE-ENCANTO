// index.js — punto de entrada para servir el frontend estático
// Si usas el backend completo, el archivo principal es server.js
const express = require("express");
const cors = require("cors");
const path = require("path");

const app = express();

app.use(cors());
app.use(express.json());

// Archivos estáticos: /public/index.html, registro.html, login.html
app.use(express.static(path.join(__dirname, "public")));

app.get("/",        (req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));
app.get("/registro",(req, res) => res.sendFile(path.join(__dirname, "public", "registro.html")));
app.get("/login",   (req, res) => res.sendFile(path.join(__dirname, "public", "login.html")));

// BUG ORIGINAL: usaba carpeta "Public" con P mayúscula → inconsistente en Linux
// Ahora unificado como "public" (minúsculas) en todos los archivos

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Servidor de KS Dulce Encanto en: http://localhost:${PORT}`);
});
