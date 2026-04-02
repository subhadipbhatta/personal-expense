import mongoose from 'mongoose';

const expenseSchema = new mongoose.Schema({
  groupId: {
    type: String,
    required: [true, 'Group ID is required'],
    index: true
  },
  description: {
    type: String,
    required: [true, 'Description is required'],
    trim: true
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
  paidBy: {
    userId: {
      type: String,
      required: [true, 'Payer user ID is required']
    },
    userName: {
      type: String,
      required: [true, 'Payer user name is required']
    }
  },
  splitAmong: [{
    userId: {
      type: String,
      required: true
    },
    userName: {
      type: String,
      required: true
    },
    amount: {
      type: Number,
      required: true,
      min: 0
    },
    settled: {
      type: Boolean,
      default: false
    }
  }],
  totalSettled: {
    type: Number,
    default: 0,
    min: 0
  },
  fullySettled: {
    type: Boolean,
    default: false
  },
  notes: {
    type: String,
    trim: true
  },
  splitwiseExpenseId: {
    type: Number,
    sparse: true
  }
}, {
  timestamps: true
});

// Indexes for common queries
expenseSchema.index({ groupId: 1, fullySettled: 1 });
expenseSchema.index({ groupId: 1, createdAt: -1 });
expenseSchema.index({ 'paidBy.userId': 1 });
expenseSchema.index({ 'splitAmong.userId': 1 });

// Method to check if expense is fully settled
expenseSchema.methods.checkIfSettled = function() {
  const totalOwed = this.splitAmong.reduce((sum, split) => sum + split.amount, 0);
  this.fullySettled = this.totalSettled >= totalOwed;
  return this.fullySettled;
};

// Pre-save hook to validate splitAmong amounts match total
expenseSchema.pre('save', function(next) {
  if (this.splitAmong && this.splitAmong.length > 0) {
    const splitTotal = this.splitAmong.reduce((sum, split) => sum + split.amount, 0);
    // Allow small floating point differences
    if (Math.abs(splitTotal - this.amount) > 0.01) {
      next(new Error(`Split amounts ($${splitTotal.toFixed(2)}) must equal total amount ($${this.amount.toFixed(2)})`));
    }
  }
  next();
});

const Expense = mongoose.model('Expense', expenseSchema);

export default Expense;
