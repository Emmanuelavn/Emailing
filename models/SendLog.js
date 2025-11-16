const mongoose = require('mongoose');

const SendLogSchema = new mongoose.Schema({
  contact: { type: mongoose.Schema.Types.ObjectId, ref: 'Contact' },
  contactEmail: { type: String },
  campaign: { type: mongoose.Schema.Types.ObjectId, ref: 'Campaign' },
  messageId: { type: String },
  status: { type: String, enum: ['queued', 'sent', 'failed'], default: 'queued' },
  error: { type: String },
  attempts: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('SendLog', SendLogSchema);