import colors from 'colors';

// Centralized Logger Class
class Logger {
  static formatTimestamp() {
    return new Date().toISOString();
  }

  static info(message, data = null) {
    console.log(`[${this.formatTimestamp()}] ℹ️  INFO: ${message}`.cyan);
    if (data) console.log(JSON.stringify(data, null, 2).gray);
  }

  static success(message, data = null) {
    console.log(`[${this.formatTimestamp()}] ✅ SUCCESS: ${message}`.green);
    if (data) console.log(JSON.stringify(data, null, 2).gray);
  }

  static warn(message, data = null) {
    console.log(`[${this.formatTimestamp()}] ⚠️  WARNING: ${message}`.yellow);
    if (data) console.log(JSON.stringify(data, null, 2).gray);
  }

  static error(message, error = null) {
    console.log(`[${this.formatTimestamp()}] ❌ ERROR: ${message}`.red);
    if (error) {
      if (error.stack) {
        console.log(error.stack.red);
      } else {
        console.log(JSON.stringify(error, null, 2).red);
      }
    }
  }

  static debug(message, data = null) {
    if (process.env.NODE_ENV === 'development') {
      console.log(`[${this.formatTimestamp()}] 🐛 DEBUG: ${message}`.magenta);
      if (data) console.log(JSON.stringify(data, null, 2).gray);
    }
  }

  static api(method, url, status, duration, data = null) {
    const statusColor = status >= 400 ? 'red' : status >= 300 ? 'yellow' : 'green';
    console.log(`[${this.formatTimestamp()}] 🌐 API: ${method} ${url} - ${status} (${duration}ms)`[statusColor]);
    if (data && process.env.NODE_ENV === 'development') {
      console.log(JSON.stringify(data, null, 2).gray);
    }
  }
}

// Request/Response Logging Middleware
export const requestLogger = (req, res, next) => {
  const start = Date.now();
  const timestamp = Logger.formatTimestamp();
  
  // Log incoming request
  console.log('\n' + '='.repeat(80).cyan);
  console.log(`🔄 [${timestamp}] ${req.method.toUpperCase()} ${req.originalUrl}`.cyan.bold);
  console.log(`📍 IP: ${req.ip || req.connection.remoteAddress}`.gray);
  
  // Log headers (selective)
  if (req.headers['auth-token']) {
    console.log(`🔐 Auth: Token present`.green);
  }
  if (req.headers['content-type']) {
    console.log(`📋 Content-Type: ${req.headers['content-type']}`.gray);
  }
  
  // Log query parameters
  if (Object.keys(req.query).length > 0) {
    console.log(`🔍 Query:`.yellow);
    console.log(JSON.stringify(req.query, null, 2).gray);
  }
  
  // Log request body (for POST, PUT, PATCH)
  if (['POST', 'PUT', 'PATCH'].includes(req.method) && req.body) {
    console.log(`📝 Body:`.yellow);
    // Hide sensitive data
    const safeBody = { ...req.body };
    if (safeBody.password) safeBody.password = '*'.repeat(safeBody.password.length);
    console.log(JSON.stringify(safeBody, null, 2).gray);
  }
  
  // Log route parameters
  if (Object.keys(req.params).length > 0) {
    console.log(`🎯 Params:`.yellow);
    console.log(JSON.stringify(req.params, null, 2).gray);
  }

  // Override res.json to log responses
  const originalJson = res.json;
  const originalSend = res.send;
  
  res.json = function(data) {
    const duration = Date.now() - start;
    const statusColor = res.statusCode >= 400 ? 'red' : res.statusCode >= 300 ? 'yellow' : 'green';
    
    console.log(`📤 Response [${req.method} ${req.originalUrl}] ${res.statusCode} - ${duration}ms`[statusColor]);
    
    // Log response data (truncate if too large)
    if (data) {
      const responseStr = JSON.stringify(data, null, 2);
      if (responseStr.length > 1000) {
        console.log(`📊 Response (truncated):`.gray);
        console.log((responseStr.substring(0, 1000) + '... (truncated)').gray);
      } else {
        console.log(`📊 Response:`.gray);
        console.log(responseStr.gray);
      }
    }
    
    console.log('='.repeat(80).cyan + '\n');
    return originalJson.call(this, data);
  };
  
  res.send = function(data) {
    const duration = Date.now() - start;
    const statusColor = res.statusCode >= 400 ? 'red' : res.statusCode >= 300 ? 'yellow' : 'green';
    
    console.log(`📤 Response [${req.method} ${req.originalUrl}] ${res.statusCode} - ${duration}ms`[statusColor]);
    console.log('='.repeat(80).cyan + '\n');
    return originalSend.call(this, data);
  };
  
  next();
};

// Error Logging Middleware
export const errorLogger = (err, req, res, next) => {
  const timestamp = Logger.formatTimestamp();
  
  console.log('\n' + '💥'.repeat(40).red);
  console.log(`[${timestamp}] ❌ ERROR in ${req.method} ${req.originalUrl}`.red.bold);
  console.log(`📍 IP: ${req.ip || req.connection.remoteAddress}`.gray);
  
  if (err.name) {
    console.log(`🏷️  Error Type: ${err.name}`.red);
  }
  
  if (err.message) {
    console.log(`💬 Message: ${err.message}`.red);
  }
  
  if (err.statusCode || err.status) {
    console.log(`🔢 Status Code: ${err.statusCode || err.status}`.red);
  }
  
  if (err.stack && process.env.NODE_ENV === 'development') {
    console.log(`📚 Stack Trace:`.red);
    console.log(err.stack.red);
  }
  
  // Log request details for debugging
  if (req.body && Object.keys(req.body).length > 0) {
    console.log(`📝 Request Body:`.yellow);
    const safeBody = { ...req.body };
    if (safeBody.password) safeBody.password = '*'.repeat(safeBody.password.length);
    console.log(JSON.stringify(safeBody, null, 2).gray);
  }
  
  if (req.params && Object.keys(req.params).length > 0) {
    console.log(`🎯 Request Params:`.yellow);
    console.log(JSON.stringify(req.params, null, 2).gray);
  }
  
  console.log('💥'.repeat(40).red + '\n');
  
  next(err);
};

export default Logger;
