const mongoose = require('mongoose');

// Définition du schéma pour un utilisateur
const UserSchema = new mongoose.Schema({
    username: {
        type: String,
        required: true,
        unique: true, // Chaque nom d'utilisateur doit être unique
        trim: true    // Supprime les espaces en début et fin de chaîne
    },
    email: {
        type: String,
        required: true,
        unique: true, // Chaque email doit être unique
        trim: true,
        lowercase: true, // Stocke l'email en minuscules
        match: [/.+@.+\..+/, 'Veuillez utiliser une adresse email valide'] // Validation du format email
    },
    password: {
        type: String,
        required: true,
        minlength: [6, 'Le mot de passe doit contenir au moins 6 caractères']
    },
    createdAt: {
        type: Date,
        default: Date.now // Définit la date de création par défaut à la date actuelle
    }
});

// Création du modèle 'User' à partir du schéma
// Mongoose créera automatiquement une collection nommée 'users' (en minuscules et au pluriel)
const User = mongoose.model('User', UserSchema);

module.exports = User;