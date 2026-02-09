import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import crypto from "crypto";

const ENCRYPTION_KEY = process.env.API_KEY_ENCRYPTION_SECRET || 'your-32-char-secret-key-here-12345'; // Should be 32 chars
const ALGORITHM = 'aes-256-cbc';

const UserSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true
  },
  password: {
    type: String,
    required: true,
    minlength: 6
  },
  name: {
    type: String,
    required: true,
    trim: true
  },
  isVerified: {
    type: Boolean,
    default: true // For simplicity, setting to true by default
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  lastLogin: {
    type: Date
  },
  encryptedApiKey: {
    type: String,
    default: null // Encrypted Gemini API key
  }
});

// Hash password before saving
UserSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  
  try {
    const salt = await bcrypt.genSalt(12);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Compare password method
UserSchema.methods.comparePassword = async function(password) {
  return await bcrypt.compare(password, this.password);
};

// Encrypt API key
UserSchema.methods.encryptApiKey = function(apiKey) {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, Buffer.from(ENCRYPTION_KEY, 'utf8').slice(0, 32), iv);
  let encrypted = cipher.update(apiKey, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return iv.toString('hex') + ':' + encrypted;
};

// Decrypt API key
UserSchema.methods.decryptApiKey = function() {
  if (!this.encryptedApiKey) return null;
  
  try {
    const textParts = this.encryptedApiKey.split(':');
    const iv = Buffer.from(textParts.shift(), 'hex');
    const encryptedText = textParts.join(':');
    const decipher = crypto.createDecipheriv(ALGORITHM, Buffer.from(ENCRYPTION_KEY, 'utf8').slice(0, 32), iv);
    let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (error) {
    console.error('Error decrypting API key:', error);
    return null;
  }
};

// Set API key (encrypts and stores)
UserSchema.methods.setApiKey = function(apiKey) {
  this.encryptedApiKey = this.encryptApiKey(apiKey);
};

// Remove password and encrypted API key from JSON output
UserSchema.methods.toJSON = function() {
  const user = this.toObject();
  delete user.password;
  delete user.encryptedApiKey;
  return user;
};

const User = mongoose.model('User', UserSchema);

export default User;
