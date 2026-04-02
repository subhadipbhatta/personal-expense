import mongoose from 'mongoose';

const reminderSchema = new mongoose.Schema({
  groupId: {
    type: String,
    required: true,
    index: true
  },
  message: {
    type: String,
    required: true
  },
  scheduledFor: {
    type: Date,
    required: true,
    index: true
  },
  createdBy: {
    userId: String,
    userName: String
  },
  targetUsers: [{
    userId: String,
    userName: String
  }],
  sent: {
    type: Boolean,
    default: false,
    index: true
  },
  sentAt: {
    type: Date
  },
  cancelled: {
    type: Boolean,
    default: false
  },
  recurring: {
    enabled: {
      type: Boolean,
      default: false
    },
    pattern: {
      type: String,
      enum: ['daily', 'weekly', 'monthly'],
      default: null
    },
    endDate: Date
  }
}, {
  timestamps: true
});

// Compound index for finding pending reminders
reminderSchema.index({ sent: 1, cancelled: 1, scheduledFor: 1 });

const Reminder = mongoose.model('Reminder', reminderSchema);

export default Reminder;
