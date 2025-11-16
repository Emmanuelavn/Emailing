const mongoose = require('mongoose');

const SuppressionSchema = new mongoose.Schema({
  email: { type: String, required: true, lowercase: true, trim: true },
  reason: { type: String, enum: ['unsubscribe', 'bounce', 'manual'], required: true },
  createdAt: { type: Date, default: Date.now }
});

SuppressionSchema.index({ email: 1 }, { unique: true });

module.exports = mongoose.model('Suppression', SuppressionSchema);