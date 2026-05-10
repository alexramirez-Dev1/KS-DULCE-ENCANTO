const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');

// ─── REGISTRO ────────────────────────────────────────────────────────────────
router.post("/register", async (req, res) => {
    try {
        const { name, email, age, password } = req.body;

        if (!name || !email || !password) {
            return res.status(400).json({ message: "Campos obligatorios faltantes" });
        }

        const userExists = await User.findOne({ email });
        if (userExists) {
            return res.status(400).json({ message: "El usuario ya existe" });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const newUser = await User.create({ name, email, age, password: hashedPassword });

        res.status(201).json({
            message: "Usuario registrado correctamente",
            userId: newUser._id
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Error al registrar usuario" });
    }
});

// ─── LOGIN ────────────────────────────────────────────────────────────────────
router.post("/login", async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ message: "Email y contraseña requeridos" });
        }

        const user = await User.findOne({ email });
        if (!user) {
            // BUG ORIGINAL: le faltaba cerrar este if con "}" antes del siguiente bloque
            return res.status(401).json({ message: "Credenciales inválidas" });
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(401).json({ message: "Credenciales inválidas" });
        }

        const token = jwt.sign(
            { userId: user._id, role: user.role },
            process.env.JWT_SECRET,
            { expiresIn: "2h" }
        );

        res.status(200).json({
            message: "Login exitoso",
            token,
            user: { name: user.name, email: user.email, role: user.role }
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Error en el login" });
    }
});

module.exports = router;
