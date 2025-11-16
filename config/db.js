const mongoose = require('mongoose');

const connectDB = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI); // Mongoose 6+ gère les options par défaut, pas besoin de useNewUrlParser, etc.
        console.log('MongoDB Atlas connecté avec succès !');
    } catch (err) {
        console.error('Erreur de connexion à MongoDB Atlas :', err); // <-- MODIFIÉ ICI !
        process.exit(1); // Quitter l'application si la connexion échoue
    }
};

module.exports = connectDB;