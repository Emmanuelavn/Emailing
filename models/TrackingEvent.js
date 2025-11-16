const mongoose = require('mongoose');

const TrackingEventSchema = new mongoose.Schema({
  type: { type: String, enum: ['open', 'click'], required: true },
  contact: { type: mongoose.Schema.Types.ObjectId, ref: 'Contact' },
  campaign: { type: mongoose.Schema.Types.ObjectId, ref: 'Campaign' },
  url: { type: String },
  userAgent: { type: String },
  ip: { type: String },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('TrackingEvent', TrackingEventSchema);