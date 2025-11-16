const mongoose = require('mongoose');

const ContactSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
    match: [/.+@.+\..+/, 'Adresse e-mail invalide']
  },
  firstName: { type: String, trim: true },
  lastName: { type: String, trim: true },
  tags: { type: [String], default: [] },
  status: {
    type: String,
    enum: ['active', 'suppressed', 'bounced'],
    default: 'active'
  },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Contact', ContactSchema);