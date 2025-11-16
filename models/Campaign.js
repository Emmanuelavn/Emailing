const mongoose = require('mongoose');

const CampaignSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true, trim: true },
  template: { type: mongoose.Schema.Types.ObjectId, ref: 'Template', required: true },
  segmentTags: { type: [String], default: [] },
  status: { type: String, enum: ['draft', 'scheduled', 'running', 'completed'], default: 'draft' },
  scheduledAt: { type: Date },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Campaign', CampaignSchema);