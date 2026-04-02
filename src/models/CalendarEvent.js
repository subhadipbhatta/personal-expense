import mongoose from 'mongoose';

const calendarEventSchema = new mongoose.Schema({
  groupId: {
    type: String,
    required: true,
    index: true
  },
  title: {
    type: String,
    required: true
  },
  description: {
    type: String,
    default: ''
  },
  startTime: {
    type: Date,
    required: true
  },
  endTime: {
    type: Date,
    required: true
  },
  location: {
    type: String,
    default: ''
  },
  createdBy: {
    userId: String,
    userName: String
  },
  attendees: [{
    userId: String,
    userName: String,
    status: {
      type: String,
      enum: ['pending', 'accepted', 'declined'],
      default: 'pending'
    }
  }],
  icsContent: {
    type: String
  },
  cancelled: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true
});

// Index for querying upcoming events
calendarEventSchema.index({ groupId: 1, startTime: 1 });

const CalendarEvent = mongoose.model('CalendarEvent', calendarEventSchema);

export default CalendarEvent;
