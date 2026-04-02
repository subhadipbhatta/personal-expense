import mongoose from 'mongoose';

const settlementSchema = new mongoose.Schema({
  groupId: {
    type: String,
    required: [true, 'Group ID is required'],
    index: true
  },
  from: {
    userId: {
      type: String,
      required: [true, 'Sender user ID is required']
    },
    userName: {
      type: String,
      required: [true, 'Sender user name is required']
    }
  },
  to: {
    userId: {
      type: String,
      required: [true, 'Recipient user ID is required']
    },
    userName: {
      type: String,
      required: [true, 'Recipient user name is required']
    }
  },
  amount: {
    type: Number,
    required: [true, 'Amount is required'],
    min: [0.01, 'Amount must be greater than 0'],
    validate: {
      validator: function(value) {
        return value > 0;
      },
      message: 'Amount must be a positive number'
    }
  },
  currency: {
    type: String,
    default: 'USD',
    uppercase: true
  },
  expenseId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Expense'
  },
  note: {
    type: String,
    trim: true
  },
  splitwisePaymentId: {
    type: Number,
    sparse: true
  }
}, {
  timestamps: true
});

// Indexes for common queries
settlementSchema.index({ groupId: 1, createdAt: -1 });
settlementSchema.index({ 'from.userId': 1 });
settlementSchema.index({ 'to.userId': 1 });
settlementSchema.index({ expenseId: 1 });

// Validation: from and to must be different users
settlementSchema.pre('save', function(next) {
  if (this.from.userId === this.to.userId) {
    next(new Error('Cannot settle payment to the same user'));
  }
  next();
});

const Settlement = mongoose.model('Settlement', settlementSchema);

export default Settlement;
